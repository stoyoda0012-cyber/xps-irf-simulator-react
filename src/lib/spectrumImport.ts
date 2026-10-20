/**
 * Reading measured spectra and putting them on the fitting axis.
 *
 * Formats: delimited text (CSV / TSV / whitespace / semicolon with decimal
 * comma, optional header and comment lines, any number of columns),
 * Scienta SES .txt exports and VAMAS .vms. The SES and VAMAS readers follow
 * xps-peak-assign/src/lib/parsers.ts (ported there from toyomacro). Binary
 * Igor files (.pxt / .ibw) are read by pxtParser.ts into the same shape.
 *
 * The fit runs on an internal axis in eV on which the occupied states lie at
 * lower values (kinetic energy, or E - E_F); a binding-energy axis is
 * mirrored (x = -BE).
 */

export type EnergyUnit = 'eV' | 'meV';
/** BE: binding energy (occupied side at larger values); KE: kinetic; EEF: E - E_F (occupied side negative) */
export type AxisKind = 'BE' | 'KE' | 'EEF';

export interface AxisHints {
  unit?: EnergyUnit;
  axis?: AxisKind;
}

export interface ParsedRegion {
  name: string;
  /** Column-major numeric data; every column has the same length */
  columns: number[][];
  columnNames: string[];
  hints: AxisHints;
  excitationEnergy?: number;
}

export interface ParsedFile {
  format: 'text' | 'ses' | 'vamas' | 'pxt' | 'ibw';
  regions: ParsedRegion[];
}

// ---------------------------------------------------------------------------
// Hints from header text
// ---------------------------------------------------------------------------

export function hintsFromText(text: string): AxisHints {
  const hints: AxisHints = {};
  if (/mev/i.test(text)) hints.unit = 'meV';
  else if (/(^|[^a-z])ev([^a-z]|$)/i.test(text)) hints.unit = 'eV';
  // 'BE' / 'KE' only as upper-case words, so prose such as "to be" does not count
  if (/e\s*[-−]\s*e_?\s*f|relative\s+to\s+e_?f/i.test(text)) hints.axis = 'EEF';
  else if (/binding/i.test(text) || /(^|[^A-Za-z])BE([^A-Za-z]|$)/.test(text)) hints.axis = 'BE';
  else if (/kinetic/i.test(text) || /(^|[^A-Za-z])KE([^A-Za-z]|$)/.test(text)) hints.axis = 'KE';
  return hints;
}

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------

function toNumber(token: string, decimalComma: boolean): number {
  const t = decimalComma ? token.replace(',', '.') : token;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN;
  return parseFloat(t);
}

export function parseDelimited(text: string, name = 'data'): ParsedFile {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replaceAll('\u0000', '').trim());
  const nonEmpty = lines.filter(l => l && !/^(#|\/\/|%)/.test(l));
  // Semicolon-separated files often use a decimal comma
  const semicolon = nonEmpty.slice(0, 50).filter(l => l.includes(';')).length > nonEmpty.slice(0, 50).length / 2;
  const tab = !semicolon && nonEmpty.slice(0, 50).filter(l => l.includes('\t')).length > nonEmpty.slice(0, 50).length / 2;
  const splitter = semicolon ? /\s*;\s*/ : tab ? /\s*\t\s*/ : /[\s,]+/;

  const rows: number[][] = [];
  const headerLines: string[] = [];
  let lastTextLine: string | null = null;
  let columnNames: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^(#|\/\/|%)/.test(line)) {
      if (rows.length === 0) headerLines.push(line);
      continue;
    }
    const tokens = line.split(splitter).filter(Boolean);
    const nums: number[] = [];
    for (const tk of tokens) {
      const v = toNumber(tk, semicolon);
      if (Number.isNaN(v)) break;
      nums.push(v);
    }
    if (nums.length >= 2) {
      if (rows.length === 0 && lastTextLine !== null) {
        // Names may contain spaces ("Binding Energy (eV)"), so split the
        // header on its own strongest delimiter
        const h = lastTextLine;
        const hs = semicolon ? ';' : h.includes('\t') ? '\t' : h.includes(',') ? ',' : /\s+/;
        columnNames = h.split(hs).map(s => s.trim()).filter(Boolean);
      }
      rows.push(nums);
    } else if (rows.length === 0) {
      headerLines.push(line);
      lastTextLine = line;
    }
  }
  if (rows.length < 2) {
    throw new Error('No numeric data found. Expected at least two columns: energy and intensity.');
  }
  // Use the column count most rows share
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  const nCols = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const good = rows.filter(r => r.length >= nCols);
  const columns = Array.from({ length: nCols }, (_, c) => good.map(r => r[c]));
  if (columnNames.length !== nCols) columnNames = Array.from({ length: nCols }, (_, c) => columnNames[c] ?? `col ${c + 1}`);

  // The energy column's own name wins over free-text header lines
  const hints = { ...hintsFromText(headerLines.join('\n')), ...hintsFromText(columnNames[0] ?? '') };
  return { format: 'text', regions: [{ name, columns, columnNames, hints }] };
}

