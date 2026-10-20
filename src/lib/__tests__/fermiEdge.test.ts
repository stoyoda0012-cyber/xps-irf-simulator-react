import { describe, expect, it } from 'vitest';
import { KB_EV, FWHM_PER_SIGMA, autoFitWindow, edgeBasis, edgeWidth1090, fermiEdgeModel, fitFermiEdge } from '../fermiEdge';
import { makeSyntheticEdge, poisson, seededRandom } from '../synthetic';

/** Brute-force [D f] (x) G by a fine trapezoid sum, for checking edgeBasis. */
function reference(x: number, ef: number, fwhm: number, temp: number, c1: number): number {
  const sigma = fwhm / FWHM_PER_SIGMA;
  const kT = KB_EV * temp;
  const h = Math.min(sigma, kT) / 200;
  const lo = x - 9 * sigma;
  const n = Math.ceil((18 * sigma) / h);
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i <= n; i++) {
    const xp = lo + i * h;
    const w = (i === 0 || i === n ? 0.5 : 1) * Math.exp(-0.5 * ((xp - x) / sigma) ** 2);
    const f = 1 / (1 + Math.exp(Math.max(-700, Math.min(700, (xp - ef) / kT))));
    sum += w * (1 + c1 * Math.max(ef - xp, 0)) * f;
    wsum += w;
  }
  return sum / wsum;
}

describe('edgeBasis', () => {
  // sigma >> kT, sigma ~ kT (both sides of the switch), sigma << kT
  const cases = [
    { fwhm: 0.35, temp: 300 },
    { fwhm: 0.0609, temp: 300 },   // sigma just above kT
    { fwhm: 0.0607, temp: 300 },   // sigma just below kT
    { fwhm: 0.002, temp: 300 },
    { fwhm: 0.0016, temp: 5 },
  ];
  for (const { fwhm, temp } of cases) {
    it(`matches brute-force convolution (FWHM ${fwhm} eV, ${temp} K)`, () => {
      const ef = 0.03;
      const c1 = 0.8;
      const width = 4 * fwhm + 20 * KB_EV * temp;
      const xs = Array.from({ length: 41 }, (_, i) => ef - width + (2 * width * i) / 40);
      const { flat, slope } = edgeBasis(xs, ef, fwhm, temp);
      xs.forEach((x, i) => {
        const ref = reference(x, ef, fwhm, temp, c1);
        expect(flat[i] + c1 * slope[i]).toBeCloseTo(ref, 5);
      });
    });
  }

  it('is continuous across the sigma = kT switch', () => {
    const temp = 300;
    const fwhmSwitch = KB_EV * temp * FWHM_PER_SIGMA;
    const xs = [-0.05, -0.01, 0, 0.01, 0.05];
    const a = edgeBasis(xs, 0, fwhmSwitch * (1 + 1e-9), temp);
    const b = edgeBasis(xs, 0, fwhmSwitch * (1 - 1e-9), temp);
    xs.forEach((_, i) => {
      expect(Math.abs(a.flat[i] - b.flat[i])).toBeLessThan(1e-7);
      // slope is in eV and of order 0.01-0.05 here
      expect(Math.abs(a.slope[i] - b.slope[i])).toBeLessThan(1e-6);
    });
  });

  it('gives the textbook 10-90 % widths', () => {
    // Gaussian only: 2 * 1.2816 sigma; thermal only: 2 ln 9 kT
    expect(edgeWidth1090(0.3, 0.001)).toBeCloseTo((2 * 1.281552 * 0.3) / FWHM_PER_SIGMA, 4);
    expect(edgeWidth1090(1e-7, 300)).toBeCloseTo(2 * Math.log(9) * KB_EV * 300, 4);
  });
});

