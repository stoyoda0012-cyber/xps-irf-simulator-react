/**
 * Synthetic Fermi-edge spectra with known parameters, for the "try an
 * example" button and for tests.
 */

import { fermiEdgeModel } from './fermiEdge';

/** Seeded uniform random numbers in [0, 1) (Mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Poisson deviate: Knuth for small means, normal approximation above 50 */
export function poisson(mean: number, rand: () => number): number {
  if (mean <= 0) return 0;
  if (mean > 50) {
    const u1 = Math.max(rand(), 1e-300);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * z));
  }
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

export interface SyntheticEdgeSpec {
  /** Binding energy of E_F on the (miscalibrated) axis, eV */
  efBE: number;
  /** Gaussian FWHM, eV */
  fwhm: number;
  temperature: number;
  /** Counts at the edge on the occupied side */
  amplitude: number;
  /** DOS slope, 1/eV */
  dosSlope: number;
  /** Background counts above E_F */
  background: number;
  /** Binding-energy range and step, eV */
  beStart: number;
  beEnd: number;
  step: number;
  seed: number;
}

/** A gold-like reference edge on a binding-energy axis, Poisson counts. */
export const exampleEdgeSpec: SyntheticEdgeSpec = {
  efBE: 0.137,
  fwhm: 0.35,
  temperature: 300,
  amplitude: 4000,
  dosSlope: 0.25,
  background: 150,
  beStart: -1.5,
  beEnd: 1.8,
  step: 0.01,
  seed: 7,
};

/**
 * Spectrum on a binding-energy axis (descending, as most instruments write
 * it). Internally the model runs on x = -BE.
 */
export function makeSyntheticEdge(spec: SyntheticEdgeSpec = exampleEdgeSpec): { be: number[]; counts: number[] } {
  const n = Math.round((spec.beEnd - spec.beStart) / spec.step) + 1;
  const be = Array.from({ length: n }, (_, i) => +(spec.beEnd - i * spec.step).toFixed(6));
  const clean = fermiEdgeModel(be.map(v => -v), {
    ef: -spec.efBE,
    fwhm: spec.fwhm,
    temperature: spec.temperature,
    amplitude: spec.amplitude,
    dosSlope: spec.dosSlope,
    bgConst: spec.background,
  });
  const rand = seededRandom(spec.seed);
  return { be, counts: Array.from(clean, m => poisson(m, rand)) };
}

/** The example as CSV text, so it goes through the same import path as a file. */
export function syntheticEdgeCSV(spec: SyntheticEdgeSpec = exampleEdgeSpec): string {
  const { be, counts } = makeSyntheticEdge(spec);
  const lines = [
    `# Synthetic Au Fermi edge: E_F at BE = ${spec.efBE} eV, Gaussian FWHM = ${spec.fwhm * 1000} meV, T = ${spec.temperature} K`,
    'Binding Energy (eV),Counts',
  ];
  for (let i = 0; i < be.length; i++) lines.push(`${be[i].toFixed(3)},${counts[i]}`);
  return lines.join('\n');
}