// ---------------------------------------------------------------------------
// Scienta SES .txt
// ---------------------------------------------------------------------------

function isSES(text: string): boolean {
  return text.split('\n', 200).some(l => l.trim().startsWith('[Data') || l.trim() === '[Info]');
}

function sections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = text.replace(/\r\n?/g, '\n').split(/^\[([^\]]+)\]\s*$/m);
  for (let i = 1; i < parts.length - 1; i += 2) out.set(parts[i].trim(), parts[i + 1] || '');
  return out;
}

function keyValues(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of body.split('\n')) {
    const k = line.indexOf('=');
    if (k >= 0) out.set(line.slice(0, k).trim(), line.slice(k + 1).trim());
  }
  return out;
}

function numericRows(body: string): number[][] {
  const rows: number[][] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || !/^[+\-.\d]/.test(t)) continue;
    const vals = t.split(/[\s,]+/).map(Number).filter(v => !Number.isNaN(v));
    if (vals.length) rows.push(vals);
  }
  return rows;
}

export function parseSES(text: string, name = 'data'): ParsedFile {
  const sec = sections(text);
  const nRegions = parseInt(keyValues(sec.get('Info') ?? '').get('Number of Regions') ?? '1', 10) || 1;
  const regions: ParsedRegion[] = [];
  for (let r = 1; r <= nRegions; r++) {
    const region = keyValues(sec.get(`Region ${r}`) ?? '');
    const info = keyValues(sec.get(`Info ${r}`) ?? '');
    const blocks: string[] = [];
    if (sec.has(`Data ${r}`)) blocks.push(sec.get(`Data ${r}`)!);
    for (let s = 1; sec.has(`Data ${r}:${s}`); s++) blocks.push(sec.get(`Data ${r}:${s}`)!);
    if (!blocks.length) continue;

    // First column energy, remaining columns (angles / sweeps) summed
    const energy: number[] = [];
    const intensity: number[] = [];
    blocks.forEach((b, bi) => {
      numericRows(b).forEach((row, i) => {
        if (row.length < 2) return;
        const sum = row.slice(1).reduce((a, v) => a + v, 0);
        if (bi === 0) {
          energy.push(row[0]);
          intensity.push(sum);
        } else if (i < intensity.length) {
          intensity[i] += sum;
        }
      });
    });
    if (energy.length < 2) continue;
    const scale = (info.get('Energy Scale') ?? '').toLowerCase();
    const hv = parseFloat(info.get('Excitation Energy') ?? '');
    regions.push({
      name: info.get('Region Name') || info.get('Spectrum Name') || region.get('Region Name') || `Region ${r}`,
      columns: [energy, intensity],
      columnNames: ['Energy', 'Intensity'],
      hints: { unit: 'eV', axis: scale.includes('binding') ? 'BE' : 'KE' },
      excitationEnergy: hv > 0 ? hv : undefined,
    });
  }
  if (!regions.length) throw new Error(`No data regions found in SES file ${name}`);
  return { format: 'ses', regions };
}

// ---------------------------------------------------------------------------
// VAMAS (ISO 14976), regular-scan blocks
// ---------------------------------------------------------------------------

