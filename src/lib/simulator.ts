/**
 * XPS IRF Simulator - Main simulation engine
 * Ported from Python xps_twin package
 */

import {
  fermiDirac,
  skewGaussian,
  ellipticalGaussian2D,
  interp,
  convolve,
  gaussianKernel,
  linspace,
  meshgrid,
} from './physics';

export interface SimulatorParams {
  // X-ray Source parameters
  sigmaX: number;      // Spot size X (meV)
  sigmaY: number;      // Spot size Y (mm)
  alpha: number;       // Energy gradient (eV/mm)
  gammaX: number;      // Spot skewness X
  gammaY: number;      // Spot skewness Y

  // Detector parameters
  kappa: number;       // Smile curvature
  theta: number;       // Detector tilt (degrees)
  sigmaRes: number;    // Intrinsic resolution (eV)

  // Measurement parameters
  temp: number;        // Temperature (K)

  // Noise parameters (optional)
  poissonNoise?: number;
  gaussianNoise?: number;
}

export interface SimulationResult {
  energy: number[];           // Energy axis (eV)
  spectrum: number[];         // Observed spectrum (normalized)
  spectrumClean: number[];    // Spectrum without noise
  idealFD: number[];          // Ideal Fermi-Dirac
  irf: number[];              // Instrument Response Function
  image2D: number[][];        // 2D detector image
  spotProfile: number[][];    // 2D spot profile
  yAxis: number[];            // Y axis for 2D images
  // Resolution components (all in meV)
  sigmaSource: number;        // Source resolution
  sigmaDetector: number;      // Detector resolution
  sigmaCombined: number;      // Combined resolution (sqrt of sum of squares)
}

export interface Grid {
  eAxis: number[];
  yAxis: number[];
  E: number[][];
  Y: number[][];
  de: number;
}

/**
 * Create calculation grid
 */
function createGrid(
  eStart: number = -0.1,
  eEnd: number = 0.1,
  eSteps: number = 500,
  yStart: number = -10,
  yEnd: number = 10,
  ySteps: number = 200
): Grid {
  const eAxis = linspace(eStart, eEnd, eSteps);
  const yAxis = linspace(yStart, yEnd, ySteps);
  const { E, Y } = meshgrid(eAxis, yAxis);
  const de = eAxis[1] - eAxis[0];

  return { eAxis, yAxis, E, Y, de };
}

/**
 * Generate 2D emission from X-ray source
 */
function generate2DEmission(
  grid: Grid,
  trueSpectrum: number[],
  sigmaY: number,
  gammaY: number,
  alpha: number
): number[][] {
  const yDistribution = skewGaussian(grid.yAxis, sigmaY, gammaY);
  const rows = grid.yAxis.length;
  const cols = grid.eAxis.length;
  const img: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) {
    const yVal = grid.yAxis[i];
    const shift = alpha * yVal;

    // Shift spectrum
    const shiftedEnergy = grid.eAxis.map(e => e - shift);
    const shiftedSpec = interp(shiftedEnergy, grid.eAxis, trueSpectrum, trueSpectrum[0], 0);

    for (let j = 0; j < cols; j++) {
      img[i][j] = shiftedSpec[j] * yDistribution[i];
    }
  }

  return img;
}

/**
 * Get 2D spot profile
 */
function get2DSpotProfile(
  grid: Grid,
  sigmaX: number,
  sigmaY: number,
  gammaX: number,
  gammaY: number
): number[][] {
  return ellipticalGaussian2D(grid.E, grid.Y, sigmaX, sigmaY, gammaX, gammaY, 0);
}

/**
 * Project 2D image to 1D spectrum through detector
 * Applies both source resolution (sigmaSource) and detector resolution (sigmaDetector)
 */
