/**
 * Reading Igor Pro binary waves: Scienta SES packed experiments (.pxt) and
 * single binary waves (.ibw, version 5).
 *
 * Follows xps-peak-assign/src/lib/pxt-parser.ts (ported there from
 * toyomacro's pxt_reader.py). Each spectrum wave becomes one region: the
 * energy column comes from the wave's x scaling, the intensity column is the
 * sum over the other dimensions (angles, sweeps). Data are column-major, so
 * the energy index runs fastest. Unit and axis come from the wave note
 * (Energy Scale, or EnergyMode in the JSON note of newer SES versions) or
 * from the x units ("Binding Energy [eV]").
 */

import { hintsFromText } from './spectrumImport';
import type { AxisHints, ParsedFile, ParsedRegion } from './spectrumImport';

/** .pxt / .ibw: read as an ArrayBuffer, not as text */
export function isIgorBinaryName(filename: string): boolean {
  return /\.(pxt|ibw)$/i.test(filename);
}

// ---------------------------------------------------------------------------
// Wave records
// ---------------------------------------------------------------------------

/** Bin header + wave header. Version 3 is the layout toyomacro reads inside packed files. */
const HEADER_SIZE: Record<number, number> = { 3: 64 + 328, 5: 64 + 320 };
/** Offset of the wave header's type field from the start of the record */
const WAVE_HEADER_AT: Record<number, number> = { 3: 88, 5: 80 };

/** Igor number type → bytes per element (complex and text waves are not spectra) */
const ITEM_SIZE: Record<number, number> = {
  0x02: 4, // float32
  0x04: 8, // float64
  0x08: 1, // int8
  0x10: 2, // int16
  0x20: 4, // int32
  0x48: 1, // uint8
  0x50: 2, // uint16
  0x60: 4, // uint32
};

interface Wave {
  name: string;
  dims: number[];
  /** x scaling of each dimension: value = start + index * delta */
  delta: number[];
  start: number[];
  data: Float64Array;
  note: string;
  /** Units of the first (energy) dimension */
  xUnits: string;
}

function readValue(view: DataView, pos: number, type: number): number {
  switch (type) {
    case 0x02: return view.getFloat32(pos, true);
    case 0x04: return view.getFloat64(pos, true);
    case 0x08: return view.getInt8(pos);
    case 0x10: return view.getInt16(pos, true);
    case 0x20: return view.getInt32(pos, true);
    case 0x48: return view.getUint8(pos);
    case 0x50: return view.getUint16(pos, true);
    default: return view.getUint32(pos, true);
  }
}

const latin1 = new TextDecoder('latin1');

function readString(buf: ArrayBuffer, at: number, length: number): string {
  if (length <= 0 || at + length > buf.byteLength) return '';
  return latin1.decode(new Uint8Array(buf, at, length)).replace(/\0[\s\S]*$/, '');
}

/** One binary wave starting at `at` (the start of its bin header) and ending before `end`. */
function readWave(buf: ArrayBuffer, at: number, end: number): Wave {
  const view = new DataView(buf);
  const version = view.getInt16(at, true);
  if (version !== 3 && version !== 5) {
    throw new Error(`Igor binary wave version ${version} is not supported (only version 5).`);
  }
  if (at + HEADER_SIZE[version] > end) throw new Error('The file is truncated inside a wave header.');
  const shift = version === 3 ? 8 : 0;
  const formulaSize = view.getInt32(at + 8 + shift, true);
  const noteSize = view.getInt32(at + 12 + shift, true);
  const dataEUnitsSize = view.getInt32(at + 16 + shift, true);
  const dimEUnitsSize = view.getInt32(at + 20 + shift, true);

  const wh = at + WAVE_HEADER_AT[version];
  const type = view.getUint16(wh, true);
  const name = readString(buf, wh + 12, 32);
  const dims: number[] = [];
  for (let d = 0; d < 4; d++) {
    const n = view.getInt32(wh + 52 + d * 4, true);
    if (n <= 0) break;
    dims.push(n);
  }
  const delta = dims.map((_, d) => view.getFloat64(wh + 68 + d * 8, true));
  const start = dims.map((_, d) => view.getFloat64(wh + 100 + d * 8, true));
  const shortUnits = readString(buf, wh + 136, 4);

  const itemSize = ITEM_SIZE[type];
  if (itemSize === undefined) {
    throw new Error(type & 0x01 ? 'Complex waves are not supported.' : type === 0 ? 'Text waves hold no spectrum.' : `Unknown Igor number type ${type}.`);
  }
  const nPts = dims.length ? dims.reduce((a, b) => a * b, 1) : 0;
  if (nPts <= 0) throw new Error('The wave is empty.');

  const dataAt = at + HEADER_SIZE[version];
  if (dataAt + nPts * itemSize > end) {
    throw new Error(`The file is truncated: the wave "${name}" needs ${dataAt + nPts * itemSize - at} bytes, ${end - at} are present.`);
  }
  const data = new Float64Array(nPts);
  for (let i = 0; i < nPts; i++) data[i] = readValue(view, dataAt + i * itemSize, type);

  // After the data: formula, note, data units, then the extended unit of each dimension
  const noteAt = dataAt + nPts * itemSize + Math.max(formulaSize, 0);
  const note = readString(buf, noteAt, Math.min(noteSize, end - noteAt));
  const xUnitsAt = noteAt + Math.max(noteSize, 0) + Math.max(dataEUnitsSize, 0);
  const longUnits = version === 5 && xUnitsAt + dimEUnitsSize <= end ? readString(buf, xUnitsAt, dimEUnitsSize) : '';

  return { name, dims, delta, start, data, note, xUnits: longUnits || shortUnits };
}

