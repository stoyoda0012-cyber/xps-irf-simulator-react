/**
 * Fermi-edge model and least-squares fit, for measured or simulated spectra.
 *
 * Works on an internal energy axis x in eV on which the occupied states lie
 * at LOWER x (kinetic energy, or E - E_F). A binding-energy axis is mapped
 * to x = -BE before fitting (see spectrumImport.ts).
 *
 *   I(x) = A * [ D(x') f(x'; E_F, T) ] (x) G(FWHM)  +  b0 + b1 (x - x_ref)
 *
 *   f      Fermi-Dirac occupation at temperature T
 *   D(x')  1 + c1 * max(E_F - x', 0): DOS slope on the occupied side only
 *   G      Gaussian instrumental broadening with full width FWHM
 *
 * Same model as toyomacro.fitting.fermi_edge (dos_form='occupied'). The
 * Gaussian convolution is done without a grid: when sigma >= kT the thermal
 * edge is written as a mixture of sharp steps at E_F + kT*s (logistic
 * weights), each broadened analytically with the normal CDF; when kT > sigma
 * the occupation is averaged over Gaussian nodes. Both are trapezoid sums of
 * smooth, fast-decaying integrands and agree to ~1e-10 at kT = sigma.
 *
 * A, A*c1, b0 and b1 enter linearly, so they are solved exactly for every
 * trial (E_F, FWHM[, T]) (variable projection); Levenberg-Marquardt only
 * iterates over those two or three. Uncertainties come from the full
 * Jacobian of all parameters at the optimum, scaled by the reduced
 * chi-square: 1-sigma, statistical only, and they assume the model is right.
 *
 * This module has no imports so it can run in a worker, in tests, or in Node.
 */

/** Boltzmann constant, eV/K (CODATA 2018) */
export const KB_EV = 8.617333262e-5;
/** FWHM / sigma of a Gaussian */
export const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.LN2);

export type DosModel = 'flat' | 'linear';
export type BackgroundModel = 'constant' | 'linear';
export type Weighting = 'uniform' | 'poisson';

export interface FermiFitOptions {
  /** Sample temperature, K: fixed value, or start value when fitTemperature */
  temperature: number;
  fitTemperature: boolean;
  dos: DosModel;
  background: BackgroundModel;
  /** 'poisson' weights each point by 1/max(I, 1); only meaningful for raw counts */
  weighting: Weighting;
  /** Optional starting FWHM, eV (detected from the data when omitted) */
  fwhmInit?: number;
}

export const defaultFitOptions: FermiFitOptions = {
  temperature: 300,
  fitTemperature: false,
  dos: 'linear',
  background: 'constant',
  weighting: 'uniform',
};

/** Why a fit should not be trusted as is. Codes map to i18n strings. */
export type FitWarningCode =
  | 'tooFewPoints'
  | 'edgeInverted'
  | 'atBound'
  | 'nonFiniteError'
  | 'efOutsideWindow'
  | 'efUndetermined'
  | 'resolutionBelowChannel'
  | 'tempResolutionDegenerate'
  | 'notConverged';

export interface FitWarning {
  code: FitWarningCode;
  /** Parameter name for 'atBound' */
  param?: 'ef' | 'fwhm' | 'temperature';
}

export interface FermiFitResult {
  /** True when the fit converged and passed every sanity check */
  success: boolean;
  warnings: FitWarning[];
  /** E_F on the internal axis (eV) */
  ef: number;
  efErr: number;
  /** Gaussian FWHM, eV */
  fwhm: number;
  fwhmErr: number;
  /** K; temperatureErr is NaN when the temperature was held fixed */
  temperature: number;
  temperatureErr: number;
  temperatureFitted: boolean;
  amplitude: number;
  amplitudeErr: number;
  /** DOS slope c1, 1/eV (0 and NaN error for a flat DOS) */
  dosSlope: number;
  dosSlopeErr: number;
  bgConst: number;
  /** Background slope per eV (0 for a constant background) */
  bgSlope: number;
  /** Correlation between FWHM and T (NaN unless T is fitted) */
  corrFwhmTemp: number;
  /** 10-90 % width of the fitted edge on a flat DOS, eV */
  width1090: number;
  reducedChi2: number;
  rSquared: number;
  nPoints: number;
  nParams: number;
  iterations: number;
  /** Points inside the fit window, ascending internal axis */
  x: number[];
  y: number[];
  fit: number[];
  background: number[];
  /** data - fit */
  residuals: number[];
  /** (data - fit) * sqrt(weight): standardized when weights are 1/variance */
  weightedResiduals: number[];
  weighting: Weighting;
  dos: DosModel;
  backgroundModel: BackgroundModel;
}

