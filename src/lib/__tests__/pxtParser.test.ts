import { describe, expect, it } from 'vitest';
import { fitFermiEdge } from '../fermiEdge';
import { isIgorBinaryName, parseIgorBinary } from '../pxtParser';
import { guessAxis, guessUnit, toInternal } from '../spectrumImport';
import { exampleEdgeSpec, makeSyntheticEdge } from '../synthetic';

// ---------------------------------------------------------------------------
// Igor binary wave v5 writer (BinHeader5 64 bytes + WaveHeader5 320 bytes)
// ---------------------------------------------------------------------------

const ITEM_SIZE: Record<number, number> = { 0x02: 4, 0x03: 8, 0x04: 8, 0x10: 2, 0x50: 2, 0x60: 4 };

interface WaveSpec {
  name?: string;
  /** Igor number type; float32 by default */
  type?: number;
  dims: number[];
  start?: number;
  delta?: number;
  /** Column-major, energy index fastest */
  data: number[];
  note?: string;
  /** 4-character x units in the wave header */
  units?: string;
  /** Extended x units written after the note */
  longUnits?: string;
}

function ibw(w: WaveSpec): ArrayBuffer {
  const type = w.type ?? 0x02;
  const item = ITEM_SIZE[type];
  const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));
  const note = ascii(w.note ?? '');
  const longUnits = ascii(w.longUnits ?? '');
  const dataBytes = w.data.length * item;
  const buf = new ArrayBuffer(384 + dataBytes + note.length + longUnits.length);
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  v.setInt16(0, 5, true);
  v.setInt32(4, 320 + dataBytes, true);
  v.setInt32(12, note.length, true);
  v.setInt32(20, longUnits.length, true);
  const wh = 64;
  v.setInt32(wh + 12, w.data.length, true);
  v.setInt16(wh + 16, type, true);
  bytes.set(ascii(w.name ?? 'wave0'), wh + 28);
  w.dims.forEach((n, d) => {
    v.setInt32(wh + 68 + 4 * d, n, true);
    v.setFloat64(wh + 84 + 8 * d, d === 0 ? (w.delta ?? 1) : 1, true);
    v.setFloat64(wh + 116 + 8 * d, d === 0 ? (w.start ?? 0) : 0, true);
  });
  bytes.set(ascii(w.units ?? ''), wh + 152);
  w.data.forEach((y, i) => {
    const at = 384 + i * item;
    if (type === 0x02 || type === 0x03) v.setFloat32(at, y, true);
    else if (type === 0x04) v.setFloat64(at, y, true);
    else if (type === 0x10) v.setInt16(at, y, true);
    else if (type === 0x50) v.setUint16(at, y, true);
    else v.setUint32(at, y, true);
  });
  bytes.set(note, 384 + dataBytes);
  bytes.set(longUnits, 384 + dataBytes + note.length);
  return buf;
}

/** Packed experiment: records of (type, version, size, body), then an end record */
function pxt(records: { type: number; body: ArrayBuffer }[]): ArrayBuffer {
  const size = records.reduce((s, r) => s + 8 + r.body.byteLength, 8);
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let at = 0;
  for (const r of records) {
    v.setUint16(at, r.type, true);
    v.setUint32(at + 4, r.body.byteLength, true);
    new Uint8Array(buf).set(new Uint8Array(r.body), at + 8);
    at += 8 + r.body.byteLength;
  }
  return buf;
}

const sesNote = (region: string, scale: string, hv: number) =>
  `[SES]\rRegion Name=${region}\rEnergy Scale=${scale}\rExcitation Energy=${hv}\rPass Energy=200\r`;

// ---------------------------------------------------------------------------