function readNonEmpty(lines: string[], at: number, n: number): [string[], number] {
  const out: string[] = [];
  let i = at;
  while (out.length < n && i < lines.length) {
    const s = lines[i].replaceAll('\u0000', '').trim();
    i++;
    if (s) out.push(s);
  }
  return [out, i];
}

export function parseVAMAS(text: string): ParsedFile {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const [head, start] = readNonEmpty(lines, 0, 12);
  const nRegions = parseInt(head[5], 10);
  if (!(nRegions >= 1)) throw new Error('Invalid VAMAS file: cannot read the number of blocks');
  let at = start;
  const regions: ParsedRegion[] = [];
  for (let r = 0; r < nRegions; r++) {
    let block: string[];
    [block, at] = readNonEmpty(lines, at, 9);
    const named = (block[8] ?? 'XPS') !== 'XPS';
    let ext: string[];
    [ext, at] = readNonEmpty(lines, at, named ? 35 : 34);
    const o = named ? 1 : 0;
    const e0 = parseFloat(ext[18 + o]);
    const de = parseFloat(ext[19 + o]);
    const n = parseInt(ext[31 + o], 10);
    let data: string[];
    [data, at] = readNonEmpty(lines, at, n);
    const energy = Array.from({ length: n }, (_, i) => e0 + i * de);
    const intensity = data.map(Number);
    const label = ext.slice(0, 20 + o).join(' ');
    regions.push({
      name: named ? block[8] : `Block ${r + 1}`,
      columns: [energy, intensity],
      columnNames: ['Energy', 'Intensity'],
      hints: { unit: 'eV', axis: /binding/i.test(label) ? 'BE' : 'KE' },
    });
  }
  return { format: 'vamas', regions };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function parseSpectrumText(text: string, filename: string): ParsedFile {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'vms') return parseVAMAS(text);
  if (isSES(text)) return parseSES(text, filename);
  return parseDelimited(text, filename);
}

// ---------------------------------------------------------------------------
// Axis handling
// ---------------------------------------------------------------------------

export function toInternal(e: number, unit: EnergyUnit, axis: AxisKind): number {
  const ev = unit === 'meV' ? e / 1000 : e;
  return axis === 'BE' ? -ev : ev;
}

export function fromInternal(x: number, unit: EnergyUnit, axis: AxisKind): number {
  const ev = axis === 'BE' ? -x : x;
  return unit === 'meV' ? ev * 1000 : ev;
}

/** Unit guess: a Fermi-edge scan wider than 50 units is almost surely in meV. */
export function guessUnit(energy: number[], hints: AxisHints): { unit: EnergyUnit; fromFile: boolean } {
  if (hints.unit) return { unit: hints.unit, fromFile: true };
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of energy) {
    if (e < lo) lo = e;
    if (e > hi) hi = e;
  }
  return { unit: hi - lo > 50 ? 'meV' : 'eV', fromFile: false };
}

/**
 * Axis guess. Only the occupied side of an edge carries intensity, so the
 * brighter end tells the direction: brighter at high energy means binding
 * energy. Otherwise E - E_F if the scan straddles zero near 0, else kinetic.
 */
export function guessAxis(
  energy: number[],
  intensity: number[],
  unit: EnergyUnit,
  hints: AxisHints
): { axis: AxisKind; fromFile: boolean } {
  if (hints.axis) return { axis: hints.axis, fromFile: true };
  const order = energy.map((_, i) => i).sort((a, b) => energy[a] - energy[b]);
  const n = Math.max(3, Math.floor(order.length / 5));
  const mean = (idx: number[]) => idx.reduce((s, i) => s + intensity[i], 0) / idx.length;
  const lowEnd = mean(order.slice(0, n));
  const highEnd = mean(order.slice(-n));
  if (highEnd > lowEnd) return { axis: 'BE', fromFile: false };
  const scale = unit === 'meV' ? 1000 : 1;
  const lo = energy[order[0]] / scale;
  const hi = energy[order[order.length - 1]] / scale;
  return { axis: lo < 0 && hi > 0 && hi - lo < 50 ? 'EEF' : 'KE', fromFile: false };
}