// ---------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/** Complementary error function, fractional error < 1.2e-7 (Numerical Recipes erfcc) */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(
    -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277))))))))
  );
  return x >= 0 ? r : 2 - r;
}

function normCdf(z: number): number {
  return 0.5 * erfc(-z * Math.SQRT1_2);
}

function normPdf(z: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * z * z);
}

// ---------------------------------------------------------------------------
// Quadrature nodes (fixed, so the model is a smooth function of its parameters)
// ---------------------------------------------------------------------------

interface Nodes {
  at: Float64Array;
  w: Float64Array;
}

function makeNodes(half: number, step: number, density: (s: number) => number): Nodes {
  const n = Math.round((2 * half) / step) + 1;
  const at = new Float64Array(n);
  const w = new Float64Array(n);
  let sum = 0;
  for (let k = 0; k < n; k++) {
    at[k] = -half + k * step;
    w[k] = density(at[k]);
    sum += w[k];
  }
  for (let k = 0; k < n; k++) w[k] /= sum;
  return { at, w };
}

// Logistic density of the thermal smearing, in units of kT: -df/dx
const LOGISTIC = makeNodes(28, 0.5, s => 1 / (2 + 2 * Math.cosh(s)));
// Standard normal density, in units of sigma
const GAUSS = makeNodes(8.5, 0.25, t => Math.exp(-0.5 * t * t));

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface EdgeBasis {
  /** [f (x) G](x): broadened occupation, 1 deep below E_F, 0 above */
  flat: Float64Array;
  /** [max(E_F - x', 0) f (x) G](x): what the DOS slope c1 multiplies */
  slope: Float64Array;
}

/**
 * Broadened Fermi edge with unit height, and the term the DOS slope adds.
 * x: internal axis (eV, occupied side at lower x), any order.
 */
export function edgeBasis(
  x: ArrayLike<number>,
  ef: number,
  fwhm: number,
  temperature: number
): EdgeBasis {
  const n = x.length;
  const flat = new Float64Array(n);
  const slope = new Float64Array(n);
  const sigma = Math.max(fwhm, 0) / FWHM_PER_SIGMA;
  const kT = KB_EV * Math.max(temperature, 0);

  if (sigma < 1e-12 && kT < 1e-12) {
    for (let i = 0; i < n; i++) {
      const d = ef - x[i];
      flat[i] = d > 0 ? 1 : d === 0 ? 0.5 : 0;
      slope[i] = Math.max(d, 0);
    }
    return { flat, slope };
  }

  if (sigma >= kT) {
    // Sharp steps at a = E_F + kT*s, each convolved analytically:
    //   step:  Phi(za),                       za = (a - x)/sigma
    //   slope: a <= E_F: (E_F - a) Phi(za) + sigma (za Phi(za) + phi(za))
    //          a >  E_F: sigma (zE Phi(zE) + phi(zE)),  zE = (E_F - x)/sigma
    const single = kT < 1e-9 * sigma;
    const at = single ? [0] : LOGISTIC.at;
    const w = single ? [1] : LOGISTIC.w;
    let wAbove = 0;
    for (let k = 0; k < at.length; k++) if (at[k] > 0) wAbove += w[k];
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const zE = (ef - xi) / sigma;
      const above = sigma * (zE * normCdf(zE) + normPdf(zE));
      let fsum = 0;
      let ssum = wAbove * above;
      for (let k = 0; k < at.length; k++) {
        const s = at[k];
        const a = ef + kT * s;
        const za = (a - xi) / sigma;
        const cdf = normCdf(za);
        fsum += w[k] * cdf;
        if (s <= 0) ssum += w[k] * ((ef - a) * cdf + sigma * (za * cdf + normPdf(za)));
      }
      flat[i] = fsum;
      slope[i] = ssum;
    }
    return { flat, slope };
  }

  // kT > sigma: average the (smooth) occupation over Gaussian nodes.
  // u+ f(u) (u = E_F - x') has a kink at u = 0; its first two Taylor terms,
  // u+/2 and (u+)^2/(4kT), are convolved analytically and only the smooth
  // remainder goes through the node sum.
  const single = sigma < 1e-9 * kT;
  const at = single ? [0] : GAUSS.at;
  const w = single ? [1] : GAUSS.w;
  const c2 = 1 / (4 * kT);
  for (let i = 0; i < n; i++) {
    let fsum = 0;
    let rsum = 0;
    for (let k = 0; k < at.length; k++) {
      const u = ef - (x[i] + sigma * at[k]);
      const f = 1 / (1 + Math.exp(Math.max(-700, Math.min(700, -u / kT))));
      fsum += w[k] * f;
      if (u > 0) rsum += w[k] * u * (f - 0.5 - c2 * u);
    }
    let m1: number;
    let m2: number;
    if (single) {
      const u = Math.max(ef - x[i], 0);
      m1 = u;
      m2 = u * u;
    } else {
      // E[u+] and E[(u+)^2] for u ~ N(E_F - x, sigma^2)
      const z = (ef - x[i]) / sigma;
      const cdf = normCdf(z);
      const pdf = normPdf(z);
      m1 = sigma * (z * cdf + pdf);
      m2 = sigma * sigma * ((z * z + 1) * cdf + z * pdf);
    }
    flat[i] = fsum;
    slope[i] = 0.5 * m1 + c2 * m2 + rsum;
  }
  return { flat, slope };
}

