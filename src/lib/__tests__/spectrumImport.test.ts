import { describe, expect, it } from 'vitest';
import { fromInternal, guessAxis, guessUnit, parseSpectrumText, toInternal } from '../spectrumImport';
import { syntheticEdgeCSV } from '../synthetic';

describe('parseSpectrumText', () => {
  it('reads CSV with a header and picks up unit and axis from it', () => {
    const f = parseSpectrumText(syntheticEdgeCSV(), 'edge.csv');
    const r = f.regions[0];
    expect(r.columns).toHaveLength(2);
    expect(r.columns[0].length).toBeGreaterThan(300);
    expect(r.columnNames[0]).toBe('Binding Energy (eV)');
    expect(r.hints).toEqual({ unit: 'eV', axis: 'BE' });
  });

  it('reads single-space separated columns without a header', () => {
    const f = parseSpectrumText('-0.10 1.0\n-0.05 0.9\n0.00 0.5\n0.05 0.1\n', 'a.txt');
    expect(f.regions[0].columns).toEqual([[-0.1, -0.05, 0, 0.05], [1, 0.9, 0.5, 0.1]]);
    expect(f.regions[0].hints).toEqual({});
  });

  it('reads tab-separated multi-column data with names', () => {
    const f = parseSpectrumText('KE [meV]\tsweep1\tsweep2\n100\t5\t6\n101\t4\t4\n102\t1\t2\n', 'b.tsv');
    const r = f.regions[0];
    expect(r.columnNames).toEqual(['KE [meV]', 'sweep1', 'sweep2']);
    expect(r.columns[2]).toEqual([6, 4, 2]);
    expect(r.hints).toEqual({ unit: 'meV', axis: 'KE' });
  });

  it('reads semicolon-separated data with decimal commas', () => {
    const f = parseSpectrumText('E;I\n1,5;10\n1,6;9,5\n1,7;3\n', 'c.csv');
    expect(f.regions[0].columns).toEqual([[1.5, 1.6, 1.7], [10, 9.5, 3]]);
  });

  it('does not take "be" in prose for a binding-energy axis', () => {
    const f = parseSpectrumText('# data to be fitted\n0 1\n1 0\n', 'd.txt');
    expect(f.regions[0].hints.axis).toBeUndefined();
  });

  it('reads a Scienta SES export and sums the angle columns', () => {
    const ses = [
      '[Info]', 'Number of Regions=1',
      '[Region 1]', 'Region Name=VB',
      '[Info 1]', 'Region Name=Au EF', 'Energy Scale=Kinetic', 'Excitation Energy=7940',
      '[Data 1]', '7935.0 1 2', '7935.1 3 4', '7935.2 0 1', '',
    ].join('\n');
    const f = parseSpectrumText(ses, 'au.txt');
    expect(f.format).toBe('ses');
    const r = f.regions[0];
    expect(r.name).toBe('Au EF');
    expect(r.columns).toEqual([[7935, 7935.1, 7935.2], [3, 7, 1]]);
    expect(r.hints).toEqual({ unit: 'eV', axis: 'KE' });
    expect(r.excitationEnergy).toBe(7940);
  });

  it('rejects files without numbers', () => {
    expect(() => parseSpectrumText('hello\nworld\n', 'e.txt')).toThrow();
  });
});

describe('axis handling', () => {
  it('round-trips through the internal axis', () => {
    for (const unit of ['eV', 'meV'] as const) {
      for (const axis of ['BE', 'KE', 'EEF'] as const) {
        expect(fromInternal(toInternal(12.5, unit, axis), unit, axis)).toBeCloseTo(12.5, 12);
      }
    }
    expect(toInternal(0.137, 'eV', 'BE')).toBe(-0.137);
    expect(toInternal(-50, 'meV', 'EEF')).toBe(-0.05);
  });

  it('guesses meV from a wide numeric span', () => {
    expect(guessUnit([-100, 0, 100], {}).unit).toBe('meV');
    expect(guessUnit([-1, 0, 1], {}).unit).toBe('eV');
    expect(guessUnit([-100, 100], { unit: 'eV' })).toEqual({ unit: 'eV', fromFile: true });
  });

  it('guesses the direction from the bright side', () => {
    const e = [-1, -0.5, 0, 0.5, 1, 1.5];
    expect(guessAxis(e, [0, 0, 1, 5, 5, 5], 'eV', {}).axis).toBe('BE');
    expect(guessAxis(e, [5, 5, 5, 1, 0, 0], 'eV', {}).axis).toBe('EEF');
    expect(guessAxis([1480, 1481, 1482, 1483], [5, 5, 0, 0], 'eV', {}).axis).toBe('KE');
  });
});
