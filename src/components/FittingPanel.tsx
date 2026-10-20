/**
 * Fitting Panel Component
 * UI for Fermi edge fitting and IRF parameter estimation
 */

import { useState, useCallback } from 'react';
import { useFittingWorker } from '../hooks/useFittingWorker';
import type { IRFEstimationResult } from '../lib/fitting';
import { FWHM_PER_SIGMA } from '../lib/fermiEdge';
import type { FermiFitResult, FitWarning } from '../lib/fermiEdge';
import type { SimulatorParams } from '../lib/simulator';
import { t } from '../i18n/translations';
import type { Language, TranslationKey } from '../i18n/translations';
import './FittingPanel.css';

interface FittingPanelProps {
  energy: number[];           // Energy in meV
  observedSpectrum: number[];
  temp: number;
  lang: Language;
  /** Combined resolution set on the sliders (meV), shown next to the fitted one */
  trueSigma?: number;
  onApplyIRFParams?: (params: Partial<SimulatorParams>) => void;
  onFitResult?: (fittedSpectrum: number[] | null) => void;
  onSendToDataFit?: () => void;
}

type FittingMode = 'fermi' | 'irf';
type FittingStatus = 'idle' | 'running' | 'success' | 'error';

// Helper to format value with error, showing — if the error is not available
function formatWithError(value: number, error: number, decimals: number, unit: string): string {
  const valueStr = value.toFixed(decimals);
  const errorStr = Number.isFinite(error) ? error.toFixed(decimals) : '—';
  return `${valueStr} ± ${errorStr} ${unit}`;
}

// The user pressed Cancel: not an error to report
function isCancellation(err: unknown): boolean {
  return err instanceof Error && err.message === 'Operation cancelled';
}

function warningText(w: FitWarning, lang: Language): string {
  const key = (w.code === 'atBound' ? `warn_atBound_${w.param}` : `warn_${w.code}`) as TranslationKey;
  return t(key, lang);
}