describe('parseIgorBinary', () => {
  it('reads a 1-D SES wave with its region name, energy scale and photon energy', () => {
    const f = parseIgorBinary(
      ibw({ dims: [4], start: 84.2, delta: -0.1, data: [10, 9.5, 3, 0.5], note: sesNote('Au EF', 'Binding', 7940.5), units: 'eV' }),
      'au.ibw'
    );
    expect(f.format).toBe('ibw');
    expect(f.regions).toHaveLength(1);
    const r = f.regions[0];
    expect(r.name).toBe('Au EF');
    expect(r.columns[0].map(e => +e.toFixed(6))).toEqual([84.2, 84.1, 84, 83.9]);
    expect(r.columns[1]).toEqual([10, 9.5, 3, 0.5]);
    expect(r.hints).toEqual({ unit: 'eV', axis: 'BE' });
    expect(r.excitationEnergy).toBe(7940.5);
  });

  it('sums the angle dimension of a 2-D wave (energy index fastest)', () => {
    const f = parseIgorBinary(
      ibw({ name: 'Au_EF', type: 0x50, dims: [3, 2], start: 1480, delta: 0.5, data: [1, 2, 3, 10, 20, 30], longUnits: 'Kinetic Energy [eV]' }),
      'a.ibw'
    );
    const r = f.regions[0];
    expect(r.name).toBe('Au_EF');
    expect(r.columns).toEqual([[1480, 1480.5, 1481], [11, 22, 33]]);
    expect(r.hints).toEqual({ unit: 'eV', axis: 'KE' });
    expect(r.excitationEnergy).toBeUndefined();
  });

  it('reads the JSON note newer SES versions write', () => {
    const note = JSON.stringify({
      Name: 'Au 4f',
      EnergyMode: 'Binding',
      ExcitationSource: { ExcitationSourceEnergyInformation: { Energy: 1486.7 } },
    });
    const r = parseIgorBinary(ibw({ dims: [2], data: [1, 2], note }), 'b.ibw').regions[0];
    expect(r.name).toBe('Au 4f');
    expect(r.hints.axis).toBe('BE');
    expect(r.excitationEnergy).toBe(1486.7);
  });

  it('leaves the axis to be guessed when neither the note nor the units name it', () => {
    const r = parseIgorBinary(ibw({ type: 0x04, dims: [3], data: [5, 4, 1] }), 'c.ibw').regions[0];
    expect(r.hints).toEqual({ unit: 'eV' });
  });

  it('takes the spectra from a packed experiment and skips other records and axis waves', () => {
    const spectrum = ibw({ type: 0x60, dims: [3, 2], data: [1, 2, 3, 4, 5, 6], note: sesNote('Fermi', 'Kinetic', 1486.6) });
    const f = parseIgorBinary(
      pxt([
        { type: 2, body: new ArrayBuffer(12) }, // history
        { type: 3, body: ibw({ name: 'axis', dims: [3], data: [0, 1, 2] }) }, // axis scaling wave, no note
        { type: 3, body: spectrum },
        { type: 0x8003, body: ibw({ dims: [3], data: [9, 9, 9], note: sesNote('old', 'Kinetic', 1) }) }, // superseded
      ]),
      'exp.pxt'
    );
    expect(f.format).toBe('pxt');
    expect(f.regions.map(r => r.name)).toEqual(['Fermi']);
    expect(f.regions[0].columns[1]).toEqual([5, 7, 9]);
    expect(f.regions[0].hints).toEqual({ unit: 'eV', axis: 'KE' });
  });

  it('reports a truncated file', () => {
    const whole = ibw({ dims: [100], data: Array.from({ length: 100 }, (_, i) => i), note: sesNote('x', 'Binding', 1) });
    expect(() => parseIgorBinary(whole.slice(0, 500), 'cut.ibw')).toThrow(/truncated/);
    expect(() => parseIgorBinary(whole.slice(0, 100), 'header.ibw')).toThrow(/truncated/);
    const packed = pxt([{ type: 3, body: whole }]);
    expect(() => parseIgorBinary(packed.slice(0, 600), 'cut.pxt')).toThrow(/truncated/);
  });

  it('rejects complex waves and files that are too short', () => {
    expect(() => parseIgorBinary(ibw({ type: 0x03, dims: [2], data: [1, 2] }), 'z.ibw')).toThrow(/Complex/);
    expect(() => parseIgorBinary(new ArrayBuffer(8), 'tiny.pxt')).toThrow(/too short/);
  });

  it('gives a synthetic Au edge written as a 2-D SES wave back its E_F', () => {
    const spec = exampleEdgeSpec;
    const { be, counts } = makeSyntheticEdge(spec);
    // Split the counts over two angle channels; the reader has to add them again
    const half = counts.map(c => Math.floor(c / 2));
    const f = parseIgorBinary(
      ibw({ type: 0x60, dims: [be.length, 2], start: be[0], delta: be[1] - be[0], data: [...half, ...counts.map((c, i) => c - half[i])], note: sesNote('Au EF', 'Binding', 1486.6) }),
      'au-edge.ibw'
    );
    const [energy, intensity] = f.regions[0].columns;
    expect(intensity).toEqual(counts);
    const unit = guessUnit(energy, f.regions[0].hints);
    const axis = guessAxis(energy, intensity, unit.unit, f.regions[0].hints);
    expect([unit.unit, axis.axis]).toEqual(['eV', 'BE']);
    const res = fitFermiEdge(energy.map(e => toInternal(e, unit.unit, axis.axis)), intensity, {
      temperature: spec.temperature, weighting: 'poisson',
    });
    expect(res.success).toBe(true);
    expect(Math.abs(-res.ef - spec.efBE)).toBeLessThan(3 * res.efErr);
  });
});

describe('isIgorBinaryName', () => {
  it('goes by the extension', () => {
    expect(isIgorBinaryName('run_0001.PXT')).toBe(true);
    expect(isIgorBinaryName('Au EF.ibw')).toBe(true);
    expect(isIgorBinaryName('edge.txt')).toBe(false);
    expect(isIgorBinaryName('pxt')).toBe(false);
  });
});
