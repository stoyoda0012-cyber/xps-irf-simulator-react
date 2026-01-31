/**
 * Spectrum Browser - 爆速スペクトル・ブラウザー（デモモード対応）
 *
 * 「指に吸い付くような」ブラウジング体験を実現するための最適化:
 * 1. Throttling: マウスイベントの発生頻度を制限（16ms or 32ms間隔）
 * 2. AbortController: 新しいリクエスト時に未完了の前のfetchを中断
 * 3. requestAnimationFrame: 描画をVSyncに同期
 * 4. uPlot: Canvas描画で60FPS維持
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { XYPadController } from './XYPadController';
import { PerformanceMonitor } from './PerformanceMonitor';
import type { PerformanceMetrics } from './PerformanceMonitor';

// API設定
const API_BASE_URL = 'http://localhost:8000';

// Throttle関数（lodash不要の軽量実装）
function throttle<T extends (...args: Parameters<T>) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          func.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

// カラーパレット（5元素用）
const ELEMENT_COLORS = [
  '#ff6b6b', // 赤
  '#4ecdc4', // シアン
  '#ffe66d', // 黄
  '#95e1d3', // ミント
  '#f38181', // サーモン
  '#aa96da', // 紫
  '#fcbad3', // ピンク
  '#a8d8ea', // 水色
  '#f9f871', // レモン
  '#c7f2a4', // ライム
];

// ===== ローカル計算用関数（デモモード用） =====

/**
 * Pseudo-Voigt近似 - 高速なVoigt関数近似
 */
function pseudoVoigt(x: number, center: number, sigma: number, gamma: number): number {
  const fG = 2.0 * sigma * Math.sqrt(2.0 * Math.log(2.0));
  const fL = 2.0 * gamma;
  const fV = 0.5346 * fL + Math.sqrt(0.2166 * fL * fL + fG * fG);

  let eta = 0;
  if (fV > 0) {
    const ratio = fL / fV;
    eta = 1.36603 * ratio - 0.47719 * ratio * ratio + 0.11116 * ratio * ratio * ratio;
  }
  eta = Math.max(0, Math.min(1, eta));

  const gaussian = sigma > 0 ? Math.exp(-0.5 * Math.pow((x - center) / sigma, 2)) : 0;
  const lorentzian = gamma > 0 ? 1.0 / (1.0 + Math.pow((x - center) / gamma, 2)) : 0;

  return eta * lorentzian + (1 - eta) * gaussian;
}

/**
 * 単一元素のスペクトルを生成
 */
function generateSpectrum(
  xArray: number[],
  p1: number,
  p2: number,
  elementIdx: number
): number[] {
  const basePositions = [0, 100, 200, 350, 500];
  const basePos = basePositions[elementIdx % basePositions.length];
  const center = basePos + p1 * 50;
  const sigma = 5 + (1 - p2) * 10;
  const gamma = 2 + (1 - p2) * 5;
  const intensity = 0.5 + p2 * 0.5;

  return xArray.map(x => {
    let value = intensity * pseudoVoigt(x, center, sigma, gamma);
    // サテライトピーク
    const satOffset = 20 + elementIdx * 5;
    value += 0.3 * intensity * pseudoVoigt(x, center + satOffset, sigma * 1.5, gamma * 1.5);
    // バックグラウンド
    value += 0.05 * (1 - Math.exp(-0.01 * (x - center + 100)));
    return value;
  });
}

// ===== コンポーネント =====

interface SpectrumBrowserProps {
  /** スロットル間隔 (ms) - デフォルト16ms (60FPS) */
  throttleMs?: number;
  /** ポイント数/スペクトル */
  nPoints?: number;
  /** スペクトル数/元素 */
  nSpectra?: number;
  /** 元素数 */
  nElements?: number;
  /** デモモード（バックエンドなしで動作） */
  demoMode?: boolean;
}