export interface EdgeParams {
  ef: number;
  fwhm: number;
  temperature: number;
  amplitude: number;
  dosSlope?: number;
  bgConst?: number;
  bgSlope?: number;
  /** Pivot of the background slope (default 0) */
  xRef?: number;
}

/** Full model I(x) on the internal axis. */
export function fermiEdgeModel(x: ArrayLike<number>, p: EdgeParams): Float64Array {
  const { flat, slope } = edgeBasis(x, p.ef, p.fwhm, p.temperature);
  const c1 = p.dosSlope ?? 0;
  const b0 = p.bgConst ?? 0;
  const b1 = p.bgSlope ?? 0;
  const ref = p.xRef ?? 0;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    out[i] = p.amplitude * (flat[i] + c1 * slope[i]) + b0 + b1 * (x[i] - ref);
  }
  return out;
}

/** 10-90 % width of a unit edge (flat DOS), eV. */
export function edgeWidth1090(fwhm: number, temperature: number): number {
  const half = 4 * fwhm + 20 * KB_EV * Math.max(temperature, 0) + 1e-9;
  const n = 4001;
  const grid = new Float64Array(n);
  for (let i = 0; i < n; i++) grid[i] = -half + (2 * half * i) / (n - 1);
  const { flat } = edgeBasis(grid, 0, fwhm, temperature);
  // flat falls from 1 to 0 along the grid
  const crossing = (level: number) => {
    for (let i = 1; i < n; i++) {
      if (flat[i] <= level && flat[i - 1] > level) {
        const t = (flat[i - 1] - level) / (flat[i - 1] - flat[i]);
        return grid[i - 1] + t * (grid[i] - grid[i - 1]);
      }
    }
    return NaN;
  };
  return crossing(0.1) - crossing(0.9);
}

// ---------------------------------------------------------------------------
// Small dense linear algebra
// ---------------------------------------------------------------------------

