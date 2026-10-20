/**
 * XPS IRF Simulator - Fitting functions
 * IRF parameter estimation. The Fermi-edge fit lives in fermiEdge.ts.
 */

import { simulate } from './simulator';
import type { SimulatorParams } from './simulator';
import { differentialEvolution } from './optimization';
import type { OptimizationBounds } from './optimization';

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
