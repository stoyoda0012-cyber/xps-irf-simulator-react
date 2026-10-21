import { useState, useMemo, useCallback } from 'react';
import { simulate, defaultParams } from './lib/simulator';
import type { SimulatorParams } from './lib/simulator';
import { SpectrumChartCanvas, IRFChartCanvas } from './components/SpectrumChartCanvas';
import { HeatMap } from './components/HeatMap';
import { Slider } from './components/Slider';
import { FittingPanel } from './components/FittingPanel';
import { DataFitWorkspace } from './components/DataFitWorkspace';
import type { InitialDataset } from './components/DataFitWorkspace';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { t } from './i18n/translations';
import type { Language } from './i18n/translations';
import './App.css';

type AppMode = 'simulator' | 'data';

// #fit opens the data-fit view directly, so it can be bookmarked or shared
const DATA_FIT_HASH = '#fit';

function App() {
  const [lang, setLang] = useState<Language>('en');
  const [theme, toggleTheme] = useTheme();
  const [mode, setModeState] = useState<AppMode>(() =>
    window.location.hash === DATA_FIT_HASH ? 'data' : 'simulator'
  );
  const [params, setParams] = useState<SimulatorParams>(defaultParams);
  const [fittedSpectrum, setFittedSpectrum] = useState<number[] | null>(null);
  // Spectrum handed from the simulator to the data-fit view; the version
  // remounts the workspace so it starts from that spectrum
  const [handoff, setHandoff] = useState<{ version: number; dataset: InitialDataset } | null>(null);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    const url = window.location.pathname + window.location.search + (next === 'data' ? DATA_FIT_HASH : '');
    window.history.replaceState(null, '', url);
  }, []);

  // Update a single parameter
  const updateParam = useCallback((key: keyof SimulatorParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
    // Clear fitted spectrum when parameters change
    setFittedSpectrum(null);
  }, []);

  // Apply multiple parameters (from IRF estimation)
  const applyParams = useCallback((newParams: Partial<SimulatorParams>) => {
    setParams(prev => ({ ...prev, ...newParams }));
    setFittedSpectrum(null);
  }, []);

  // Handle fit result from FittingPanel
  const handleFitResult = useCallback((fitted: number[] | null) => {
    setFittedSpectrum(fitted);
  }, []);

  // Run simulation (memoized for performance)
  const result = useMemo(() => simulate(params), [params]);

  const sendToDataFit = useCallback(() => {
    const name = t('simSpectrumName', lang);
    setHandoff(prev => ({
      version: (prev?.version ?? 0) + 1,
      dataset: {
        name,
        parsed: {
          format: 'text',
          regions: [{
            name,
            columns: [result.energy, result.spectrum],
            columnNames: ['E − E_F (meV)', 'Intensity'],
            hints: { unit: 'meV', axis: 'EEF' },
          }],
        },
        temperature: params.temp,
        dos: 'flat',
      },
    }));
    setMode('data');
  }, [lang, result, params.temp, setMode]);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>{t('title', lang)}</h1>
          <p className="subtitle">{t('subtitle', lang)}</p>
        </div>
        <div className="mode-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'simulator'}
            className={mode === 'simulator' ? 'active' : ''}
            onClick={() => setMode('simulator')}
          >
            {t('modeSimulator', lang)}
          </button>
          <button
            role="tab"
            aria-selected={mode === 'data'}
            className={mode === 'data' ? 'active' : ''}
            onClick={() => setMode('data')}
          >
            {t('modeDataFit', lang)}
          </button>
        </div>
        <div className="header-buttons">
          <a
            href={lang === 'ja' ? 'docs/concept_ja.html' : 'docs/concept.html'}
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
          >
            {t('concept', lang)}
          </a>
          <a
            href={lang === 'ja' ? 'docs/manual_ja.html' : 'docs/manual.html'}
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
          >
            {t('manual', lang)}
          </a>
          <ThemeToggle theme={theme} onToggle={toggleTheme} title={t('toggleTheme', lang)} />
          <div className="lang-toggle">
            <button
              className={lang === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              className={lang === 'ja' ? 'active' : ''}
              onClick={() => setLang('ja')}
            >
              日本語
            </button>
          </div>
        </div>
      </header>

      {/* Both views stay mounted so switching keeps their state */}
      <div className="main-container" hidden={mode !== 'data'}>
        <DataFitWorkspace
          key={handoff?.version ?? 0}
          lang={lang}
          theme={theme}
          initial={handoff?.dataset ?? null}
        />
      </div>

      <div className="main-container" hidden={mode !== 'simulator'}>
        {/* Sidebar */}
        <aside className="sidebar">
          {/* X-ray Source */}
          <section className="param-section">
            <h3>{t('xraySource', lang)}</h3>
            <Slider
              label={t('sourceResolution', lang)}
              value={params.sigmaX}
              min={0.01}
              max={2.0}
              step={0.01}
              unit="meV"
              onChange={(v) => updateParam('sigmaX', v)}
            />
            <Slider
              label={t('spotWidth', lang)}
              value={params.sigmaY}
              min={0.01}
              max={2.0}
              step={0.01}
              unit="mm"
              onChange={(v) => updateParam('sigmaY', v)}
            />
            <Slider
              label={t('energySkew', lang)}
              value={params.gammaX}
              min={-5.0}
              max={5.0}
              step={0.1}
              onChange={(v) => updateParam('gammaX', v)}
            />
            <Slider
              label={t('spatialSkew', lang)}
              value={params.gammaY}
              min={-10.0}
              max={10.0}
              step={0.1}
              onChange={(v) => updateParam('gammaY', v)}
            />
            <Slider
              label={t('energyGradient', lang)}
              value={params.alpha}
              min={-0.01}
              max={0.01}
              step={0.0001}
              onChange={(v) => updateParam('alpha', v)}
              format={(v) => v.toFixed(4)}
            />
          </section>

          {/* Detector */}
          <section className="param-section">
            <h3>{t('detector', lang)}</h3>
            <Slider
              label={t('smileCurvature', lang)}
              value={params.kappa}
              min={0}
              max={0.2}
              step={0.001}
              onChange={(v) => updateParam('kappa', v)}
              format={(v) => v.toFixed(3)}
            />
            <Slider
              label={t('detectorTilt', lang)}
              value={params.theta}
              min={-1.0}
              max={1.0}
              step={0.01}
              unit="°"
              onChange={(v) => updateParam('theta', v)}
            />
            <Slider
              label={t('detectorResolution', lang)}
              value={params.sigmaRes}
              min={0.1}
              max={10.0}
              step={0.1}
              unit="meV"
              onChange={(v) => updateParam('sigmaRes', v)}
            />
          </section>

          {/* Noise */}
          <section className="param-section">
            <h3>{t('noise', lang)}</h3>
            <Slider
              label={t('poissonNoise', lang)}
              value={Math.log10(params.poissonNoise || 0.00001)}
              min={-5}
              max={3}
              step={0.1}
              onChange={(v) => updateParam('poissonNoise', Math.pow(10, v))}
              format={(v) => `10^${v.toFixed(1)}`}
            />
            <Slider
              label={t('gaussianNoise', lang)}
              value={params.gaussianNoise || 0}
              min={0}
              max={10}
              step={0.1}
              unit="%"
              onChange={(v) => updateParam('gaussianNoise', v)}
            />
          </section>

          {/* Measurement */}
          <section className="param-section">
            <h3>{t('measurement', lang)}</h3>
            <Slider
              label={t('temperature', lang)}
              value={params.temp}
              min={0.1}
              max={300}
              step={0.1}
              unit="K"
              onChange={(v) => updateParam('temp', v)}
            />
          </section>

          {/* Resolution Summary */}
          <section className="param-section resolution-summary">
            <h3>{t('resolutionSummary', lang)}</h3>
            <div className="resolution-item">
              <span className="resolution-label">{t('sourceResolution', lang)}</span>
              <span className="resolution-value">{result.sigmaSource.toFixed(2)} meV</span>
            </div>
            <div className="resolution-item">
              <span className="resolution-label">{t('detectorResolution', lang)}</span>
              <span className="resolution-value">{result.sigmaDetector.toFixed(2)} meV</span>
            </div>
            <div className="resolution-item combined">
              <span className="resolution-label">{t('combinedResolution', lang)}</span>
              <span className="resolution-value">{result.sigmaCombined.toFixed(2)} meV</span>
            </div>
            <div className="resolution-formula">
              σ = √(σ<sub>src</sub>² + σ<sub>det</sub>²)
            </div>
          </section>

          {/* Fitting Panel */}
          <FittingPanel
            energy={result.energy}
            observedSpectrum={result.spectrum}
            temp={params.temp}
            lang={lang}
            trueSigma={result.sigmaCombined}
            onApplyIRFParams={applyParams}
            onFitResult={handleFitResult}
            onSendToDataFit={sendToDataFit}
          />
        </aside>

        {/* Main Content */}
        <main className="content">
          <div className="charts-grid">
            {/* 1D Spectrum */}
            <div className="chart-panel spectrum-panel">
              <h3>{t('spectrum1D', lang)}</h3>
              <SpectrumChartCanvas
                energy={result.energy}
                spectrum={result.spectrum}
                spectrumClean={result.spectrumClean}
                idealFD={result.idealFD}
                fittedSpectrum={fittedSpectrum}
                height={210}
                theme={theme}
              />
            </div>

            {/* IRF */}
            <div className="chart-panel irf-panel">
              <h3>{t('irf', lang)}</h3>
              <IRFChartCanvas energy={result.energy} irf={result.irf} height={210} theme={theme} />
            </div>

            {/* 2D Spot Profile */}
            <div className="chart-panel heatmap-panel">
              <HeatMap
                data={result.spotProfile}
                xAxis={result.energy}
                yAxis={result.yAxis}
                title={t('spotProfile', lang)}
                colormap="hot"
                width={220}
                height={220}
              />
            </div>

            {/* 2D Detector Image */}
            <div className="chart-panel heatmap-panel">
              <HeatMap
                data={result.image2D}
                xAxis={result.energy}
                yAxis={result.yAxis}
                title={t('detectorImage', lang)}
                colormap="viridis"
                width={220}
                height={220}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>{t('realtime', lang)}</p>
      </footer>
    </div>
  );
}

export default App;