describe('fitFermiEdge', () => {
  it('recovers E_F and resolution from a noisy synthetic Au edge (BE axis)', () => {
    const spec = {
      efBE: 0.137, fwhm: 0.35, temperature: 300, amplitude: 4000, dosSlope: 0.25,
      background: 150, beStart: -1.5, beEnd: 1.8, step: 0.01, seed: 11,
    };
    const { be, counts } = makeSyntheticEdge(spec);
    const res = fitFermiEdge(be.map(v => -v), counts, {
      temperature: 300, fitTemperature: false, dos: 'linear', background: 'constant', weighting: 'poisson',
    });
    expect(res.success).toBe(true);
    expect(res.warnings).toEqual([]);
    // -E_F(internal) is the binding energy of E_F
    expect(Math.abs(-res.ef - spec.efBE)).toBeLessThan(3 * res.efErr);
    expect(Math.abs(res.fwhm - spec.fwhm)).toBeLessThan(3 * res.fwhmErr);
    expect(res.efErr).toBeGreaterThan(0);
    expect(res.efErr).toBeLessThan(0.005);
    expect(res.reducedChi2).toBeGreaterThan(0.7);
    expect(res.reducedChi2).toBeLessThan(1.4);
  });

  it('gives error bars that match the scatter over many noise realisations', () => {
    const pulls: { ef: number; fwhm: number }[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const { be, counts } = makeSyntheticEdge({
        efBE: -0.05, fwhm: 0.25, temperature: 300, amplitude: 2000, dosSlope: 0.1,
        background: 100, beStart: -1.2, beEnd: 1.2, step: 0.02, seed,
      });
      const r = fitFermiEdge(be.map(v => -v), counts, { temperature: 300, weighting: 'poisson' });
      pulls.push({ ef: (-r.ef - -0.05) / r.efErr, fwhm: (r.fwhm - 0.25) / r.fwhmErr });
    }
    const rms = (v: number[]) => Math.sqrt(v.reduce((s, p) => s + p * p, 0) / v.length);
    // Unit pull width within sampling scatter for 40 fits
    expect(rms(pulls.map(p => p.ef))).toBeGreaterThan(0.65);
    expect(rms(pulls.map(p => p.ef))).toBeLessThan(1.4);
    expect(rms(pulls.map(p => p.fwhm))).toBeGreaterThan(0.65);
    expect(rms(pulls.map(p => p.fwhm))).toBeLessThan(1.4);
  });

  it('works on a kinetic-energy axis far from zero', () => {
    const ke = Array.from({ length: 301 }, (_, i) => 1480 + i * 0.01);
    const clean = fermiEdgeModel(ke, { ef: 1481.234, fwhm: 0.12, temperature: 20, amplitude: 1e4, bgConst: 50 });
    const rand = seededRandom(3);
    const counts = Array.from(clean, m => poisson(m, rand));
    const res = fitFermiEdge(ke, counts, { temperature: 20, dos: 'flat', weighting: 'poisson' });
    expect(res.success).toBe(true);
    expect(Math.abs(res.ef - 1481.234)).toBeLessThan(3 * res.efErr);
    expect(Math.abs(res.fwhm - 0.12)).toBeLessThan(3 * res.fwhmErr);
  });

  it('fits a simulator-like normalised edge in meV units', () => {
    // E - E_F axis, sigma 1.5 meV, 5 K, 1 % noise
    const x = Array.from({ length: 500 }, (_, i) => -0.1 + (0.2 * i) / 499);
    const clean = fermiEdgeModel(x, { ef: 0.0004, fwhm: 1.5e-3 * FWHM_PER_SIGMA, temperature: 5, amplitude: 1 });
    const rand = seededRandom(5);
    const y = Array.from(clean, v => v + 0.01 * Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-300))) * Math.cos(2 * Math.PI * rand()));
    const res = fitFermiEdge(x, y, { temperature: 5, dos: 'flat', background: 'constant' });
    expect(res.success).toBe(true);
    expect(Math.abs(res.ef - 0.0004)).toBeLessThan(3 * res.efErr);
    expect(Math.abs(res.fwhm / FWHM_PER_SIGMA - 1.5e-3)).toBeLessThan(3 * res.fwhmErr / FWHM_PER_SIGMA);
  });

  it('flags an edge that falls the wrong way (axis direction wrong)', () => {
    const { be, counts } = makeSyntheticEdge();
    const res = fitFermiEdge(be, counts, { temperature: 300 });  // BE used as if it were KE
    expect(res.success).toBe(false);
    expect(res.warnings.some(w => w.code === 'edgeInverted')).toBe(true);
  });

  it('can fit the temperature and reports its correlation with the resolution', () => {
    const { be, counts } = makeSyntheticEdge({
      efBE: 0, fwhm: 0.05, temperature: 300, amplitude: 20000, dosSlope: 0,
      background: 100, beStart: -0.6, beEnd: 0.6, step: 0.005, seed: 2,
    });
    const res = fitFermiEdge(be.map(v => -v), counts, {
      temperature: 200, fitTemperature: true, dos: 'flat', weighting: 'poisson',
    });
    expect(res.temperatureFitted).toBe(true);
    expect(Number.isFinite(res.temperatureErr)).toBe(true);
    expect(Math.abs(res.temperature - 300)).toBeLessThan(3 * res.temperatureErr);
    expect(Math.abs(res.corrFwhmTemp)).toBeGreaterThan(0.3);
  });

  it('refuses too few points', () => {
    const res = fitFermiEdge([0, 1, 2], [1, 1, 0]);
    expect(res.success).toBe(false);
    expect(res.warnings[0].code).toBe('tooFewPoints');
  });
});

describe('autoFitWindow', () => {
  it('centres on the Fermi edge, not on a steeper band deeper down', () => {
    // Internal axis (x = -BE): Fermi edge at x = -0.1 and a 5d-like rise,
    // three times taller and sharper, at x = -2.3
    const x = Array.from({ length: 701 }, (_, i) => -4 + i * 0.01);
    const edge = fermiEdgeModel(x, { ef: -0.1, fwhm: 0.3, temperature: 300, amplitude: 1000, bgConst: 50 });
    const band = fermiEdgeModel(x, { ef: -2.3, fwhm: 0.15, temperature: 300, amplitude: 3000 });
    const rand = seededRandom(9);
    const y = x.map((_, i) => poisson(edge[i] + band[i], rand));
    const w = autoFitWindow(x, y);
    expect(Math.abs(w.center - -0.1)).toBeLessThan(0.1);
    expect(w.lo).toBeCloseTo(-1.3, 1);
    expect(w.hi).toBeCloseTo(1.1, 1);
  });
});