/** Solve A x = b (A small, symmetric positive semi-definite) with partial pivoting. */
function solveSmall(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

/**
 * Inverse of a symmetric positive-definite matrix after scaling it to unit
 * diagonal (so parameters of very different size stay well conditioned).
 * Returns null when the matrix is singular.
 */
function invertScaled(A: number[][]): number[][] | null {
  const n = A.length;
  const d = A.map((row, i) => Math.sqrt(row[i]));
  if (d.some(v => !(v > 0) || !Number.isFinite(v))) return null;
  const S = A.map((row, i) => row.map((v, j) => v / (d[i] * d[j])));
  const inv: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    const col = solveSmall(S, e);
    if (!col) return null;
    for (let i = 0; i < n; i++) inv[i][j] = col[i] / (d[i] * d[j]);
  }
  // Reject a numerically singular result (scaled condition number too large)
  for (let i = 0; i < n; i++) {
    if (!(inv[i][i] > 0) || inv[i][i] * A[i][i] > 1e12) return null;
  }
  return inv;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Weighted linear least squares: minimise sum (sw*(C beta - y))^2. */
function linearFit(cols: Float64Array[], y: Float64Array, sw: Float64Array): number[] | null {
  const m = cols.length;
  const wc = cols.map(c => c.map((v, i) => v * sw[i]));
  const wy = y.map((v, i) => v * sw[i]);
  const A = wc.map(ci => wc.map(cj => dot(ci, cj)));
  const b = wc.map(ci => dot(ci, wy));
  // Unit-diagonal scaling keeps columns of different magnitude well conditioned
  const d = A.map((row, i) => Math.sqrt(row[i]) || 1);
  const As = A.map((row, i) => row.map((v, j) => v / (d[i] * d[j])));
  const bs = b.map((v, i) => v / d[i]);
  for (let i = 0; i < m; i++) As[i][i] += 1e-13;
  const xs = solveSmall(As, bs);
  return xs ? xs.map((v, i) => v / d[i]) : null;
}

// ---------------------------------------------------------------------------
// Starting values
// ---------------------------------------------------------------------------

export interface EdgeGuess {
  /** Steepest falling point of the smoothed data (internal axis) */
  ef: number;
  /** 10-90 % width of the smoothed edge, eV (NaN if not found) */
  width1090: number;
  /** Mean level on the occupied (low x) and unoccupied (high x) ends */
  occupiedLevel: number;
  unoccupiedLevel: number;
  /** Median point spacing, eV */
  step: number;
}

/** Locate the edge in data sorted by ascending internal x. */
export function guessEdge(x: ArrayLike<number>, y: ArrayLike<number>): EdgeGuess {
  const n = x.length;
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) diffs.push(x[i] - x[i - 1]);
  diffs.sort((a, b) => a - b);
  const step = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;

  // Moving average over ~2.5 % of the points (at least 3)
  const half = Math.max(1, Math.round(n / 80));
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(n - 1, i + half); k++) {
      s += y[k];
      c++;
    }
    ys[i] = s / c;
  }
  const nEnd = Math.max(3, Math.floor(n / 10));
  let occ = 0;
  let unocc = 0;
  for (let i = 0; i < nEnd; i++) {
    occ += ys[i];
    unocc += ys[n - 1 - i];
  }
  occ /= nEnd;
  unocc /= nEnd;

  // Steepest fall (or rise, if the edge is inverted) away from the ends
  const sign = occ >= unocc ? 1 : -1;
  let best = Math.floor(n / 2);
  let bestG = -Infinity;
  for (let i = half + 1; i < n - half - 1; i++) {
    const g = (-sign * (ys[i + 1] - ys[i - 1])) / (x[i + 1] - x[i - 1]);
    if (g > bestG) {
      bestG = g;
      best = i;
    }
  }
  const ef = x[best];

  // 10 % and 90 % crossings walking outward from the steepest point
  const amp = occ - unocc;
  let width1090 = NaN;
  if (amp !== 0) {
    const level = (frac: number) => unocc + frac * amp;
    const frac = (i: number) => (ys[i] - unocc) / amp;
    let i90 = best;
    while (i90 > 0 && frac(i90) < 0.9) i90--;
    let i10 = best;
    while (i10 < n - 1 && frac(i10) > 0.1) i10++;
    const interp = (i: number, lv: number) => {
      const j = Math.min(n - 1, i + 1);
      const den = ys[j] - ys[i];
      return den === 0 ? x[i] : x[i] + ((lv - ys[i]) / den) * (x[j] - x[i]);
    };
    const x90 = i90 < n - 1 ? interp(i90, level(0.9)) : x[i90];
    const x10 = i10 > 0 ? interp(i10 - 1, level(0.1)) : x[i10];
    if (x10 > x90) width1090 = x10 - x90;
  }
  return { ef, width1090, occupiedLevel: occ, unoccupiedLevel: unocc, step };
}

/**
 * Default fit window: about 1.2 eV either side of the Fermi edge, found from
 * the empty (high x) side, as toyomacro's example 06 does. The steepest rise
 * of a valence band is often not the Fermi edge (Au 5d rises more steeply
 * ~2 eV deeper), so walk in from the unoccupied end to the first point that
 * clearly leaves the baseline, then take the steepest point near it.
 * Data must be sorted by ascending internal x.
 */
