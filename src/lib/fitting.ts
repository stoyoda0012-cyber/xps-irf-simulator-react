/**
 * XPS IRF Simulator - Fitting functions
 * Fermi edge fitting and IRF parameter estimation
 */

import { convolve, gaussianKernel } from './physics';
import { simulate } from './simulator';
import type { SimulatorParams } from './simulator';
import { differentialEvolution, curveFit } from './optimization';
import type { OptimizationBounds } from './optimization';

// Boltzmann constant in eV/K
const KB = 8.617333262e-5;

/**
 * Fermi-Dirac convolved with Gaussian instrument function
 */
export function fermiDiracConvolved(
  energy: number[],
  efShift: number,
  temp: number,
  sigmaTotal: number
): number[] {
  // Energy step size
  const de = Math.abs(energy[1] - energy[0]);

  // Padding to avoid edge effects
  const nPad = Math.max(10, Math.min(1000, Math.ceil(10 * sigmaTotal / de)));

  // Create padded energy axis
  const ePadLeft: number[] = [];
  for (let i = nPad; i > 0; i--) {
    ePadLeft.push(energy[0] - i * de);
  }
  const ePadRight: number[] = [];
  for (let i = 1; i <= nPad; i++) {
    ePadRight.push(energy[energy.length - 1] + i * de);
  }
  const energyPadded = [...ePadLeft, ...energy, ...ePadRight];

  // Compute Fermi-Dirac on padded axis
  const fdPadded = energyPadded.map(e => {
    if (temp < 0.1) {
      return e <= efShift ? 1.0 : 0.0;
    }
    const val = Math.max(-100, Math.min(100, (e - efShift) / (KB * temp)));
    return 1.0 / (Math.exp(val) + 1.0);
  });

  // Create Gaussian kernel
  const kernel = gaussianKernel(sigmaTotal, de);

  // Convolve
  const convolvedFull = convolve(fdPadded, kernel);

  // Extract original range
  return convolvedFull.slice(nPad, nPad + energy.length);
}

/**
 * Fitting function for Fermi edge with temperature fitting
 */
function fermiEdgeModelWithTemp(
  energy: number[],
  params: number[]
): number[] {
  const [efShift, sigmaTotal, temp, amplitude, offset] = params;
  const conv = fermiDiracConvolved(energy, efShift, temp, sigmaTotal);
  return conv.map(v => amplitude * v + offset);
}

/**
 * Fitting function for Fermi edge with fixed temperature
 */
function createFermiEdgeModelFixedTemp(fixedTemp: number) {
  return (energy: number[], params: number[]): number[] => {
    const [efShift, sigmaTotal, amplitude, offset] = params;
    const conv = fermiDiracConvolved(energy, efShift, fixedTemp, sigmaTotal);
    return conv.map(v => amplitude * v + offset);
  };
}

/**
 * Fermi edge fitting result
 */
export interface FermiEdgeFitResult {
  success: boolean;
  efShift: number;
  efShiftError: number;
  sigmaTotal: number;       // Total resolution in eV
  sigmaTotalError: number;
  tempFit: number;
  tempError: number;
  amplitude: number;
  offset: number;
  fittedSpectrum: number[];
  rSquared: number;
  residuals: number[];
  errorMessage?: string;
}

/**
 * Fit Fermi edge spectrum
 *
 * @param energy Energy axis in eV
 * @param observedSpectrum Observed spectrum (normalized)
 * @param temp Initial temperature estimate (K)
 * @param fitTemp Whether to fit temperature as free parameter
 * @param useGlobalOpt Whether to use global optimization (DE) before local
 * @param onProgress Progress callback for DE
 */