function projectTo1D(
  grid: Grid,
  image2D: number[][],
  kappa: number,
  theta: number,
  sigmaSource: number,
  sigmaDetector: number
): number[] {
  const thetaRad = (theta * Math.PI) / 180;
  const cosTheta = Math.cos(thetaRad);
  const sinTheta = Math.sin(thetaRad);

  const rows = grid.yAxis.length;
  const cols = grid.eAxis.length;
  const yMax = Math.max(...grid.yAxis.map(Math.abs));

  // Create distorted image via interpolation
  const distortedImg: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const e = grid.E[i][j];
      const y = grid.Y[i][j];
      const yNorm = y / yMax;

      // Apply rotation and curvature
      const eSrc = e * cosTheta + y * sinTheta;
      const ySrc = -e * sinTheta + y * cosTheta;
      const eSrcCurved = eSrc - kappa * (yNorm * yNorm);

      // Bilinear interpolation
      const val = bilinearInterp(grid.yAxis, grid.eAxis, image2D, ySrc, eSrcCurved);
      distortedImg[i][j] = val;
    }
  }

  // Sum along Y axis
  let spec1D = new Array(cols).fill(0);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) {
      spec1D[j] += distortedImg[i][j];
    }
  }

  // Apply source resolution (Gaussian convolution)
  if (sigmaSource > 0) {
    const kernelSource = gaussianKernel(sigmaSource, grid.de);
    spec1D = convolve(spec1D, kernelSource);
  }

  // Apply detector resolution (Gaussian convolution)
  if (sigmaDetector > 0) {
    const kernelDetector = gaussianKernel(sigmaDetector, grid.de);
    spec1D = convolve(spec1D, kernelDetector);
  }

  return spec1D;
}

/**
 * Bilinear interpolation for 2D array
 */
function bilinearInterp(
  yAxis: number[],
  xAxis: number[],
  data: number[][],
  y: number,
  x: number
): number {
  // Find indices
  const yMin = yAxis[0];
  const yMax = yAxis[yAxis.length - 1];
  const xMin = xAxis[0];
  const xMax = xAxis[xAxis.length - 1];

  if (y < yMin || y > yMax || x < xMin || x > xMax) {
    return 0;
  }

  const yStep = (yMax - yMin) / (yAxis.length - 1);
  const xStep = (xMax - xMin) / (xAxis.length - 1);

  const yi = (y - yMin) / yStep;
  const xi = (x - xMin) / xStep;

  const y0 = Math.floor(yi);
  const x0 = Math.floor(xi);
  const y1 = Math.min(y0 + 1, yAxis.length - 1);
  const x1 = Math.min(x0 + 1, xAxis.length - 1);

  const yt = yi - y0;
  const xt = xi - x0;

  const v00 = data[y0]?.[x0] ?? 0;
  const v01 = data[y0]?.[x1] ?? 0;
  const v10 = data[y1]?.[x0] ?? 0;
  const v11 = data[y1]?.[x1] ?? 0;

  return (
    v00 * (1 - xt) * (1 - yt) +
    v01 * xt * (1 - yt) +
    v10 * (1 - xt) * yt +
    v11 * xt * yt
  );
}

/**
 * Add noise to spectrum
 */
function addNoise(
  spectrum: number[],
  poissonLevel: number,
  gaussianLevel: number
): number[] {
  return spectrum.map(val => {
    let noisy = val;

    // Poisson noise (approximated as Gaussian with sqrt(N) std)
    if (poissonLevel > 1e-5) {
      const scaleFactor = 1000.0 / poissonLevel;
      const lambda = val * scaleFactor;
      // Box-Muller for Gaussian approximation of Poisson
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      noisy = (lambda + z * Math.sqrt(Math.max(lambda, 0))) / scaleFactor;
    }

    // Gaussian noise
    if (gaussianLevel > 0) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      noisy += z * (gaussianLevel / 100);
    }

    return Math.max(0, noisy);
  });
}

/**
 * Compute numerical gradient (for IRF extraction)
 */
function gradient(data: number[], dx: number): number[] {
  const n = data.length;
  const result = new Array(n).fill(0);

  // Central difference for interior points
  for (let i = 1; i < n - 1; i++) {
    result[i] = (data[i + 1] - data[i - 1]) / (2 * dx);
  }

  // Forward/backward difference for endpoints
  result[0] = (data[1] - data[0]) / dx;
  result[n - 1] = (data[n - 1] - data[n - 2]) / dx;

  return result;
}

/**
 * Main simulation function
 */