export function autoFitWindow(x: ArrayLike<number>, y: ArrayLike<number>): { lo: number; hi: number; center: number; half: number } {
  const n = x.length;
  const g = guessEdge(x, y);
  let center = g.ef;
  const half = 1.2;
  if (n >= 20 && g.occupiedLevel > g.unoccupiedLevel) {
    const k = Math.max(1, Math.round(n / 80));
    const ys = Array.from({ length: n }, (_, i) => {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) {
        s += y[j];
        c++;
      }
      return s / c;
    });
    const nBase = Math.max(5, Math.floor(n / 10));
    const base = ys.slice(n - k - nBase, n - k);
    const mean = base.reduce((a, v) => a + v, 0) / base.length;
    const sd = Math.sqrt(base.reduce((a, v) => a + (v - mean) ** 2, 0) / base.length);
    const threshold = mean + Math.max(10 * sd, 0.1 * (g.occupiedLevel - mean));
    let onset = -1;
    for (let i = n - 1 - k; i >= k; i--) {
      if (ys[i] > threshold) {
        onset = i;
        break;
      }
    }
    if (onset >= 0) {
      // Steepest fall within 0.5 eV below and 0.2 eV above the onset
      let best = onset;
      let bestG = -Infinity;
      for (let i = 1; i < n - 1; i++) {
        if (x[i] < x[onset] - 0.5 || x[i] > x[onset] + 0.2) continue;
        const grad = -(ys[i + 1] - ys[i - 1]) / (x[i + 1] - x[i - 1]);
        if (grad > bestG) {
          bestG = grad;
          best = i;
        }
      }
      center = x[best];
    }
  }
  return { lo: Math.max(x[0], center - half), hi: Math.min(x[n - 1], center + half), center, half };
}

/** Starting FWHM from a measured 10-90 % width, removing the thermal part. */
function fwhmFromWidth(width1090: number, temperature: number, step: number): number {
  // Gaussian step: 10-90 % width = 2*1.2816 sigma = 1.0885 FWHM; thermal: 2 ln9 kT
  const thermal = 2 * Math.log(9) * KB_EV * Math.max(temperature, 0);
  const w2 = width1090 * width1090 - thermal * thermal;
  const g = w2 > 0 ? Math.sqrt(w2) / 1.0885 : 0;
  return Math.max(g, 2 * step, 1e-6);
}

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------

interface Problem {
  x: Float64Array;          // centred internal axis, ascending
  y: Float64Array;
  sw: Float64Array;         // sqrt(weights)
  dos: DosModel;
  background: BackgroundModel;
  fitTemperature: boolean;
  temperature: number;      // fixed value when not fitted
}

function unpackTheta(pr: Problem, theta: number[]) {
  return {
    ef: theta[0],
    fwhm: Math.exp(theta[1]),
    temperature: pr.fitTemperature ? Math.exp(theta[2]) : pr.temperature,
  };
}

function columns(pr: Problem, ef: number, fwhm: number, temperature: number): Float64Array[] {
  const { flat, slope } = edgeBasis(pr.x, ef, fwhm, temperature);
  const cols = [flat];
  if (pr.dos === 'linear') cols.push(slope);
  cols.push(new Float64Array(pr.x.length).fill(1));
  if (pr.background === 'linear') cols.push(Float64Array.from(pr.x));
  return cols;
}

/** Projected residuals sw*(C beta(theta) - y), with beta solved exactly. */
function projected(pr: Problem, theta: number[]): { r: Float64Array; beta: number[] | null } {
  const { ef, fwhm, temperature } = unpackTheta(pr, theta);
  const cols = columns(pr, ef, fwhm, temperature);
  const beta = linearFit(cols, pr.y, pr.sw);
  const r = new Float64Array(pr.x.length);
  if (!beta) {
    r.fill(Number.MAX_VALUE / 1e10);
    return { r, beta };
  }
  for (let i = 0; i < r.length; i++) {
    let m = 0;
    for (let k = 0; k < cols.length; k++) m += beta[k] * cols[k][i];
    r[i] = pr.sw[i] * (m - pr.y[i]);
  }
  return { r, beta };
}

interface LMOutcome {
  theta: number[];
  cost: number;
  iterations: number;
  converged: boolean;
}