interface NoteInfo {
  name?: string;
  /** "Binding" / "Kinetic" */
  scale?: string;
  excitationEnergy?: number;
}

/** The part of the JSON note newer SES versions write that is used here */
interface JsonNote {
  Name?: string;
  EnergyMode?: string;
  ExcitationSource?: {
    ExcitationSourceEnergyInformation?: { Energy?: number };
    ExcitationSourcePreset?: { TargetEnergy?: number };
  };
}

/**
 * Region name, energy scale and photon energy from a wave note: SES
 * "key=value" lines (\r line ends), or a JSON object. null: no metadata.
 */
function noteInfo(note: string): NoteInfo | null {
  const text = note.trim();
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text) as JsonNote;
      const source = j.ExcitationSource;
      return {
        name: j.Name,
        scale: j.EnergyMode,
        excitationEnergy: source?.ExcitationSourceEnergyInformation?.Energy ?? source?.ExcitationSourcePreset?.TargetEnergy,
      };
    } catch {
      // not JSON after all: try key=value lines
    }
  }
  const kv = new Map<string, string>();
  for (const line of text.split(/\r\n?|\n/)) {
    const k = line.indexOf('=');
    if (k > 0) kv.set(line.slice(0, k).trim(), line.slice(k + 1).trim());
  }
  if (!kv.size) return null;
  return {
    name: kv.get('Region Name') || kv.get('RegionName'),
    scale: kv.get('Energy Scale') ?? kv.get('EnergyScale'),
    excitationEnergy: parseFloat(kv.get('Excitation Energy') ?? kv.get('ExcitationEnergy') ?? ''),
  };
}

/** Packed experiment: a chain of records (type, version, size); type 3 holds a wave */
function readPacked(buf: ArrayBuffer): Wave[] {
  const view = new DataView(buf);
  const waves: Wave[] = [];
  let lastError: unknown = null;
  for (let at = 0; at + 8 <= buf.byteLength;) {
    const recType = view.getUint16(at, true);
    const recSize = view.getUint32(at + 4, true);
    if (recType === 0 && recSize === 0) break;
    const end = Math.min(at + 8 + recSize, buf.byteLength);
    // Type 3 is a wave; 0x8003 (superseded by a later record) is skipped
    if (recType === 3) {
      try {
        waves.push(readWave(buf, at + 8, end));
      } catch (err) {
        lastError = err;
      }
    }
    at += 8 + recSize;
  }
  if (!waves.length && lastError) throw lastError;
  return waves;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

function toRegion(w: Wave, index: number): ParsedRegion {
  const info = noteInfo(w.note) ?? {};
  const nE = w.dims[0];
  const energy = Array.from({ length: nE }, (_, i) => w.start[0] + i * w.delta[0]);
  const intensity = new Array<number>(nE).fill(0);
  for (let i = 0; i < w.data.length; i++) intensity[i % nE] += w.data[i];

  const unitHints = hintsFromText(w.xUnits);
  const scale = (info.scale ?? '').toLowerCase();
  const hints: AxisHints = {
    unit: unitHints.unit ?? 'eV',
    axis: scale.includes('binding') ? 'BE' : scale.includes('kinetic') ? 'KE' : unitHints.axis,
  };
  if (!hints.axis) delete hints.axis;
  const hv = Number(info.excitationEnergy);
  return {
    name: info.name || w.name || `Region ${index + 1}`,
    columns: [energy, intensity],
    columnNames: ['Energy', 'Intensity'],
    hints,
    excitationEnergy: hv > 0 ? hv : undefined,
  };
}

/** Parse a .pxt (packed experiment) or .ibw (binary wave v5) file. */
export function parseIgorBinary(buf: ArrayBuffer, filename: string): ParsedFile {
  if (buf.byteLength < 16) throw new Error('The file is too short for an Igor binary file.');
  const ibw = new DataView(buf).getInt16(0, true) === 5;
  let waves = ibw ? [readWave(buf, 0, buf.byteLength)] : readPacked(buf);
  // SES packs 1-D axis scaling waves without metadata next to the spectrum
  const spectra = waves.filter(w => w.dims.length > 1 || noteInfo(w.note) !== null);
  if (spectra.length) waves = spectra;
  if (!waves.length) throw new Error(`No waves found in ${filename}.`);
  return { format: ibw ? 'ibw' : 'pxt', regions: waves.map(toRegion) };
}