export function simulate(params: SimulatorParams): SimulationResult {
  // Create grid with extended range for proper edge handling
  // Internal calculation uses wider range (-0.15 to 0.15) to avoid edge artifacts
  const gridExtended = createGrid(-0.15, 0.15, 750, -10, 10, 200);
  // Display grid is the standard range
  const grid = createGrid(-0.1, 0.1, 500, -10, 10, 200);

  // Convert units: sigmaX (source resolution) and sigmaRes (detector resolution) are in meV, convert to eV
  const sigmaSourceEV = params.sigmaX / 1000;
  const sigmaDetectorEV = params.sigmaRes / 1000;

  // Calculate combined resolution: sqrt(sigma_source^2 + sigma_detector^2)
  const sigmaCombinedMeV = Math.sqrt(params.sigmaX ** 2 + params.sigmaRes ** 2);

  // 1. Compute ideal Fermi-Dirac distribution on extended grid
  const idealFDExtended = fermiDirac(gridExtended.eAxis, params.temp);

  // 2. Generate 2D emission from X-ray source on extended grid
  const image2DExtended = generate2DEmission(
    gridExtended,
    idealFDExtended,
    params.sigmaY,
    params.gammaY,
    params.alpha
  );

  // 3. Get 2D spot profile (for display, use standard grid)
  const spotProfile = get2DSpotProfile(
    grid,
    sigmaSourceEV,
    params.sigmaY,
    params.gammaX,
    params.gammaY
  );

  // 4. Project to 1D through detector on extended grid
  //    Apply both source and detector resolution convolutions
  const spectrumRawExtended = projectTo1D(
    gridExtended,
    image2DExtended,
    params.kappa,
    params.theta,
    sigmaSourceEV,
    sigmaDetectorEV
  );

  // 5. Trim to display range and interpolate
  const spectrumRaw = interp(grid.eAxis, gridExtended.eAxis, spectrumRawExtended);

  // 6. Normalize
  const maxVal = Math.max(...spectrumRaw);
  const spectrumClean = spectrumRaw.map(v => v / (maxVal + 1e-12));

  // 7. Add noise
  const spectrum = addNoise(
    spectrumClean,
    params.poissonNoise ?? 0,
    params.gaussianNoise ?? 0
  );

  // 8. Compute ideal FD for display range
  const idealFD = fermiDirac(grid.eAxis, params.temp);

  // 9. Extract IRF (simulate at very low temperature and differentiate)
  const stepFD = fermiDirac(gridExtended.eAxis, 0.01);
  const stepImage = generate2DEmission(gridExtended, stepFD, params.sigmaY, params.gammaY, params.alpha);
  const stepSpectrumExtended = projectTo1D(
    gridExtended,
    stepImage,
    params.kappa,
    params.theta,
    sigmaSourceEV,
    sigmaDetectorEV
  );
  const stepSpectrum = interp(grid.eAxis, gridExtended.eAxis, stepSpectrumExtended);

  const irfRaw = gradient(stepSpectrum, grid.de);
  const irfMax = Math.max(...irfRaw.map(Math.abs));
  const irf = irfRaw.map(v => -v / (irfMax + 1e-12));  // Negative for BE direction

  // 10. Generate 2D image for display (use display grid)
  const image2D = generate2DEmission(
    grid,
    idealFD,
    params.sigmaY,
    params.gammaY,
    params.alpha
  );

  return {
    energy: grid.eAxis.map(e => e * 1000),  // Convert to meV
    spectrum,
    spectrumClean,
    idealFD,
    irf,
    image2D,
    spotProfile,
    yAxis: grid.yAxis,
    // Resolution components (in meV)
    sigmaSource: params.sigmaX,
    sigmaDetector: params.sigmaRes,
    sigmaCombined: sigmaCombinedMeV,
  };
}

/**
 * Default parameters
 */
export const defaultParams: SimulatorParams = {
  sigmaX: 0.5,
  sigmaY: 0.5,
  alpha: 0.002,
  gammaX: 0.0,
  gammaY: 0.0,
  kappa: 0.01,
  theta: 0.08,
  sigmaRes: 1.5,
  temp: 5.0,
  poissonNoise: 2.0,
  gaussianNoise: 1.0,
};
