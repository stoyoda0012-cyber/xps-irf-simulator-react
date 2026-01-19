/**
 * XPS IRF Simulator - Physics calculations
 * Ported from Python xps_twin package
 */

// Boltzmann constant in eV/K
const KB = 8.617333262e-5;

/**
 * Error function approximation (erf)
 * Using Horner's method for polynomial approximation
 */
export function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Fermi-Dirac distribution
 */
export function fermiDirac(energy: number[], temp: number, ef: number = 0): number[] {
  if (temp < 0.1) {
    return energy.map(e => (e <= ef ? 1.0 : 0.0));
  }
  return energy.map(e => {
    const val = Math.max(-100, Math.min(100, (e - ef) / (KB * temp)));
    return 1.0 / (Math.exp(val) + 1.0);
  });
}

/**
 * Skew Gaussian distribution (1D)
 */
export function skewGaussian(x: number[], sigma: number, gamma: number): number[] {
  const sqrt2pi = Math.sqrt(2 * Math.PI);
  const sqrt2 = Math.sqrt(2);

  return x.map(xi => {
    const phi = Math.exp(-xi * xi / (2 * sigma * sigma)) / (sigma * sqrt2pi);
    const cdf = 0.5 * (1 + erf(gamma * xi / (sigma * sqrt2)));
    return 2 * phi * cdf;
  });
}

/**
 * 2D Elliptical Gaussian distribution with skewness
 */
export function ellipticalGaussian2D(
  E: number[][],
  Y: number[][],
  sigmaX: number,
  sigmaY: number,
  gammaX: number = 0,
  gammaY: number = 0,
  rotation: number = 0
): number[][] {
  const theta = (rotation * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const sqrt2 = Math.sqrt(2);

  const rows = E.length;
  const cols = E[0].length;
  const result: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0));
  let sum = 0;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const x = E[i][j];
      const y = Y[i][j];

      // Apply rotation
      const xRot = x * cosTheta - y * sinTheta;
      const yRot = x * sinTheta + y * cosTheta;

      // X direction skew Gaussian
      const phiX = Math.exp(-xRot * xRot / (2 * sigmaX * sigmaX));
      const cdfX = 0.5 * (1 + erf(gammaX * xRot / (sigmaX * sqrt2)));
      const distX = 2 * phiX * cdfX;

      // Y direction skew Gaussian
      const phiY = Math.exp(-yRot * yRot / (2 * sigmaY * sigmaY));
      const cdfY = 0.5 * (1 + erf(gammaY * yRot / (sigmaY * sqrt2)));
      const distY = 2 * phiY * cdfY;

      result[i][j] = distX * distY;
      sum += result[i][j];
    }
  }

  // Normalize
  if (sum > 1e-12) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[i][j] /= sum;
      }
    }
  }

  return result;
}

/**
 * Linear interpolation for 1D array
 */
export function interp(
  xNew: number[],
  xOld: number[],
  yOld: number[],
  leftVal?: number,
  rightVal?: number
): number[] {
  const left = leftVal ?? yOld[0];
  const right = rightVal ?? yOld[yOld.length - 1];

  return xNew.map(x => {
    if (x <= xOld[0]) return left;
    if (x >= xOld[xOld.length - 1]) return right;

    // Binary search for interval
    let lo = 0;
    let hi = xOld.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (xOld[mid] <= x) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    // Linear interpolation
    const t = (x - xOld[lo]) / (xOld[hi] - xOld[lo]);
    return yOld[lo] + t * (yOld[hi] - yOld[lo]);
  });
}

/**
 * 1D Convolution with edge padding
 */
export function convolve(data: number[], kernel: number[]): number[] {
  const padSize = Math.floor(kernel.length / 2);
  const n = data.length;
  const result = new Array(n).fill(0);

  // Create padded array (edge mode)
  const padded = new Array(n + 2 * padSize);
  for (let i = 0; i < padSize; i++) {
    padded[i] = data[0];
  }
  for (let i = 0; i < n; i++) {
    padded[padSize + i] = data[i];
  }
  for (let i = 0; i < padSize; i++) {
    padded[padSize + n + i] = data[n - 1];
  }

  // Convolution
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < kernel.length; k++) {
      sum += padded[i + k] * kernel[k];
    }
    result[i] = sum;
  }

  return result;
}

/**
 * Create a Gaussian kernel
 */
export function gaussianKernel(sigma: number, de: number): number[] {
  const width = Math.ceil(5 * sigma / de);
  if (width <= 0) return [1];

  const kernel: number[] = [];
  let sum = 0;
  for (let i = -width; i <= width; i++) {
    const x = i * de;
    const val = Math.exp(-x * x / (2 * sigma * sigma));
    kernel.push(val);
    sum += val;
  }

  // Normalize
  return kernel.map(v => v / sum);
}

/**
 * Create linspace array
 */
export function linspace(start: number, end: number, num: number): number[] {
  const step = (end - start) / (num - 1);
  return Array.from({ length: num }, (_, i) => start + i * step);
}

/**
 * Create 2D meshgrid
 */
export function meshgrid(xAxis: number[], yAxis: number[]): { E: number[][]; Y: number[][] } {
  const rows = yAxis.length;
  const cols = xAxis.length;
  const E: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0));
  const Y: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      E[i][j] = xAxis[j];
      Y[i][j] = yAxis[i];
    }
  }

  return { E, Y };
}
