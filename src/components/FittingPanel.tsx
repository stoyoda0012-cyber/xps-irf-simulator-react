/**
 * Fitting Panel Component
 * UI for Fermi edge fitting and IRF parameter estimation
 */

import { useState, useCallback } from 'react';
import { useFittingWorker } from '../hooks/useFittingWorker';
import type { FermiEdgeFitResult, IRFEstimationResult } from '../lib/fitting';
import type { SimulatorParams } from '../lib/simulator';
import { t } from '../i18n/translations';
import type { Language } from '../i18n/translations';
import './FittingPanel.css';

interface FittingPanelProps {
  energy: number[];           // Energy in meV
  observedSpectrum: number[];
  temp: number;
  lang: Language;
  onApplyIRFParams?: (params: Partial<SimulatorParams>) => void;
  onFitResult?: (fittedSpectrum: number[] | null) => void;
}

type FittingMode = 'fermi' | 'irf';
type FittingStatus = 'idle' | 'running' | 'success' | 'error';

// Helper to format value with error, showing N/A if error is NaN
function formatWithError(value: number, error: number, decimals: number, unit: string): string {
  const valueStr = value.toFixed(decimals);
  const errorStr = isNaN(error) ? 'N/A' : error.toFixed(decimals);
  return `${valueStr} ± ${errorStr} ${unit}`;
}

export function FittingPanel({
  energy,
  observedSpectrum,
  temp,
  lang,
  onApplyIRFParams,
  onFitResult,
}: FittingPanelProps) {
  const [mode, setMode] = useState<FittingMode>('fermi');
  const [fitTemp, setFitTemp] = useState(false);  // Default to fixed temperature for stability
  const [status, setStatus] = useState<FittingStatus>('idle');
  const [fermiResult, setFermiResult] = useState<FermiEdgeFitResult | null>(null);
  const [irfResult, setIrfResult] = useState<IRFEstimationResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { isRunning, progress, error, fitFermiEdge, estimateIRF, cancel } = useFittingWorker();

  // Convert energy from meV to eV for fitting
  const energyEV = energy.map(e => e / 1000);

  const handleFitFermiEdge = useCallback(async () => {
    setStatus('running');
    setFermiResult(null);

    try {
      const result = await fitFermiEdge(energyEV, observedSpectrum, temp, fitTemp, true);
      setFermiResult(result);
      setStatus(result.success ? 'success' : 'error');
      // Notify parent with fitted spectrum
      if (result.success && onFitResult) {
        onFitResult(result.fittedSpectrum);
      }
    } catch (err) {
      setStatus('error');
      console.error('Fermi edge fitting error:', err);
      if (onFitResult) onFitResult(null);
    }
  }, [energyEV, observedSpectrum, temp, fitTemp, fitFermiEdge, onFitResult]);

  const handleEstimateIRF = useCallback(async () => {
    setStatus('running');
    setIrfResult(null);

    try {
      const result = await estimateIRF(observedSpectrum, temp);
      setIrfResult(result);
      setStatus(result.success ? 'success' : 'error');
    } catch (err) {
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

              {isRunning && progress && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress.progress}%` }}
                  />
                  <span className="progress-text">
                    {t('iteration', lang)}: {progress.iteration} |
                    {t('fitness', lang)}: {progress.fitness.toExponential(3)}
                  </span>
                </div>
              )}

              {fermiResult && fermiResult.success && (
                <div className="fitting-results">
                  <h4>{t('results', lang)}</h4>
                  <table className="results-table">
                    <tbody>
                      <tr>
                        <td>{t('efShift', lang)}</td>
                        <td>{formatWithError(fermiResult.efShift * 1000, fermiResult.efShiftError * 1000, 3, 'meV')}</td>
                      </tr>
                      <tr>
                        <td>{t('totalResolution', lang)}</td>
                        <td>{formatWithError(fermiResult.sigmaTotal * 1000, fermiResult.sigmaTotalError * 1000, 3, 'meV')}</td>
                      </tr>
                      {fitTemp && (
                        <tr>
                          <td>{t('fittedTemp', lang)}</td>
                          <td>{formatWithError(fermiResult.tempFit, fermiResult.tempError, 2, 'K')}</td>
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
                <div className="fitting-results">
                  <h4>{t('estimatedParams', lang)}</h4>
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