/** Projected Levenberg-Marquardt over the 2-3 nonlinear parameters. */
function minimise(pr: Problem, theta0: number[], lo: number[], hi: number[], h: number[]): LMOutcome {
  const p = theta0.length;
  const clamp = (t: number[]) => t.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
  let theta = clamp(theta0);
  let r = projected(pr, theta).r;
  let cost = dot(r, r);
  let lambda = 1e-3;
  let converged = false;
  let it = 0;

  for (; it < 200 && !converged; it++) {
    // Central-difference Jacobian (one-sided at a bound)
    const J: Float64Array[] = [];
    for (let j = 0; j < p; j++) {
      const up = [...theta];
      const dn = [...theta];
      up[j] = Math.min(hi[j], theta[j] + h[j]);
      dn[j] = Math.max(lo[j], theta[j] - h[j]);
      const ru = projected(pr, up).r;
      const rd = projected(pr, dn).r;
      const span = up[j] - dn[j];
      J.push(ru.map((v, i) => (v - rd[i]) / span));
    }
    const A = J.map(a => J.map(b => dot(a, b)));
    const g = J.map(a => dot(a, r));

    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const damped = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-300 : v)));
      const delta = solveSmall(damped, g.map(v => -v));
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const trial = clamp(theta.map((v, i) => v + delta[i]));
      const rt = projected(pr, trial).r;
      const ct = dot(rt, rt);
      if (ct < cost) {
        const rel = (cost - ct) / Math.max(cost, 1e-300);
        const moved = trial.some((v, i) => Math.abs(v - theta[i]) > 1e-3 * h[i]);
        theta = trial;
        r = rt;
        cost = ct;
        lambda = Math.max(lambda / 10, 1e-12);
        improved = true;
        if (rel < 1e-12 || !moved) converged = true;
        break;
      }
      lambda *= 10;
      if (lambda > 1e14) break;
    }
    if (!improved) {
      // No downhill step at any damping: a (possibly constrained) minimum
      converged = true;
    }
  }
  return { theta, cost, iterations: it, converged };
}

function failure(x: number[], y: number[], opts: FermiFitOptions, code: FitWarningCode): FermiFitResult {
  return {
    success: false,
    warnings: [{ code }],
    ef: NaN, efErr: NaN, fwhm: NaN, fwhmErr: NaN,
    temperature: opts.temperature, temperatureErr: NaN, temperatureFitted: opts.fitTemperature,
    amplitude: NaN, amplitudeErr: NaN, dosSlope: NaN, dosSlopeErr: NaN,
    bgConst: NaN, bgSlope: NaN, corrFwhmTemp: NaN, width1090: NaN,
    reducedChi2: NaN, rSquared: NaN, nPoints: x.length, nParams: 0, iterations: 0,
    x, y, fit: [], background: [], residuals: [], weightedResiduals: [],
    weighting: opts.weighting, dos: opts.dos, backgroundModel: opts.background,
  };
}

/**
 * Fit a Fermi edge.
 *
 * @param xIn internal axis (eV, occupied side at lower x), already cut to the fit window
 * @param yIn intensity
 */
