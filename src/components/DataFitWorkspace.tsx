/**
 * Fit the Fermi edge of a measured spectrum: load -> axis -> window -> model,
 * with the fit rerun automatically and shown with residuals and uncertainties.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { DataFitChart } from './DataFitChart';
import { useFittingWorker } from '../hooks/useFittingWorker';
import { autoFitWindow, FWHM_PER_SIGMA } from '../lib/fermiEdge';
import type { BackgroundModel, DosModel, FermiFitOptions, FermiFitResult, FitWarning } from '../lib/fermiEdge';
import { fromInternal, guessAxis, guessUnit, parseSpectrumText, toInternal } from '../lib/spectrumImport';
import type { AxisKind, EnergyUnit, ParsedFile } from '../lib/spectrumImport';
import { isIgorBinaryName, parseIgorBinary } from '../lib/pxtParser';
import { exampleEdgeSpec, syntheticEdgeCSV } from '../lib/synthetic';
import { t, tf } from '../i18n/translations';
import type { Language, TranslationKey } from '../i18n/translations';
import type { Theme } from '../lib/theme';
import './DataFitWorkspace.css';

export interface InitialDataset {
  name: string;
  parsed: ParsedFile;
  note?: string;
  temperature?: number;
  dos?: DosModel;
}

interface FitInput {
  /** First point of the window in the sorted full data */
  i0: number;
  x: number[];
  y: number[];
  options: FermiFitOptions;
}

/** Where a unit / axis setting came from, shown next to it */
type SettingSource = 'file' | 'guess' | 'user';

const SOURCE_LABEL: Record<SettingSource, TranslationKey> = { file: 'fromFile', guess: 'guessed', user: 'setByYou' };

interface Loaded {
  name: string;
  parsed: ParsedFile;
  note?: string;
  region: number;
  energyCol: number;
  /** -1: sum of every column except the energy column */
  intensityCol: number;
  unit: EnergyUnit;
  unitSource: SettingSource;
  axis: AxisKind;
  axisSource: SettingSource;
  /** Non-negative integers: raw counts, so Poisson weights apply */
  countsLike: boolean;
  /** Manual fit window on the internal axis; null = automatic */
  window: [number, number] | null;
}

function columnData(parsed: ParsedFile, region: number, energyCol: number, intensityCol: number) {
  const cols = parsed.regions[region].columns;
  const energy = cols[energyCol];
  const intensity = intensityCol >= 0
    ? cols[intensityCol]
    : energy.map((_, i) => cols.reduce((s, c, k) => (k === energyCol ? s : s + c[i]), 0));
  return { energy, intensity };
}

function prepare(name: string, parsed: ParsedFile, note: string | undefined, region = 0): Loaded {
  const r = parsed.regions[region];
  const energyCol = 0;
  const intensityCol = r.columns.length > 1 ? 1 : 0;
  const { energy, intensity } = columnData(parsed, region, energyCol, intensityCol);
  const u = guessUnit(energy, r.hints);
  const a = guessAxis(energy, intensity, u.unit, r.hints);
  return {
    name, parsed, note, region, energyCol, intensityCol,
    unit: u.unit, unitSource: u.fromFile ? 'file' : 'guess',
    axis: a.axis, axisSource: a.fromFile ? 'file' : 'guess',
    countsLike: intensity.length > 0
      && intensity.every(v => v >= 0 && Number.isInteger(v))
      && intensity.reduce((m, v) => Math.max(m, v), 0) > 20,
    window: null,
  };
}

/** value ± error with the error rounded to two significant digits */
function formatPM(value: number, err: number, scale = 1): string {
  if (!Number.isFinite(value)) return '—';
  const v = value * scale;
  const e = err * scale;
  if (!Number.isFinite(e) || e <= 0) return `${v.toPrecision(6)} ± —`;
  const d = Math.min(8, Math.max(0, 1 - Math.floor(Math.log10(e))));
  return `${v.toFixed(d)} ± ${e.toFixed(d)}`;
}

function warningText(w: FitWarning, lang: Language): string {
  const key = (w.code === 'atBound' ? `warn_atBound_${w.param}` : `warn_${w.code}`) as TranslationKey;
  return t(key, lang);
}

