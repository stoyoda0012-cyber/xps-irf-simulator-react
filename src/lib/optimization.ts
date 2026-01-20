/**
 * XPS IRF Simulator - Optimization algorithms
 * Implements Differential Evolution and Levenberg-Marquardt for curve fitting
 */

export interface OptimizationBounds {
  lower: number[];
  upper: number[];
}

export interface DEOptions {
  maxIterations?: number;
  populationSize?: number;
  mutationFactor?: number;  // F: typically 0.5-1.0
  crossoverRate?: number;   // CR: typically 0.7-0.9
  tolerance?: number;
  seed?: number;
  onProgress?: (iteration: number, bestFitness: number) => void;
}

export interface DEResult {
  x: number[];           // Best solution
  fitness: number;       // Best fitness value
  iterations: number;
  converged: boolean;
}

/**
 * Simple seeded random number generator (Mulberry32)
 */
function createRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Differential Evolution optimizer
 * Global optimization algorithm suitable for non-linear, non-convex problems
 */
export function differentialEvolution(
  objective: (x: number[]) => number,
  bounds: OptimizationBounds,
  options: DEOptions = {}
): DEResult {
  const {
    maxIterations = 100,
    populationSize = 15,
    mutationFactor = 0.8,
    crossoverRate = 0.7,
    tolerance = 1e-8,
    seed = 42,
    onProgress,
  } = options;

  const dim = bounds.lower.length;
  const random = createRandom(seed);

  // Initialize population randomly within bounds
  let population: number[][] = [];
  let fitness: number[] = [];

  for (let i = 0; i < populationSize; i++) {
    const individual = bounds.lower.map((low, j) => {
      const high = bounds.upper[j];
      return low + random() * (high - low);
    });
    population.push(individual);
    fitness.push(objective(individual));
  }

  // Find best individual
  let bestIdx = 0;
  let bestFitness = fitness[0];
  for (let i = 1; i < populationSize; i++) {
    if (fitness[i] < bestFitness) {
      bestFitness = fitness[i];
      bestIdx = i;
    }
  }
  let bestIndividual = [...population[bestIdx]];

  let iteration = 0;
  let converged = false;
  let prevBestFitness = bestFitness;

  while (iteration < maxIterations && !converged) {
    for (let i = 0; i < populationSize; i++) {
      // Select three distinct random individuals (not including i)
      const candidates: number[] = [];
      while (candidates.length < 3) {
        const idx = Math.floor(random() * populationSize);
        if (idx !== i && !candidates.includes(idx)) {
          candidates.push(idx);
        }
      }
      const [a, b, c] = candidates;

      // Mutation: create donor vector (DE/rand/1)
      const donor = population[a].map((val, j) => {
        return val + mutationFactor * (population[b][j] - population[c][j]);
      });

      // Ensure donor is within bounds
      for (let j = 0; j < dim; j++) {
        donor[j] = Math.max(bounds.lower[j], Math.min(bounds.upper[j], donor[j]));
      }

      // Crossover: create trial vector
      const trial = population[i].map((val, j) => {
        return random() < crossoverRate || j === Math.floor(random() * dim) ? donor[j] : val;
      });

      // Selection: keep better individual
      const trialFitness = objective(trial);
      if (trialFitness < fitness[i]) {
        population[i] = trial;
        fitness[i] = trialFitness;

        // Update best if necessary
        if (trialFitness < bestFitness) {
          bestFitness = trialFitness;
          bestIndividual = [...trial];
          bestIdx = i;
        }
      }
    }

    iteration++;

    // Progress callback
    if (onProgress) {
      onProgress(iteration, bestFitness);
    }

    // Check convergence
    if (Math.abs(bestFitness - prevBestFitness) < tolerance) {
      converged = true;
    }
    prevBestFitness = bestFitness;
  }

  return {
    x: bestIndividual,
    fitness: bestFitness,
    iterations: iteration,
    converged,
  };
}

/**
 * Levenberg-Marquardt algorithm for nonlinear least squares
 * Used for local refinement after global optimization
 */
export interface LMOptions {
  maxIterations?: number;
  tolerance?: number;
  lambda?: number;         // Initial damping parameter
  lambdaUp?: number;       // Factor to increase lambda
  lambdaDown?: number;     // Factor to decrease lambda
}

export interface LMResult {
  x: number[];             // Optimized parameters
  residuals: number[];     // Final residuals
  jacobian: number[][];    // Final Jacobian matrix
  covariance: number[][];  // Covariance matrix (inverse of J'J)
  iterations: number;
  converged: boolean;
}