export function fitFermiEdge(
  energy: number[],
  observedSpectrum: number[],
  temp: number,
  fitTemp: boolean = true,
  useGlobalOpt: boolean = true,
  onProgress?: (iteration: number, fitness: number) => void
): FermiEdgeFitResult {
  try {
    if (fitTemp) {
      // Fit with temperature as free parameter
      const bounds: OptimizationBounds = {
        lower: [-0.05, 0.0001, 0.1, 0.5, -0.5],   // ef_shift, sigma, temp, amp, offset
        upper: [0.05, 0.05, 300.0, 2.0, 0.5],
      };
      const initialParams = [0.0, 0.005, temp, 1.0, 0.0];

      const result = curveFit(
        fermiEdgeModelWithTemp,
        energy,
        observedSpectrum,
        initialParams,
        bounds,
        {
          useGlobalOpt,
          deOptions: {
            maxIterations: 100,
            populationSize: 15,
            onProgress,
          },
        }
      );

      const [efShift, sigmaTotal, tempFit, amplitude, offset] = result.params;
      const fittedSpectrum = fermiEdgeModelWithTemp(energy, result.params);

      return {
        success: true,
        efShift,
        efShiftError: result.paramErrors[0],
        sigmaTotal,
        sigmaTotalError: result.paramErrors[1],
        tempFit,
        tempError: result.paramErrors[2],
        amplitude,
        offset,
        fittedSpectrum,
        rSquared: result.rSquared,
        residuals: result.residuals,
      };
    } else {
      // Fixed temperature fitting
      const model = createFermiEdgeModelFixedTemp(temp);
      const bounds: OptimizationBounds = {
        lower: [-0.05, 0.0001, 0.5, -0.5],   // ef_shift, sigma, amp, offset
        upper: [0.05, 0.05, 2.0, 0.5],
      };
      const initialParams = [0.0, 0.005, 1.0, 0.0];

      const result = curveFit(
        model,
        energy,
        observedSpectrum,
        initialParams,
        bounds,
        {
          useGlobalOpt,
          deOptions: {
            maxIterations: 100,
            populationSize: 15,
            onProgress,
          },
        }
      );

      const [efShift, sigmaTotal, amplitude, offset] = result.params;
      const fittedSpectrum = model(energy, result.params);

      return {
        success: true,
        efShift,
        efShiftError: result.paramErrors[0],
        sigmaTotal,
        sigmaTotalError: result.paramErrors[1],
        tempFit: temp,
        tempError: 0,
        amplitude,
        offset,
        fittedSpectrum,
        rSquared: result.rSquared,
        residuals: result.residuals,
      };
    }
  } catch (error) {
    return {
      success: false,
      efShift: 0,
      efShiftError: 0,
      sigmaTotal: 0,
      sigmaTotalError: 0,
      tempFit: temp,
      tempError: 0,
      amplitude: 0,
      offset: 0,
      fittedSpectrum: [],
      rSquared: 0,
      residuals: [],
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * IRF parameter estimation result
 */
export interface IRFEstimationResult {
  success: boolean;
  parameters: {
    kappa: number;
    theta: number;
    sigmaRes: number;
    alpha: number;
    sigmaX: number;
    sigmaY: number;
    gammaX: number;
    gammaY: number;
  };
  fittedSpectrum: number[];
  estimatedIRF: number[];
  finalLoss: number;
  iterations: number;
  evaluations: number;
  message: string;
}

/**
 * Default bounds for IRF parameter estimation
 */
export const defaultIRFBounds = {
  kappa: [0.0, 0.1] as [number, number],
  theta: [-0.5, 0.5] as [number, number],
  sigmaRes: [0.1, 10.0] as [number, number],      // meV
  alpha: [-0.01, 0.01] as [number, number],
  sigmaX: [0.01, 5.0] as [number, number],        // meV
  sigmaY: [0.01, 5.0] as [number, number],        // mm
  gammaX: [-5.0, 5.0] as [number, number],
  gammaY: [-10.0, 10.0] as [number, number],
};

/**
 * Estimate IRF parameters from observed spectrum
 *
 * @param observedSpectrum Observed spectrum (normalized)
 * @param temp Temperature (K)
 * @param bounds Parameter bounds
 * @param maxIterations Maximum DE iterations
 * @param onProgress Progress callback
 */
export function estimateIRFParameters(
  observedSpectrum: number[],
  temp: number,
  bounds: typeof defaultIRFBounds = defaultIRFBounds,
  maxIterations: number = 50,
  onProgress?: (iteration: number, loss: number) => void
): IRFEstimationResult {
  // Parameter names and bounds
  const paramNames = ['kappa', 'theta', 'sigmaRes', 'alpha', 'sigmaX', 'sigmaY', 'gammaX', 'gammaY'] as const;
  const boundsArray: OptimizationBounds = {
    lower: paramNames.map(name => bounds[name][0]),
    upper: paramNames.map(name => bounds[name][1]),
  };

  let evaluationCount = 0;

  // Objective function: simulate and compare
  const objective = (params: number[]): number => {
    evaluationCount++;

    const [kappa, theta, sigmaRes, alpha, sigmaX, sigmaY, gammaX, gammaY] = params;

    const simParams: SimulatorParams = {
      kappa,
      theta,
      sigmaRes,
      alpha,
      sigmaX,
      sigmaY,
      gammaX,
      gammaY,
      temp,
      poissonNoise: 0,
      gaussianNoise: 0,
    };

    const result = simulate(simParams);

    // Normalize simulated spectrum
    const maxSim = Math.max(...result.spectrumClean);
    const simNorm = result.spectrumClean.map(v => v / (maxSim + 1e-12));

    // Normalize observed spectrum
    const maxObs = Math.max(...observedSpectrum);
    const obsNorm = observedSpectrum.map(v => v / (maxObs + 1e-12));

    // Mean squared error
    let mse = 0;
    const n = Math.min(simNorm.length, obsNorm.length);
    for (let i = 0; i < n; i++) {
      mse += (obsNorm[i] - simNorm[i]) ** 2;
    }
    mse /= n;

    return mse;
  };

  // Run Differential Evolution
  const deResult = differentialEvolution(objective, boundsArray, {
    maxIterations,
    populationSize: 15,
    seed: 42,
    onProgress,
  });

  // Extract optimal parameters
  const [kappa, theta, sigmaRes, alpha, sigmaX, sigmaY, gammaX, gammaY] = deResult.x;

  // Generate fitted spectrum with optimal parameters
  const optimalParams: SimulatorParams = {
    kappa,
    theta,
    sigmaRes,
    alpha,
    sigmaX,
    sigmaY,
    gammaX,
    gammaY,
    temp,
    poissonNoise: 0,
    gaussianNoise: 0,
  };

  const fittedResult = simulate(optimalParams);
  const maxFitted = Math.max(...fittedResult.spectrumClean);
  const fittedSpectrum = fittedResult.spectrumClean.map(v => v / (maxFitted + 1e-12));

  // Get IRF from fitted result
  const estimatedIRF = fittedResult.irf;

  return {
    success: deResult.converged,
    parameters: {
      kappa,
      theta,
      sigmaRes,
      alpha,
      sigmaX,
      sigmaY,
      gammaX,
      gammaY,
    },
    fittedSpectrum,
    estimatedIRF,
    finalLoss: deResult.fitness,
    iterations: deResult.iterations,
    evaluations: evaluationCount,
    message: deResult.converged ? 'Optimization converged' : 'Maximum iterations reached',
  };
}

/**
 * Calculate theoretical resolution components
 */
export interface ResolutionComponents {
  totalResolution: number;      // Total resolution (meV)
  detectorIntrinsic: number;    // Detector intrinsic resolution
  smileCurvature: number;       // Smile curvature contribution
  detectorTilt: number;         // Detector tilt contribution
  sourceSizeX: number;          // Source size X contribution
  energyGradient: number;       // Energy gradient contribution
  asymmetry: number;            // Asymmetry contribution
}

export function calculateTheoreticalResolution(params: SimulatorParams): ResolutionComponents {
  // Detector intrinsic resolution
  const detectorIntrinsic = params.sigmaRes;

  // Smile curvature contribution (empirical coefficient)
  const smileCurvature = params.kappa * 10;  // Scale factor

  // Detector tilt contribution (empirical coefficient)
  const detectorTilt = Math.abs(params.theta) * 1;  // Scale factor

  // Source size X (already in meV)
  const sourceSizeX = params.sigmaX;

  // Energy gradient contribution (spatial-energy coupling)
  const energyGradient = Math.abs(params.alpha) * params.sigmaY * 100;

  // Asymmetry contribution (RMS combination)
  const asymmetry = Math.sqrt(
    (params.gammaX * 0.01) ** 2 +
    (params.gammaY * 0.01) ** 2
  );

  // Total resolution (quadrature sum)
  const totalResolution = Math.sqrt(
    detectorIntrinsic ** 2 +
    smileCurvature ** 2 +
    detectorTilt ** 2 +
    sourceSizeX ** 2 +
    energyGradient ** 2 +
    asymmetry ** 2
  );

  return {
    totalResolution,
    detectorIntrinsic,
    smileCurvature,
    detectorTilt,
    sourceSizeX,
    energyGradient,
    asymmetry,
  };
}