/** Text input that only commits a number on Enter or blur, so typing "-0." does not refit. */
function NumberField({ value, onCommit, digits = 4, invalid = false }: {
  value: number;
  onCommit: (v: number) => void;
  digits?: number;
  invalid?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  // Read the box itself: the edited text may not have re-rendered yet
  const commit = (raw: string) => {
    if (text !== null) {
      const v = parseFloat(raw);
      if (Number.isFinite(v)) onCommit(v);
    }
    setText(null);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      className={`num-field ${invalid ? 'invalid' : ''}`}
      value={text ?? (Number.isFinite(value) ? String(+value.toFixed(digits)) : '')}
      onChange={e => setText(e.target.value)}
      onBlur={e => commit(e.currentTarget.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(null);
      }}
    />
  );
}

interface Props {
  lang: Language;
  theme: Theme;
  initial: InitialDataset | null;
}

export function DataFitWorkspace({ lang, theme, initial }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(() =>
    initial ? prepare(initial.name, initial.parsed, initial.note) : null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [view, setView] = useState<'full' | 'window'>('full');
  const [temperature, setTemperature] = useState(initial?.temperature ?? 300);
  const [fitTemperature, setFitTemperature] = useState(false);
  const [dos, setDos] = useState<DosModel>(initial?.dos ?? 'linear');
  const [background, setBackground] = useState<BackgroundModel>('constant');
  const [poisson, setPoisson] = useState(false);
  const [fit, setFit] = useState<{ result: FermiFitResult; input: FitInput } | null>(null);
  // Temperature / DOS that came with a simulator spectrum, not chosen by the user
  const [modelFromHandoff, setModelFromHandoff] = useState(initial?.temperature !== undefined);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { isRunning, error: workerError, fitFermiEdge } = useFittingWorker();

  // --- loading ---
  const loadParsed = useCallback((name: string, parse: () => ParsedFile, note?: string) => {
    try {
      const next = prepare(name, parse(), note);
      setLoaded(next);
      // Raw counts: weight by 1/counts so the reduced chi-square means something
      setPoisson(next.countsLike);
      if (modelFromHandoff) {
        setTemperature(300);
        setDos('linear');
        setModelFromHandoff(false);
      }
      setLoadError(null);
      setFit(null);
    } catch (err) {
      setLoadError(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [modelFromHandoff]);

  const loadText = useCallback(
    (text: string, name: string, note?: string) => loadParsed(name, () => parseSpectrumText(text, name), note),
    [loadParsed]
  );

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setLoadError(`${file.name}: ${t('readFailed', lang)}`);
    if (isIgorBinaryName(file.name)) {
      reader.onload = () => loadParsed(file.name, () => parseIgorBinary(reader.result as ArrayBuffer, file.name));
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = () => loadText(String(reader.result ?? ''), file.name);
      reader.readAsText(file);
    }
  }, [lang, loadParsed, loadText]);

  const loadExample = useCallback(() => {
    loadText(syntheticEdgeCSV(), 'synthetic-au-edge.csv', 'example');
    setTemperature(exampleEdgeSpec.temperature);
  }, [loadText]);

  const update = useCallback((patch: Partial<Loaded>) => setLoaded(l => (l ? { ...l, ...patch } : l)), []);

  // --- derived data on the internal axis (eV, occupied side at lower x), ascending ---
  const data = useMemo(() => {
    if (!loaded) return null;
    const { energy, intensity } = columnData(loaded.parsed, loaded.region, loaded.energyCol, loaded.intensityCol);
    const pts = energy
      .map((e, i) => ({ x: toInternal(e, loaded.unit, loaded.axis), y: intensity[i] }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    return { x: pts.map(p => p.x), y: pts.map(p => p.y) };
  }, [loaded]);

  const autoWin = useMemo(() => (data && data.x.length >= 8 ? autoFitWindow(data.x, data.y) : null), [data]);
  const manualWin = loaded?.window ?? null;
  const win = useMemo(
    (): [number, number] | null => manualWin ?? (autoWin ? [autoWin.lo, autoWin.hi] : null),
    [manualWin, autoWin]
  );

  const options: FermiFitOptions | null = useMemo(
    () => (temperature > 0
      ? { temperature, fitTemperature, dos, background, weighting: poisson ? 'poisson' : 'uniform' }
      : null),
    [temperature, fitTemperature, dos, background, poisson]
  );

  // Points inside the window; a new object whenever anything that affects the fit changes
  const fitInput = useMemo((): FitInput | null => {
    if (!data || !win || !options) return null;
    let i0 = 0;
    while (i0 < data.x.length && data.x[i0] < win[0]) i0++;
    let i1 = data.x.length - 1;
    while (i1 >= 0 && data.x[i1] > win[1]) i1--;
    return { i0, x: data.x.slice(i0, i1 + 1), y: data.y.slice(i0, i1 + 1), options };
  }, [data, win, options]);

  // Refit automatically (debounced); a newer request supersedes a running one
  useEffect(() => {
    if (!fitInput) return;
    let stale = false;
    const timer = setTimeout(() => {
      fitFermiEdge(fitInput.x, fitInput.y, fitInput.options)
        .then(result => {
          if (!stale) setFit({ result, input: fitInput });
        })
        .catch(() => { /* superseded or cancelled */ });
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [fitInput, fitFermiEdge]);

  const result = fit?.result ?? null;
  const current = fit !== null && fit.input === fitInput;

  // --- chart arrays on the display axis (ascending display x) ---
  const chart = useMemo(() => {
    if (!data || !loaded) return null;
    const n = data.x.length;
    const disp = data.x.map(v => fromInternal(v, loaded.unit, loaded.axis));
    const fitArr: (number | null)[] = new Array(n).fill(null);
    const bgArr: (number | null)[] = new Array(n).fill(null);
    const resArr: (number | null)[] = new Array(n).fill(null);
    // Only draw a fit made for the data now shown
    if (fit && fit.result.fit.length > 0 && fit.input.x[0] === data.x[fit.input.i0]) {
      const { result: r, input: { i0 } } = fit;
      r.fit.forEach((v, k) => {
        if (i0 + k < n) {
          fitArr[i0 + k] = v;
          bgArr[i0 + k] = r.background[k];
          resArr[i0 + k] = r.weighting === 'poisson' ? r.weightedResiduals[k] : r.residuals[k];
        }
      });
    }
    // Internal ascending -> display ascending: a binding-energy axis is mirrored
    const flip = loaded.axis === 'BE';
    const order = <T,>(a: T[]) => (flip ? [...a].reverse() : a);
    return { x: order(disp), y: order(data.y), fit: order(fitArr), bg: order(bgArr), res: order(resArr) };
  }, [data, loaded, fit]);

  const toDisplay = useCallback((v: number) => (loaded ? fromInternal(v, loaded.unit, loaded.axis) : v), [loaded]);
  const winDisplay = useMemo(
    (): [number, number] | null => (win
      ? [Math.min(toDisplay(win[0]), toDisplay(win[1])), Math.max(toDisplay(win[0]), toDisplay(win[1]))]
      : null),
    [win, toDisplay]
  );
  const setWindowDisplay = useCallback((a: number, b: number) => {
    if (!loaded) return;
    const lo = toInternal(a, loaded.unit, loaded.axis);
    const hi = toInternal(b, loaded.unit, loaded.axis);
    if (lo !== hi) update({ window: [Math.min(lo, hi), Math.max(lo, hi)] });
  }, [loaded, update]);

  const unitLabel = loaded?.unit ?? 'eV';
  const unitScale = loaded?.unit === 'meV' ? 1000 : 1;
  const axisName = loaded ? { BE: 'BE', KE: 'KE', EEF: 'E − E_F' }[loaded.axis] : '';
  const seriesLabels = useMemo(
    () => ({ data: t('seriesData', lang), fit: t('seriesFit', lang), background: t('seriesBackground', lang) }),
    [lang]
  );

  // --- results text ---
  const efDisplay = result && Number.isFinite(result.ef) ? toDisplay(result.ef) : null;
  // efDisplay is already in file units; only the error (eV) needs scaling
  const efErrDisplay = result ? result.efErr * unitScale : NaN;
  const efText = result ? `${formatPM(efDisplay ?? NaN, efErrDisplay)} ${unitLabel}` : '';
  const calibration = result && efDisplay !== null && loaded
    ? tf(loaded.axis === 'BE' ? 'calibrationBE' : loaded.axis === 'KE' ? 'calibrationKE' : 'calibrationEEF', lang, {
        ef: `${formatPM(efDisplay, efErrDisplay).split(' ± ')[0]} ${unitLabel}`,
      })
    : '';

  const resultRows = useMemo(() => {
    if (!result || !Number.isFinite(result.ef)) return [];
    const rows: [string, string, string][] = [
      [t('efPosition', lang) + ` (${axisName})`, efText, ''],
      [t('gaussFwhm', lang), `${formatPM(result.fwhm, result.fwhmErr, 1000)} meV`, ''],
      [t('gaussSigma', lang), `${formatPM(result.fwhm / FWHM_PER_SIGMA, result.fwhmErr / FWHM_PER_SIGMA, 1000)} meV`, ''],
      [
        t('temperature', lang),
        result.temperatureFitted ? `${formatPM(result.temperature, result.temperatureErr)} K` : `${result.temperature} K`,
        result.temperatureFitted ? '' : t('fixedTag', lang),
      ],
      [t('width1090', lang), `${(result.width1090 * 1000).toFixed(1)} meV`, ''],
    ];
    if (result.dos === 'linear') rows.push([t('dosSlope', lang), `${formatPM(result.dosSlope, result.dosSlopeErr)} eV⁻¹`, '']);
    rows.push([t('reducedChi2', lang), result.reducedChi2.toPrecision(4), result.weighting === 'poisson' ? 'Poisson' : '']);
    rows.push(['R²', result.rSquared.toFixed(5), '']);
    rows.push([t('pointsParams', lang), `${result.nPoints} / ${result.nParams}`, '']);
    return rows;
  }, [result, lang, axisName, efText]);

  const copyResults = useCallback(() => {
    if (!result || !loaded) return;
    const lines = [
      `# ${loaded.name}`,
      `# window\t${winDisplay?.[0]}\t${winDisplay?.[1]}\t${unitLabel} (${axisName})`,
      ...resultRows.map(r => `${r[0]}\t${r[1]}\t${r[2]}`),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [result, loaded, resultRows, winDisplay, unitLabel, axisName]);

  const exportCsv = useCallback(() => {
    if (!result || !loaded) return;
    const head = [
      `# Fermi-edge fit of ${loaded.name}`,
      ...resultRows.map(r => `# ${r[0]}: ${r[1]} ${r[2]}`),
      `energy_${unitLabel}_${loaded.axis},intensity,fit,background,residual`,
    ];
    const body = result.x.map((xv, i) =>
      [toDisplay(xv), result.y[i], result.fit[i], result.background[i], result.residuals[i]]
        .map(v => +v.toPrecision(10)).join(',')
    );
    const blob = new Blob([[...head, ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${loaded.name.replace(/\.[^.]+$/, '')}-fermi-fit.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [result, loaded, resultRows, unitLabel, toDisplay]);

  // --- render ---
  const region = loaded ? loaded.parsed.regions[loaded.region] : null;
  const nPoints = data?.x.length ?? 0;
  const tempInvalid = !(temperature > 0);

  return (
    <div
      className={`datafit ${dragging ? 'dragging' : ''}`}
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
      }}
    >
      <aside className="datafit-controls">
        {/* 1. Load */}
        <section className="df-section">
          <h3>{t('stepLoad', lang)}</h3>
          <div
            className="drop-zone"
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,.dat,.xy,.vms,.pxt,.ibw"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
                e.target.value = '';
              }}
            />
            <div className="drop-title">{t('dropHere', lang)}</div>
            <div className="drop-sub">{t('dropFormats', lang)}</div>
          </div>
          <div className="df-row df-buttons">
            <button className="df-button" onClick={() => setPasteOpen(o => !o)}>{t('pasteData', lang)}</button>
            <button className="df-button" onClick={loadExample}>{t('tryExample', lang)}</button>
          </div>
          {pasteOpen && (
            <div className="paste-box">
              <textarea
                value={pasteText}
                placeholder={t('pastePlaceholder', lang)}
                onChange={e => setPasteText(e.target.value)}
                rows={6}
              />
              <button
                className="df-button primary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  loadText(pasteText, t('pastedName', lang));
                  setPasteOpen(false);
                }}
              >
                {t('usePasted', lang)}
              </button>
            </div>
          )}
          <p className="df-hint">{t('privacyNote', lang)}</p>
          {loadError && <div className="df-error" role="alert">{loadError}</div>}
          {loaded && region && (
            <div className="df-file">
              <div className="df-file-name" title={loaded.name}>✓ {loaded.name}</div>
              <div className="df-hint">{nPoints} {t('pointsLabel', lang)}</div>
              {loaded.note === 'example' && (
                <div className="df-note">
                  {tf('exampleTruth', lang, {
                    ef: exampleEdgeSpec.efBE,
                    fwhm: exampleEdgeSpec.fwhm * 1000,
                    t: exampleEdgeSpec.temperature,
                  })}
                </div>
              )}
              {loaded.parsed.regions.length > 1 && (
                <label className="df-field">
                  <span>{t('regionLabel', lang)}</span>
                  <select
                    value={loaded.region}
                    onChange={e => {
                      setLoaded(prepare(loaded.name, loaded.parsed, loaded.note, Number(e.target.value)));
                    }}
                  >
                    {loaded.parsed.regions.map((r, i) => <option key={i} value={i}>{r.name}</option>)}
                  </select>
                </label>
              )}
              {region.columns.length > 2 && (
                <>
                  <label className="df-field">
                    <span>{t('energyColumn', lang)}</span>
                    <select value={loaded.energyCol} onChange={e => update({ energyCol: Number(e.target.value), window: null })}>
                      {region.columnNames.map((c, i) => <option key={i} value={i}>{c}</option>)}
                    </select>
                  </label>
                  <label className="df-field">
                    <span>{t('intensityColumn', lang)}</span>
                    <select value={loaded.intensityCol} onChange={e => update({ intensityCol: Number(e.target.value) })}>
                      {region.columnNames.map((c, i) => (i === loaded.energyCol ? null : <option key={i} value={i}>{c}</option>))}
                      <option value={-1}>{t('sumOfColumns', lang)}</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
        </section>

        {/* 2. Axis */}
        <section className={`df-section ${loaded ? '' : 'disabled'}`}>
          <h3>{t('stepAxis', lang)}</h3>
          <div className="df-field">
            <span>
              {t('unitLabel', lang)}
              {loaded && <em className="df-tag">{t(SOURCE_LABEL[loaded.unitSource], lang)}</em>}
            </span>
            <div className="seg">
              {(['eV', 'meV'] as const).map(u => (
                <button
                  key={u}
                  className={loaded?.unit === u ? 'active' : ''}
                  disabled={!loaded}
                  onClick={() => update({ unit: u, unitSource: 'user', window: null })}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="df-field">
            <span>
              {t('axisLabel', lang)}
              {loaded && <em className="df-tag">{t(SOURCE_LABEL[loaded.axisSource], lang)}</em>}
            </span>
            <div className="radio-list">
              {(['BE', 'KE', 'EEF'] as const).map(a => (
                <label key={a} className="radio">
                  <input
                    type="radio"
                    name="axis"
                    checked={loaded?.axis === a}
                    disabled={!loaded}
                    onChange={() => update({ axis: a, axisSource: 'user', window: null })}
                  />
                  {t(a === 'BE' ? 'axisBE' : a === 'KE' ? 'axisKE' : 'axisEEF', lang)}
                </label>
              ))}
            </div>
          </div>
          {loaded?.axisSource === 'guess' && <p className="df-hint">{t('axisGuessHelp', lang)}</p>}
        </section>

        {/* 3. Window */}
        <section className={`df-section ${loaded ? '' : 'disabled'}`}>
          <h3>{t('stepWindow', lang)}</h3>
          <div className="df-row window-row">
            <label>
              {t('windowFrom', lang)}
              <NumberField value={winDisplay?.[0] ?? NaN} onCommit={v => winDisplay && setWindowDisplay(v, winDisplay[1])} />
            </label>
            <label>
              {t('windowTo', lang)}
              <NumberField value={winDisplay?.[1] ?? NaN} onCommit={v => winDisplay && setWindowDisplay(winDisplay[0], v)} />
            </label>
            <span className="df-unit">{unitLabel}</span>
            <button
              className={`df-button small ${loaded && !loaded.window ? 'active' : ''}`}
              disabled={!loaded}
              onClick={() => update({ window: null })}
            >
              {t('autoWindow', lang)}
            </button>
          </div>
          {loaded && !loaded.window && autoWin && (
            <p className="df-hint">{tf('windowIsAuto', lang, { half: +autoWin.half.toFixed(2) })}</p>
          )}
          <p className="df-hint">{t('windowHelp', lang)}</p>
        </section>

        {/* 4. Model */}
        <section className="df-section">
          <h3>{t('stepModel', lang)}</h3>
          <label className="df-field inline">
            <span>{t('sampleTemperature', lang)}</span>
            <NumberField
              value={temperature}
              onCommit={v => {
                setTemperature(v);
                setModelFromHandoff(false);
              }}
              digits={2}
              invalid={tempInvalid}
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={fitTemperature} onChange={e => setFitTemperature(e.target.checked)} />
            {t('fitTempShort', lang)}
          </label>
          {fitTemperature && <p className="df-hint warn">{t('fitTempHelp', lang)}</p>}
          <div className="df-field inline">
            <span>{t('dosModel', lang)}</span>
            <div className="seg">
              {(['flat', 'linear'] as const).map(d => (
                <button
                  key={d}
                  className={dos === d ? 'active' : ''}
                  onClick={() => {
                    setDos(d);
                    setModelFromHandoff(false);
                  }}
                >
                  {t(d === 'flat' ? 'dosFlat' : 'dosLinear', lang)}
                </button>
              ))}
            </div>
          </div>
          <div className="df-field inline">
            <span>{t('backgroundModel', lang)}</span>
            <div className="seg">
              {(['constant', 'linear'] as const).map(b => (
                <button key={b} className={background === b ? 'active' : ''} onClick={() => setBackground(b)}>
                  {t(b === 'constant' ? 'bgConstant' : 'bgLinear', lang)}
                </button>
              ))}
            </div>
          </div>
          <label className="checkbox-label" title={t('poissonHelp', lang)}>
            <input type="checkbox" checked={poisson} onChange={e => setPoisson(e.target.checked)} />
            {t('poissonWeights', lang)}
            {poisson && loaded?.countsLike && <em className="df-tag">{t('countsDetected', lang)}</em>}
          </label>
          <p className="df-hint">{t('poissonHelp', lang)}</p>
          {!poisson && loaded?.countsLike && <p className="df-hint warn">{t('countsHint', lang)}</p>}
          <p className="df-hint">{t('autoFitNote', lang)}</p>
        </section>
      </aside>

      <main className="datafit-main-area">
        <div className="chart-panel">
          <div className="df-chart-header">
            <h3>{loaded ? loaded.name : t('modeDataFit', lang)}</h3>
            <div className="df-chart-tools">
              {isRunning && <span className="df-busy">{t('fittingNow', lang)}</span>}
              <div className="seg">
                <button className={view === 'full' ? 'active' : ''} onClick={() => setView('full')} disabled={!loaded}>
                  {t('viewFull', lang)}
                </button>
                <button className={view === 'window' ? 'active' : ''} onClick={() => setView('window')} disabled={!loaded}>
                  {t('viewWindow', lang)}
                </button>
              </div>
            </div>
          </div>
          {chart && chart.x.length >= 2 ? (
            <DataFitChart
              x={chart.x}
              y={chart.y}
              fit={chart.fit}
              background={chart.bg}
              residuals={chart.res}
              window={winDisplay}
              ef={efDisplay}
              reversed={loaded?.axis === 'BE'}
              view={view}
              xLabel={`${axisName} (${unitLabel})`}
              yLabel={t('intensityLabel', lang)}
              residualLabel={t(poisson ? 'residualNorm' : 'residualRaw', lang)}
              seriesLabels={seriesLabels}
              onSelectWindow={setWindowDisplay}
              theme={theme}
            />
          ) : (
            <div className="df-empty">{t('emptyPlot', lang)}</div>
          )}
        </div>

        {result && (
          <div className={`chart-panel df-results ${current ? '' : 'stale'}`}>
            <div className="df-chart-header">
              <h3>{t('results', lang)}</h3>
              <div className="df-chart-tools">
                <button className="df-button small" onClick={copyResults} disabled={!Number.isFinite(result.ef)}>
                  {copied ? t('copied', lang) : t('copyResults', lang)}
                </button>
                <button className="df-button small" onClick={exportCsv} disabled={!result.fit.length}>
                  {t('exportCsv', lang)}
                </button>
              </div>
            </div>
            {result.warnings.length === 0 ? (
              <div className="df-status ok">✓ {t('fitOk', lang)}</div>
            ) : (
              <div className="df-status warn">
                <div>⚠ {t('fitCheck', lang)}</div>
                <ul>
                  {result.warnings.map((w, i) => <li key={i}>{warningText(w, lang)}</li>)}
                </ul>
              </div>
            )}
            {resultRows.length > 0 && (
              <>
                <table className="df-table">
                  <tbody>
                    {resultRows.map(([k, v, note]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td className="mono">{v}</td>
                        <td className="df-tag-cell">{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {calibration && <p className="df-calibration">{calibration}</p>}
                <p className="df-hint">{t('uncertaintyNote', lang)}</p>
              </>
            )}
          </div>
        )}
        {workerError && <div className="df-error">{workerError}</div>}
      </main>
    </div>
  );
}