/**
 * Compute numerical Jacobian using forward differences
 */
function computeJacobian(
  func: (params: number[]) => number[],
  params: number[],
  delta: number = 1e-7
): number[][] {
  const residuals = func(params);
  const n = residuals.length;
  const p = params.length;
  const jacobian: number[][] = Array(n).fill(null).map(() => Array(p).fill(0));

  for (let j = 0; j < p; j++) {
    const paramsPlus = [...params];
    paramsPlus[j] += delta;
    const residualsPlus = func(paramsPlus);

    for (let i = 0; i < n; i++) {
      jacobian[i][j] = (residualsPlus[i] - residuals[i]) / delta;
    }
  }

  return jacobian;
}

/**
 * Matrix transpose
 */
function _transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const result: number[][] = Array(cols).fill(null).map(() => Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = A[i][j];
    }
  }
  return result;
}

// Suppress unused warnings - kept for potential future use
void _transpose;

/**
 * Matrix multiplication
 */
function _matmul(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const result: number[][] = Array(rowsA).fill(null).map(() => Array(colsB).fill(0));

  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

/**
 * Matrix-vector multiplication
 */
function _matvec(A: number[][], v: number[]): number[] {
  const rows = A.length;
  const cols = A[0].length;
  const result = new Array(rows).fill(0);

  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      sum += A[i][j] * v[j];
    }
    result[i] = sum;
  }
  return result;
}

// Suppress unused warnings - kept for potential future use
void _matvec;
void _matmul;

/**
 * Solve linear system Ax = b using LU decomposition with partial pivoting
 */
function solve(A: number[][], b: number[]): number[] {
  const n = A.length;

  // Create augmented matrix
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    // Check for singular matrix
    if (Math.abs(aug[col][col]) < 1e-12) {
      // Add small regularization
      aug[col][col] = 1e-12;
    }

    // Eliminate
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x;
}

/**
 * Compute matrix inverse using LU decomposition
 */
function inverse(A: number[][]): number[][] {
  const n = A.length;
  const inv: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    const ei = new Array(n).fill(0);
    ei[i] = 1;
    const col = solve(A, ei);
    for (let j = 0; j < n; j++) {
      inv[j][i] = col[j];
    }
  }

  return inv;
}

/**
 * Sum of squared residuals
 */
function sumSquares(residuals: number[]): number {
  return residuals.reduce((sum, r) => sum + r * r, 0);
}

/**
 * Levenberg-Marquardt optimization
 */
export function levenbergMarquardt(
  func: (params: number[]) => number[],  // Returns residuals
  initialParams: number[],
  options: LMOptions = {}
): LMResult {
  const {
    maxIterations = 100,
    tolerance = 1e-8,
    lambda: initialLambda = 0.001,
    lambdaUp = 10,
    lambdaDown = 0.1,
  } = options;

  const p = initialParams.length;
  let params = [...initialParams];
  let residuals = func(params);
  let cost = sumSquares(residuals);
  let lambda = initialLambda;
  let iteration = 0;
  let converged = false;

  let jacobian = computeJacobian(func, params);

  while (iteration < maxIterations && !converged) {
    // Actually compute JTJ properly
    const JTJ_proper: number[][] = Array(p).fill(null).map(() => Array(p).fill(0));
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        let sum = 0;
        for (let k = 0; k < residuals.length; k++) {
          sum += jacobian[k][i] * jacobian[k][j];
        }
        JTJ_proper[i][j] = sum;
      }
    }

    const JTr: number[] = new Array(p).fill(0);
    for (let i = 0; i < p; i++) {
      for (let k = 0; k < residuals.length; k++) {
        JTr[i] += jacobian[k][i] * residuals[k];
      }
    }

    // Add damping: (J'J + lambda * diag(J'J)) * delta = -J'r
    const damped = JTJ_proper.map((row, i) =>
      row.map((val, j) => i === j ? val + lambda * (val + 1e-10) : val)
    );

    // Solve for parameter update
    const negJTr = JTr.map(v => -v);
    let delta: number[];
    try {
      delta = solve(damped, negJTr);
    } catch {
      // If solve fails, increase lambda and continue
      lambda *= lambdaUp;
      iteration++;
      continue;
    }

    // Try new parameters
    const newParams = params.map((p, i) => p + delta[i]);
    const newResiduals = func(newParams);
    const newCost = sumSquares(newResiduals);

    if (newCost < cost) {
      // Accept step
      params = newParams;
      residuals = newResiduals;
      const improvement = cost - newCost;
      cost = newCost;
      lambda *= lambdaDown;
      jacobian = computeJacobian(func, params);

      // Check convergence
      if (improvement < tolerance * cost || Math.max(...delta.map(Math.abs)) < tolerance) {
        converged = true;
      }
    } else {
      // Reject step, increase damping
      lambda *= lambdaUp;
    }

    iteration++;
  }

  // Compute covariance matrix: inv(J'J) * (cost / (n - p))
  const JTJ_final: number[][] = Array(p).fill(null).map(() => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < residuals.length; k++) {
        sum += jacobian[k][i] * jacobian[k][j];
      }
      JTJ_final[i][j] = sum;
    }
  }

  let covariance: number[][];
  try {
    // Add regularization to JTJ to improve numerical stability
    const regularization = 1e-10;
    for (let i = 0; i < p; i++) {
      JTJ_final[i][i] += regularization;
    }

    const variance = cost / Math.max(1, residuals.length - p);
    const invJTJ = inverse(JTJ_final);

    // Check for numerical issues
    const maxVal = Math.max(...invJTJ.flat().map(Math.abs));
    if (!isFinite(maxVal) || maxVal > 1e10) {
      throw new Error('Covariance matrix is ill-conditioned');
    }

    covariance = invJTJ.map(row => row.map(v => v * variance));
  } catch {
    // If inverse fails, estimate covariance from parameter scale
    const scale = cost / Math.max(1, residuals.length - p);
    covariance = Array(p).fill(null).map((_, i) =>
      Array(p).fill(0).map((_, j) => i === j ? scale * 0.01 : 0)
    );
  }

  return {
    x: params,
    residuals,
    jacobian,
    covariance,
    iterations: iteration,
    converged,
  };
}