export function FittingPanel({
  energy,
  observedSpectrum,
  temp,
  lang,
  trueSigma,
  onApplyIRFParams,
  onFitResult,
  onSendToDataFit,
}: FittingPanelProps) {
  const [mode, setMode] = useState<FittingMode>('fermi');
  const [fitTemp, setFitTemp] = useState(false);  // Default to fixed temperature for stability
  const [status, setStatus] = useState<FittingStatus>('idle');
  // Each result remembers the spectrum it was fitted to, so a result left
  // over from before a slider moved is flagged instead of shown as current
  const [fermiFit, setFermiFit] = useState<{ result: FermiFitResult; spectrum: number[] } | null>(null);
  const [irfFit, setIrfFit] = useState<{ result: IRFEstimationResult; spectrum: number[] } | null>(null);
  const [expanded, setExpanded] = useState(true);

  const { isRunning, progress, error, fitFermiEdge, estimateIRF, cancel } = useFittingWorker();
  const fermiResult = fermiFit?.result ?? null;
  const irfResult = irfFit?.result ?? null;
  const fermiStale = fermiFit !== null && fermiFit.spectrum !== observedSpectrum;
  const irfStale = irfFit !== null && irfFit.spectrum !== observedSpectrum;

  const handleFitFermiEdge = useCallback(async () => {
    setStatus('running');
    setFermiFit(null);

    try {
      // Simulator axis is E - E_F in meV; the fit works in eV
      const result = await fitFermiEdge(energy.map(e => e / 1000), observedSpectrum, {
        temperature: temp,
        fitTemperature: fitTemp,
        dos: 'flat',
        background: 'constant',
        weighting: 'uniform',
      });
      setFermiFit({ result, spectrum: observedSpectrum });
      setStatus(Number.isFinite(result.ef) ? 'success' : 'error');
      onFitResult?.(result.fit.length === energy.length ? result.fit : null);
    } catch (err) {
      if (isCancellation(err)) return;
      setStatus('error');
      console.error('Fermi edge fitting error:', err);
      onFitResult?.(null);
    }
  }, [energy, observedSpectrum, temp, fitTemp, fitFermiEdge, onFitResult]);

  const handleEstimateIRF = useCallback(async () => {
    setStatus('running');
    setIrfFit(null);

    try {
      const result = await estimateIRF(observedSpectrum, temp);
      setIrfFit({ result, spectrum: observedSpectrum });
      setStatus(result.success ? 'success' : 'error');
    } catch (err) {
      if (isCancellation(err)) return;
      setStatus('error');
      console.error('IRF estimation error:', err);
    }
  }, [observedSpectrum, temp, estimateIRF]);

  const handleApplyParams = useCallback(() => {
    if (irfResult && onApplyIRFParams) {
      onApplyIRFParams({
        kappa: irfResult.parameters.kappa,
        theta: irfResult.parameters.theta,
        sigmaRes: irfResult.parameters.sigmaRes,
        alpha: irfResult.parameters.alpha,
        sigmaX: irfResult.parameters.sigmaX,
        sigmaY: irfResult.parameters.sigmaY,
        gammaX: irfResult.parameters.gammaX,
        gammaY: irfResult.parameters.gammaY,
      });
    }
  }, [irfResult, onApplyIRFParams]);

  const handleCancel = useCallback(() => {
    cancel();
    setStatus('idle');
  }, [cancel]);

  return (
    <section className={`fitting-panel ${expanded ? 'expanded' : ''}`}>
      <div className="fitting-header" onClick={() => setExpanded(!expanded)}>
        <h3>{t('fitting', lang)}</h3>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="fitting-content">
          {/* Mode Selection */}
          <div className="fitting-mode-tabs">
            <button
              className={mode === 'fermi' ? 'active' : ''}
              onClick={() => setMode('fermi')}
              disabled={isRunning}
            >
              {t('fermiFitting', lang)}
            </button>
            <button
              className={mode === 'irf' ? 'active' : ''}
              onClick={() => setMode('irf')}
              disabled={isRunning}
            >
              {t('irfEstimation', lang)}
            </button>
          </div>

          {/* Fermi Edge Fitting */}
          {mode === 'fermi' && (
            <div className="fitting-section">
              <p className="fitting-description">{t('fermiFittingDesc', lang)}</p>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={fitTemp}
                  onChange={(e) => setFitTemp(e.target.checked)}
                  disabled={isRunning}
                />
                {t('fitTemperature', lang)}
              </label>

              <button
                className="fit-button"
                onClick={handleFitFermiEdge}
                disabled={isRunning}
              >
                {isRunning ? t('running', lang) : t('runFitting', lang)}
              </button>

              {fermiResult && Number.isFinite(fermiResult.ef) && (
                <div className={`fitting-results ${fermiStale ? 'stale' : ''}`}>
                  <h4>{t('results', lang)}</h4>
                  {fermiStale && <p className="stale-note">{t('spectrumChanged', lang)}</p>}
                  {fermiResult.warnings.length > 0 && (
                    <ul className="fit-warnings">
                      {fermiResult.warnings.map((w, i) => <li key={i}>{warningText(w, lang)}</li>)}
                    </ul>
                  )}
                  <table className="results-table">
                    <tbody>
                      <tr>
                        <td>{t('efShift', lang)}</td>
                        <td>{formatWithError(fermiResult.ef * 1000, fermiResult.efErr * 1000, 3, 'meV')}</td>
                      </tr>
                      <tr>
                        <td>{t('totalResolution', lang)}</td>
                        <td>{formatWithError(fermiResult.fwhm / FWHM_PER_SIGMA * 1000, fermiResult.fwhmErr / FWHM_PER_SIGMA * 1000, 3, 'meV')}</td>
                      </tr>
                      {trueSigma !== undefined && (
                        <tr className="reference-row">
                          <td>{t('simulatorSigma', lang)}</td>
                          <td>{trueSigma.toFixed(3)} meV</td>
                        </tr>
                      )}
                      <tr>
                        <td>{t('gaussFwhm', lang)}</td>
                        <td>{formatWithError(fermiResult.fwhm * 1000, fermiResult.fwhmErr * 1000, 3, 'meV')}</td>
                      </tr>
                      {fitTemp && (
                        <tr>
                          <td>{t('fittedTemp', lang)}</td>
                          <td>{formatWithError(fermiResult.temperature, fermiResult.temperatureErr, 2, 'K')}</td>
                        </tr>
                      )}
                      <tr>
                        <td>R²</td>
                        <td>{fermiResult.rSquared.toFixed(6)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {onSendToDataFit && (
                <button className="link-button" onClick={onSendToDataFit} disabled={isRunning}>
                  {t('sendToDataFit', lang)} →
                </button>
              )}
            </div>
          )}

          {/* IRF Parameter Estimation */}
          {mode === 'irf' && (
            <div className="fitting-section">
              <p className="fitting-description">{t('irfEstimationDesc', lang)}</p>

              <button
                className="fit-button"
                onClick={handleEstimateIRF}
                disabled={isRunning}
              >
                {isRunning ? t('running', lang) : t('runEstimation', lang)}
              </button>

              {isRunning && progress && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress.progress}%` }}
                  />
                  <span className="progress-text">
                    {t('iteration', lang)}: {progress.iteration} |
                    MSE: {progress.fitness.toExponential(3)}
                  </span>
                </div>
              )}

              {irfResult && irfResult.success && (
                <div className={`fitting-results ${irfStale ? 'stale' : ''}`}>
                  <h4>{t('estimatedParams', lang)}</h4>
                  {irfStale && <p className="stale-note">{t('spectrumChanged', lang)}</p>}
                  <table className="results-table">
                    <tbody>
                      <tr>
                        <td>κ (Smile)</td>
                        <td>{irfResult.parameters.kappa.toFixed(4)}</td>
                      </tr>
                      <tr>
                        <td>θ (Tilt)</td>
                        <td>{irfResult.parameters.theta.toFixed(3)}°</td>
                      </tr>
                      <tr>
                        <td>σ_res</td>
                        <td>{irfResult.parameters.sigmaRes.toFixed(3)} meV</td>
                      </tr>
                      <tr>
                        <td>α (Gradient)</td>
                        <td>{irfResult.parameters.alpha.toFixed(5)}</td>
                      </tr>
                      <tr>
                        <td>σ_x (Source)</td>
                        <td>{irfResult.parameters.sigmaX.toFixed(3)} meV</td>
                      </tr>
                      <tr>
                        <td>σ_y (Spot)</td>
                        <td>{irfResult.parameters.sigmaY.toFixed(3)} mm</td>
                      </tr>
                      <tr>
                        <td>γ_x</td>
                        <td>{irfResult.parameters.gammaX.toFixed(3)}</td>
                      </tr>
                      <tr>
                        <td>γ_y</td>
                        <td>{irfResult.parameters.gammaY.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="result-meta">
                    <span>MSE: {irfResult.finalLoss.toExponential(3)}</span>
                    <span>{t('evaluations', lang)}: {irfResult.evaluations}</span>
                  </div>
                  <button
                    className="apply-button"
                    onClick={handleApplyParams}
                  >
                    {t('applyParams', lang)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cancel Button */}
          {isRunning && (
            <button className="cancel-button" onClick={handleCancel}>
              {t('cancel', lang)}
            </button>
          )}

          {/* Error Display */}
          {(status === 'error' || error) && (
            <div className="error-message">
              {error || t('fittingError', lang)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