export function fitFermiEdge(
  xIn: ArrayLike<number>,
  yIn: ArrayLike<number>,
  options: Partial<FermiFitOptions> = {}
): FermiFitResult {
  const opts: FermiFitOptions = { ...defaultFitOptions, ...options };

  // Sort ascending, drop non-finite points
  const idx: number[] = [];
  for (let i = 0; i < Math.min(xIn.length, yIn.length); i++) {
    if (Number.isFinite(xIn[i]) && Number.isFinite(yIn[i])) idx.push(i);
  }
  idx.sort((a, b) => xIn[a] - xIn[b]);
  const xs = idx.map(i => xIn[i]);
  const ys = idx.map(i => yIn[i]);
  const n = xs.length;
  if (n < 8) return failure(xs, ys, opts, 'tooFewPoints');

  const xMin = xs[0];
  const xMax = xs[n - 1];
  const span = xMax - xMin;
  if (!(span > 0)) return failure(xs, ys, opts, 'tooFewPoints');
  // Centre the axis: E_F near 1480 eV (KE) would otherwise cost precision
  const xc = 0.5 * (xMin + xMax);
  const x = Float64Array.from(xs, v => v - xc);
  const y = Float64Array.from(ys);
  const sw = Float64Array.from(ys, v => (opts.weighting === 'poisson' ? 1 / Math.sqrt(Math.max(v, 1)) : 1));

  const nonlinearCount = opts.fitTemperature ? 3 : 2;
  const linearCount = 2 + (opts.dos === 'linear' ? 1 : 0) + (opts.background === 'linear' ? 1 : 0);
  const nParams = nonlinearCount + linearCount;
  if (n <= nParams + 2) return failure(xs, ys, opts, 'tooFewPoints');

  const pr: Problem = {
    x, y, sw,
    dos: opts.dos,
    background: opts.background,
    fitTemperature: opts.fitTemperature,
    temperature: Math.max(opts.temperature, 0),
  };

  // --- starting values and bounds ---
  const guess = guessEdge(x, y);
  const warnings: FitWarning[] = [];
  if (guess.occupiedLevel <= guess.unoccupiedLevel) warnings.push({ code: 'edgeInverted' });
  const step = guess.step > 0 ? guess.step : span / n;
  const fwhmLo = Math.max(1e-6, 0.05 * step);
  const fwhmHi = span;
  const tLo = 1;
  const tHi = 3000;
  const fwhm0 = Math.min(
    fwhmHi * 0.5,
    opts.fwhmInit && opts.fwhmInit > 0
      ? opts.fwhmInit
      : Number.isFinite(guess.width1090)
        ? fwhmFromWidth(guess.width1090, opts.temperature, step)
        : span / 10
  );
  const lo = [x[0], Math.log(fwhmLo)];
  const hi = [x[n - 1], Math.log(fwhmHi)];
  const h = [1e-5 * Math.max(fwhm0, KB_EV * opts.temperature, step), 1e-5];
  if (opts.fitTemperature) {
    lo.push(Math.log(tLo));
    hi.push(Math.log(tHi));
    h.push(1e-5);
  }
  const t0 = Math.min(tHi, Math.max(tLo, opts.temperature || 300));

  // --- multi-start projected LM ---
  const starts: number[][] = [1, 0.4, 2.5].map(f => {
    const s = [guess.ef, Math.log(Math.min(fwhmHi, Math.max(fwhmLo, fwhm0 * f)))];
    if (opts.fitTemperature) s.push(Math.log(t0));
    return s;
  });
  let best: LMOutcome | null = null;
  for (const s of starts) {
    const out = minimise(pr, s, lo, hi, h);
    if (!best || out.cost < best.cost) best = out;
  }
  const sol = best!;
  const { ef, fwhm, temperature } = unpackTheta(pr, sol.theta);
  const { r, beta } = projected(pr, sol.theta);
  if (!beta) return failure(xs, ys, opts, 'nonFiniteError');

  // --- full model pieces at the optimum ---
  const cols = columns(pr, ef, fwhm, temperature);
  const model = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = 0; k < cols.length; k++) m += beta[k] * cols[k][i];
    model[i] = m;
  }
  let k = 0;
  const amplitude = beta[k++];
  const a2 = opts.dos === 'linear' ? beta[k++] : 0;
  const bgConst = beta[k++];
  const bgSlope = opts.background === 'linear' ? beta[k++] : 0;

  // --- covariance from the full Jacobian (natural units) ---
  const modelAt = (efv: number, fw: number, tv: number) => {
    const c = columns(pr, efv, fw, tv);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let q = 0; q < c.length; q++) m += beta[q] * c[q][i];
      out[i] = m;
    }
    return out;
  };
  const jac: Float64Array[] = [];
  const hEf = h[0];
  const hFw = 1e-5 * fwhm;
  const mEf1 = modelAt(ef + hEf, fwhm, temperature);
  const mEf0 = modelAt(ef - hEf, fwhm, temperature);
  jac.push(mEf1.map((v, i) => (sw[i] * (v - mEf0[i])) / (2 * hEf)));
  const mFw1 = modelAt(ef, fwhm + hFw, temperature);
  const mFw0 = modelAt(ef, fwhm - hFw, temperature);
  jac.push(mFw1.map((v, i) => (sw[i] * (v - mFw0[i])) / (2 * hFw)));
  if (opts.fitTemperature) {
    const hT = 1e-5 * temperature;
    const mT1 = modelAt(ef, fwhm, temperature + hT);
    const mT0 = modelAt(ef, fwhm, temperature - hT);
    jac.push(mT1.map((v, i) => (sw[i] * (v - mT0[i])) / (2 * hT)));
  }
  for (const c of cols) jac.push(c.map((v, i) => sw[i] * v));

  const cost = dot(r, r);
  const dof = Math.max(n - nParams, 1);
  const reducedChi2 = cost / dof;
  const JtJ = jac.map(a => jac.map(b => dot(a, b)));
  const inv = invertScaled(JtJ);
  const cov = inv ? inv.map(row => row.map(v => v * reducedChi2)) : null;
  const err = (i: number) => (cov ? Math.sqrt(Math.max(cov[i][i], 0)) : NaN);

  const efErr = err(0);
  const fwhmErr = err(1);
  const tIdx = opts.fitTemperature ? 2 : -1;
  const ampIdx = nonlinearCount;
  const a2Idx = opts.dos === 'linear' ? nonlinearCount + 1 : -1;
  const temperatureErr = tIdx >= 0 ? err(tIdx) : NaN;
  const amplitudeErr = err(ampIdx);
  const dosSlope = opts.dos === 'linear' && amplitude !== 0 ? a2 / amplitude : 0;
  let dosSlopeErr = NaN;
  if (cov && a2Idx >= 0 && amplitude !== 0) {
    // c1 = a2/A: first-order error propagation
    const gA = -a2 / (amplitude * amplitude);
    const g2 = 1 / amplitude;
    const v = gA * gA * cov[ampIdx][ampIdx] + g2 * g2 * cov[a2Idx][a2Idx] + 2 * gA * g2 * cov[ampIdx][a2Idx];
    dosSlopeErr = Math.sqrt(Math.max(v, 0));
  }
  const corrFwhmTemp = cov && tIdx >= 0 ? cov[1][tIdx] / Math.sqrt(cov[1][1] * cov[tIdx][tIdx]) : NaN;

  // --- goodness of fit ---
  const yMean = ys.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - yMean) ** 2;
    ssRes += (ys[i] - model[i]) ** 2;
  }
  const width1090 = edgeWidth1090(fwhm, temperature);

  // --- sanity checks (after toyomacro.fitting.fermi_edge) ---
  const nearBound = (v: number, l: number, u: number) => {
    const tol = 1e-3 * (u - l);
    return v - l < tol || u - v < tol;
  };
  if (nearBound(sol.theta[0], lo[0], hi[0])) warnings.push({ code: 'atBound', param: 'ef' });
  if (nearBound(sol.theta[1], lo[1], hi[1])) warnings.push({ code: 'atBound', param: 'fwhm' });
  if (opts.fitTemperature && nearBound(sol.theta[2], lo[2], hi[2])) {
    warnings.push({ code: 'atBound', param: 'temperature' });
  }
  const errs = [efErr, fwhmErr, amplitudeErr, ...(opts.fitTemperature ? [temperatureErr] : [])];
  if (!errs.every(Number.isFinite)) warnings.push({ code: 'nonFiniteError' });
  if (ef < x[0] || ef > x[n - 1]) {
    warnings.push({ code: 'efOutsideWindow' });
  } else if (efErr > span || efErr > width1090) {
    warnings.push({ code: 'efUndetermined' });
  }
  if (fwhm < 0.5 * step) warnings.push({ code: 'resolutionBelowChannel' });
  if (Math.abs(corrFwhmTemp) > 0.95) warnings.push({ code: 'tempResolutionDegenerate' });
  if (!sol.converged) warnings.push({ code: 'notConverged' });
  if (amplitude <= 0 && !warnings.some(w => w.code === 'edgeInverted')) {
    warnings.push({ code: 'edgeInverted' });
  }

  const background = Array.from(x, v => bgConst + bgSlope * v);
  const residuals = ys.map((v, i) => v - model[i]);
  // 'tempResolutionDegenerate' is advice, not a failure, as in toyomacro
  const blocking = warnings.filter(w => w.code !== 'tempResolutionDegenerate');

  return {
    success: blocking.length === 0,
    warnings,
    ef: ef + xc,
    efErr,
    fwhm,
    fwhmErr,
    temperature,
    temperatureErr,
    temperatureFitted: opts.fitTemperature,
    amplitude,
    amplitudeErr,
    dosSlope,
    dosSlopeErr,
    // Background is pivoted on the window centre (x = xc)
    bgConst,
    bgSlope,
    corrFwhmTemp,
    width1090,
    reducedChi2,
    rSquared: ssTot > 0 ? 1 - ssRes / ssTot : NaN,
    nPoints: n,
    nParams,
    iterations: sol.iterations,
    x: xs,
    y: ys,
    fit: Array.from(model),
    background,
    residuals,
    weightedResiduals: residuals.map((v, i) => v * sw[i]),
    weighting: opts.weighting,
    dos: opts.dos,
    backgroundModel: opts.background,
  };
}