/**
 * Curve fitting using DE + LM
 * Similar to scipy.optimize.curve_fit
 */
export interface CurveFitOptions {
  useGlobalOpt?: boolean;
  deOptions?: DEOptions;
  lmOptions?: LMOptions;
}

export interface CurveFitResult {
  params: number[];
  paramErrors: number[];
  covariance: number[][];
  residuals: number[];
  rSquared: number;
  converged: boolean;
}

export function curveFit(
  model: (x: number[], params: number[]) => number[],
  xData: number[],
  yData: number[],
  initialParams: number[],
  bounds: OptimizationBounds,
  options: CurveFitOptions = {}
): CurveFitResult {
  const { useGlobalOpt = true, deOptions = {}, lmOptions = {} } = options;

  // Residual function for optimization
  const residualFunc = (params: number[]) => {
    const predicted = model(xData, params);
    return yData.map((y, i) => y - predicted[i]);
  };

  // Objective function (sum of squared residuals)
  const objective = (params: number[]) => {
    const residuals = residualFunc(params);
    return sumSquares(residuals);
  };

  let optimizedParams = initialParams;

  // Step 1: Global optimization with DE (if enabled)
  if (useGlobalOpt) {
    const deResult = differentialEvolution(objective, bounds, {
      ...deOptions,
      maxIterations: deOptions.maxIterations ?? 100,
      populationSize: deOptions.populationSize ?? 15,
    });
    optimizedParams = deResult.x;
  }

  // Step 2: Local refinement with LM
  const lmResult = levenbergMarquardt(residualFunc, optimizedParams, lmOptions);

  // Ensure parameters are within bounds
  const finalParams = lmResult.x.map((p, i) =>
    Math.max(bounds.lower[i], Math.min(bounds.upper[i], p))
  );

  // Compute R-squared
  const yMean = yData.reduce((a, b) => a + b, 0) / yData.length;
  const ssTot = yData.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  const ssRes = sumSquares(lmResult.residuals);
  const rSquared = 1 - ssRes / ssTot;

  // Parameter errors from covariance diagonal
  // Clamp to reasonable values to avoid displaying huge errors
  const paramErrors = lmResult.covariance.map((row, i) => {
    const err = Math.sqrt(Math.abs(row[i]));
    const paramValue = Math.abs(finalParams[i]) + 1e-10;
    // If error is not finite, unreasonably large, or larger than 100x the parameter value
    if (!isFinite(err) || err > 1e6 || err > paramValue * 100) {
      return NaN;  // Will be displayed as "N/A" in UI
    }
    return err;
  });

  return {
    params: finalParams,
    paramErrors,
    covariance: lmResult.covariance,
    residuals: lmResult.residuals,
    rSquared,
    converged: lmResult.converged,
  };
}