export const SpectrumBrowser: React.FC<SpectrumBrowserProps> = ({
  throttleMs = 16,
  nPoints: initialNPoints = 100,
  nSpectra: initialNSpectra = 1,
  nElements: initialNElements = 1,
  demoMode = false
}) => {
  // パラメータ状態
  const [p1, setP1] = useState(0);
  const [p2, setP2] = useState(0);
  const [nPoints, setNPoints] = useState(initialNPoints);
  const [nSpectra] = useState(initialNSpectra);
  const [nElements, setNElements] = useState(initialNElements);
  const [useDemoMode, setUseDemoMode] = useState(demoMode);

  // データ状態
  const [xData, setXData] = useState<number[]>([]);
  const [yData, setYData] = useState<number[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // パフォーマンスメトリクス
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    rtt: 0,
    serverCalcTime: 0,
    parseTime: 0,
    renderTime: 0,
    totalPoints: 0,
    dataSize: 0,
    cancelledRequests: 0,
    successfulRequests: 0,
    fps: 0
  });

  // uPlot参照
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const prevSeriesCountRef = useRef<number>(0);

  // AbortController参照
  const abortControllerRef = useRef<AbortController | null>(null);

  // FPS計測用
  const lastFrameTimeRef = useRef<number>(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);

  // ローカル計算関数（デモモード用）
  const calculateLocal = useCallback((
    paramP1: number,
    paramP2: number,
    paramNPoints: number,
    paramNSpectra: number,
    paramNElements: number
  ) => {
    const startTime = performance.now();

    // X軸生成
    const x: number[] = [];
    for (let i = 0; i < paramNPoints; i++) {
      x.push(-100 + (700 * i) / (paramNPoints - 1));
    }

    // Y軸データ生成
    const allY: number[][] = [];
    for (let elem = 0; elem < paramNElements; elem++) {
      const spectrum: number[] = new Array(paramNPoints).fill(0);
      for (let spec = 0; spec < paramNSpectra; spec++) {
        const p1Var = paramP1 + 0.02 * (spec - paramNSpectra / 2);
        const p2Var = paramP2 + 0.01 * (spec - paramNSpectra / 2);
        const specData = generateSpectrum(x, p1Var, p2Var, elem);
        for (let pt = 0; pt < paramNPoints; pt++) {
          spectrum[pt] += specData[pt] / paramNSpectra;
        }
      }
      allY.push(spectrum);
    }

    const calcTime = performance.now() - startTime;

    // FPS計算
    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    fpsHistoryRef.current.push(1000 / frameTime);
    if (fpsHistoryRef.current.length > 10) {
      fpsHistoryRef.current.shift();
    }
    const avgFps = fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length;

    setXData(x);
    setYData(allY);
    setMetrics(prev => ({
      rtt: calcTime,
      serverCalcTime: calcTime,
      parseTime: 0,
      renderTime: 0,
      totalPoints: paramNPoints * paramNSpectra * paramNElements,
      dataSize: paramNPoints * paramNElements * 8,
      cancelledRequests: prev.cancelledRequests,
      successfulRequests: prev.successfulRequests + 1,
      fps: avgFps
    }));
  }, []);

  // データフェッチ関数（サーバーモード）
  const fetchData = useCallback(async (
    paramP1: number,
    paramP2: number,
    paramNPoints: number,
    paramNSpectra: number,
    paramNElements: number
  ) => {
    // デモモードの場合はローカル計算
    if (useDemoMode) {
      calculateLocal(paramP1, paramP2, paramNPoints, paramNSpectra, paramNElements);
      return;
    }

    // 前のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setMetrics(prev => ({
        ...prev,
        cancelledRequests: prev.cancelledRequests + 1
      }));
    }

    // 新しいAbortController
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const startTime = performance.now();
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(`${API_BASE_URL}/calc`);
      url.searchParams.set('p1', paramP1.toFixed(4));
      url.searchParams.set('p2', paramP2.toFixed(4));
      url.searchParams.set('n_points', paramNPoints.toString());
      url.searchParams.set('n_spectra', paramNSpectra.toString());
      url.searchParams.set('n_elements', paramNElements.toString());

      const response = await fetch(url.toString(), { signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // データサイズ取得
      const contentLength = response.headers.get('content-length');
      const dataSize = contentLength ? parseInt(contentLength, 10) : 0;

      // JSON解析時間計測
      const parseStart = performance.now();
      const data = await response.json();
      const parseTime = performance.now() - parseStart;

      // データ分配処理
      const renderStart = performance.now();

      // x軸データ
      const x: number[] = data.x;

      // y軸データを元素ごとに分配
      const allY: number[][] = [];
      const flatY: number[] = data.y;
      let idx = 0;

      for (let elem = 0; elem < paramNElements; elem++) {
        const elementSpectrum: number[] = new Array(paramNPoints).fill(0);
        for (let spec = 0; spec < paramNSpectra; spec++) {
          for (let pt = 0; pt < paramNPoints; pt++) {
            elementSpectrum[pt] += flatY[idx + pt] / paramNSpectra;
          }
          idx += paramNPoints;
        }
        allY.push(elementSpectrum);
      }

      const renderTime = performance.now() - renderStart;
      const totalTime = performance.now() - startTime;

      // FPS計算
      const now = performance.now();
      const frameTime = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      fpsHistoryRef.current.push(1000 / frameTime);
      if (fpsHistoryRef.current.length > 10) {
        fpsHistoryRef.current.shift();
      }
      const avgFps = fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length;

      // 状態更新
      setXData(x);
      setYData(allY);
      setMetrics(prev => ({
        rtt: totalTime,
        serverCalcTime: data.metadata.calc_time_ms,
        parseTime,
        renderTime,
        totalPoints: data.metadata.total_size,
        dataSize: dataSize || JSON.stringify(data).length,
        cancelledRequests: prev.cancelledRequests,
        successfulRequests: prev.successfulRequests + 1,
        fps: avgFps
      }));

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      // サーバー接続失敗時は自動的にデモモードに切り替え
      setUseDemoMode(true);
      setError('Server unavailable - switched to Demo Mode');
      calculateLocal(paramP1, paramP2, paramNPoints, paramNSpectra, paramNElements);
    } finally {
      setIsLoading(false);
    }
  }, [useDemoMode, calculateLocal]);

  // スロットルされたフェッチ
  const throttledFetch = useMemo(
    () => throttle(fetchData, throttleMs),
    [fetchData, throttleMs]
  );

  // XYパッド操作ハンドラ
  const handleXYChange = useCallback((x: number, y: number) => {
    setP1(x);
    setP2(y);
    throttledFetch(x, y, nPoints, nSpectra, nElements);
  }, [throttledFetch, nPoints, nSpectra, nElements]);

  // 初期データ読み込み
  useEffect(() => {
    throttledFetch(p1, p2, nPoints, nSpectra, nElements);
  }, []);

  // パラメータ変更時の再フェッチ
  useEffect(() => {
    throttledFetch(p1, p2, nPoints, nSpectra, nElements);
  }, [nPoints, nSpectra, nElements, useDemoMode]);

  // uPlot初期化・更新
  useEffect(() => {
    if (!chartContainerRef.current || xData.length === 0 || yData.length === 0) return;

    // yDataの実際の長さに基づいてシリーズを定義（nElementsとの不一致を防ぐ）
    const actualElements = yData.length;

    // シリーズ定義
    const series: uPlot.Series[] = [
      { label: 'Energy (eV)' },
      ...Array.from({ length: actualElements }, (_, i) => ({
        label: `Element ${i + 1}`,
        stroke: ELEMENT_COLORS[i % ELEMENT_COLORS.length],
        width: 2,
        fill: `${ELEMENT_COLORS[i % ELEMENT_COLORS.length]}22`
      }))
    ];

    // プロットデータ
    const plotData: uPlot.AlignedData = [xData, ...yData];

    // Y軸の範囲を計算
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const y of yData) {
      for (const val of y) {
        if (val < yMin) yMin = val;
        if (val > yMax) yMax = val;
      }
    }
    const yPadding = (yMax - yMin) * 0.1 || 0.1;

    // チャートの高さを画面サイズに応じて調整
    const chartHeight = window.innerWidth < 768 ? 250 : 400;

    // uPlotオプション
    const opts: uPlot.Options = {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      title: '',
      cursor: {
        show: true,
        drag: { x: false, y: false }
      },
      legend: {
        show: true,
        live: true
      },
      scales: {
        x: {
          time: false,
          auto: true
        },
        y: {
          auto: false,
          range: [yMin - yPadding, yMax + yPadding]
        }
      },
      axes: [
        {
          stroke: '#6b7280',
          grid: { stroke: 'rgba(100, 149, 237, 0.1)' },
          ticks: { stroke: '#4b5563' },
          font: '11px monospace',
          labelFont: '11px monospace'
        },
        {
          stroke: '#6b7280',
          grid: { stroke: 'rgba(100, 149, 237, 0.1)' },
          ticks: { stroke: '#4b5563' },
          font: '11px monospace',
          labelFont: '11px monospace'
        }
      ],
      series
    };

    // シリーズ数が変わったかチェック（+1はx軸用）
    const newSeriesCount = actualElements + 1;
    const needsRecreate = prevSeriesCountRef.current !== newSeriesCount;

    // 常に古いuPlotを破棄してから新しいものを作成（シリーズ数変更時）
    if (needsRecreate || !uplotRef.current) {
      // 既存のuPlotを破棄
      if (uplotRef.current) {
        try {
          uplotRef.current.destroy();
        } catch {
          // destroy失敗は無視
        }
        uplotRef.current = null;
      }

      // コンテナを完全にクリア
      if (chartContainerRef.current) {
        chartContainerRef.current.innerHTML = '';
      }

      // 新しいuPlotを作成
      uplotRef.current = new uPlot(opts, plotData, chartContainerRef.current);
      prevSeriesCountRef.current = newSeriesCount;
    } else {
      // シリーズ数が同じ場合はデータのみ更新（高速）
      uplotRef.current.setData(plotData);
      uplotRef.current.setScale('y', { min: yMin - yPadding, max: yMax + yPadding });
    }
  }, [xData, yData]);

  // ウィンドウリサイズ対応
  useEffect(() => {
    const handleResize = () => {
      if (uplotRef.current && chartContainerRef.current) {
        const chartHeight = window.innerWidth < 768 ? 250 : 400;
        uplotRef.current.setSize({
          width: chartContainerRef.current.clientWidth,
          height: chartHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (uplotRef.current) {
        uplotRef.current.destroy();
      }
    };
  }, []);

  // XY Padのサイズをウィンドウ幅に応じて調整
  const xyPadSize = Math.min(280, window.innerWidth - 60);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '12px',
      backgroundColor: '#0f0f1a',
      minHeight: '100vh',
      color: '#e0e0e0',
      boxSizing: 'border-box'
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 16px',
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        borderRadius: '12px',
        border: '1px solid rgba(100, 149, 237, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h1 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #6495ed, #ff6600)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Spectrum Browser
          </h1>
          {/* デモモード切り替え */}
          <button
            onClick={() => {
              setUseDemoMode(!useDemoMode);
              setError(null);
            }}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              backgroundColor: useDemoMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 149, 237, 0.2)',
              border: `1px solid ${useDemoMode ? '#22c55e' : '#6495ed'}`,
              borderRadius: '6px',
              color: useDemoMode ? '#22c55e' : '#6495ed',
              cursor: 'pointer'
            }}
          >
            {useDemoMode ? 'Demo Mode' : 'Server Mode'}
          </button>
        </div>
        {error && (
          <div style={{
            padding: '6px 12px',
            backgroundColor: 'rgba(251, 191, 36, 0.2)',
            border: '1px solid #fbbf24',
            borderRadius: '6px',
            color: '#fbbf24',
            fontSize: '11px'
          }}>
            {error}
          </div>
        )}
      </div>

      {/* XY Pad + チャート（モバイル: 縦並び, デスクトップ: 横並び） */}
      <div style={{
        display: 'flex',
        flexDirection: window.innerWidth < 768 ? 'column' : 'row',
        gap: '12px'
      }}>
        {/* XY Pad */}
        <div style={{
          backgroundColor: 'rgba(26, 26, 46, 0.9)',
          borderRadius: '12px',
          padding: '12px',
          border: '1px solid rgba(100, 149, 237, 0.3)',
          flexShrink: 0
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: '#6495ed' }}>
            Parameter Space
          </h3>
          <XYPadController
            valueX={p1}
            valueY={p2}
            onChange={handleXYChange}
            width={xyPadSize}
            height={xyPadSize}
            labelX="p1 (Shift)"
            labelY="p2 (Width)"
          />
        </div>

        {/* チャート */}
        <div style={{
          flex: 1,
          backgroundColor: 'rgba(26, 26, 46, 0.9)',
          borderRadius: '12px',
          padding: '12px',
          border: '1px solid rgba(100, 149, 237, 0.3)',
          minWidth: 0
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: '#6495ed' }}>
            Spectrum Viewer
          </h3>
          <div
            ref={chartContainerRef}
            style={{
              width: '100%',
              minHeight: window.innerWidth < 768 ? '250px' : '400px',
              backgroundColor: '#0a0a14',
              borderRadius: '8px'
            }}
          />
        </div>
      </div>

      {/* 設定 + パフォーマンス */}
      <div style={{
        display: 'flex',
        flexDirection: window.innerWidth < 768 ? 'column' : 'row',
        gap: '12px'
      }}>
        {/* 設定パネル */}
        <div style={{
          flex: 1,
          backgroundColor: 'rgba(26, 26, 46, 0.9)',
          borderRadius: '12px',
          padding: '12px',
          border: '1px solid rgba(100, 149, 237, 0.3)'
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: '#6495ed' }}>
            Data Settings
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>
                <span>Points:</span>
                <span style={{ color: '#22d3ee' }}>{nPoints}</span>
              </label>
              <input type="range" min={100} max={50000} step={500} value={nPoints}
                onChange={e => setNPoints(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#6495ed' }}
              />
            </div>
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>
                <span>Elements:</span>
                <span style={{ color: '#22d3ee' }}>{nElements}</span>
              </label>
              <input type="range" min={1} max={20} value={nElements}
                onChange={e => setNElements(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#6495ed' }}
              />
            </div>
            <div style={{
              padding: '6px 10px',
              backgroundColor: 'rgba(100, 149, 237, 0.1)',
              borderRadius: '6px',
              fontSize: '11px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span style={{ color: '#6b7280' }}>Total:</span>
              <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                {(nPoints * nSpectra * nElements).toLocaleString()} pts
              </span>
            </div>
          </div>
        </div>

        {/* パフォーマンスモニター */}
        <div style={{ flex: 1 }}>
          <PerformanceMonitor metrics={metrics} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
};

export default SpectrumBrowser;
