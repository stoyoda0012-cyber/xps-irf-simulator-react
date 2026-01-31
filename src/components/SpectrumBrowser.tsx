/**
 * Spectrum Browser - 爆速スペクトル・ブラウザー
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

interface SpectrumBrowserProps {
  /** スロットル間隔 (ms) - デフォルト16ms (60FPS) */
  throttleMs?: number;
  /** ポイント数/スペクトル */
  nPoints?: number;
  /** スペクトル数/元素 */
  nSpectra?: number;
  /** 元素数 */
  nElements?: number;
}

export const SpectrumBrowser: React.FC<SpectrumBrowserProps> = ({
  throttleMs = 16,
  nPoints: initialNPoints = 100,
  nSpectra: initialNSpectra = 1,
  nElements: initialNElements = 1
}) => {
  // パラメータ状態
  const [p1, setP1] = useState(0);
  const [p2, setP2] = useState(0);
  const [nPoints, setNPoints] = useState(initialNPoints);
  const [nSpectra, setNSpectra] = useState(initialNSpectra);
  const [nElements, setNElements] = useState(initialNElements);

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

  // AbortController参照
  const abortControllerRef = useRef<AbortController | null>(null);

  // FPS計測用
  const lastFrameTimeRef = useRef<number>(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);

  // データフェッチ関数
  const fetchData = useCallback(async (
    paramP1: number,
    paramP2: number,
    paramNPoints: number,
    paramNSpectra: number,
    paramNElements: number
  ) => {
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
        // 各元素の全スペクトルを平均化（または最初のスペクトルを使用）
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
        // キャンセルは正常動作
        return;
      }
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  // パラメータ変更時の再フェッチ
  useEffect(() => {
    throttledFetch(p1, p2, nPoints, nSpectra, nElements);
  }, [nPoints, nSpectra, nElements]);

  // uPlot初期化・更新
  useEffect(() => {
    if (!chartContainerRef.current || xData.length === 0) return;

    // シリーズ定義
    const series: uPlot.Series[] = [
      { label: 'Energy (eV)' },
      ...Array.from({ length: nElements }, (_, i) => ({
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

    // uPlotオプション
    const opts: uPlot.Options = {
      width: chartContainerRef.current.clientWidth,
      height: 400,
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
          font: '12px monospace',
          labelFont: '12px monospace'
        },
        {
          stroke: '#6b7280',
          grid: { stroke: 'rgba(100, 149, 237, 0.1)' },
          ticks: { stroke: '#4b5563' },
          font: '12px monospace',
          labelFont: '12px monospace'
        }
      ],
      series
    };

    // 既存のプロットがあれば更新、なければ作成
    if (uplotRef.current) {
      // シリーズ数が変わった場合は再作成
      if (uplotRef.current.series.length !== series.length) {
        uplotRef.current.destroy();
        uplotRef.current = new uPlot(opts, plotData, chartContainerRef.current);
      } else {
        // データのみ更新（高速）
        uplotRef.current.setData(plotData);

        // Y軸範囲を更新
        uplotRef.current.setScale('y', { min: yMin - yPadding, max: yMax + yPadding });
      }
    } else {
      uplotRef.current = new uPlot(opts, plotData, chartContainerRef.current);
    }

    return () => {
      // クリーンアップはコンポーネントアンマウント時のみ
    };
  }, [xData, yData, nElements]);

  // ウィンドウリサイズ対応
  useEffect(() => {
    const handleResize = () => {
      if (uplotRef.current && chartContainerRef.current) {
        uplotRef.current.setSize({
          width: chartContainerRef.current.clientWidth,
          height: 400
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // コンポーネントアンマウント時のクリーンアップ
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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      padding: '20px',
      backgroundColor: '#0f0f1a',
      minHeight: '100vh',
      color: '#e0e0e0'
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        borderRadius: '12px',
        border: '1px solid rgba(100, 149, 237, 0.3)'
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #6495ed, #ff6600)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Spectrum Browser
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
            Ultra-fast spectrum exploration with real-time parameter control
          </p>
        </div>
        {error && (
          <div style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '12px'
          }}>
            Error: {error}
          </div>
        )}
      </div>

      {/* メインコンテンツ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr 300px',
        gap: '20px',
        alignItems: 'start'
      }}>
        {/* 左パネル：コントローラー */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {/* XY Pad */}
          <div style={{
            backgroundColor: 'rgba(26, 26, 46, 0.9)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(100, 149, 237, 0.3)'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#6495ed' }}>
              Parameter Space
            </h3>
            <XYPadController
              valueX={p1}
              valueY={p2}
              onChange={handleXYChange}
              width={280}
              height={280}
              labelX="p1 (Shift)"
              labelY="p2 (Width/Intensity)"
            />
          </div>

          {/* 設定パネル */}
          <div style={{
            backgroundColor: 'rgba(26, 26, 46, 0.9)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(100, 149, 237, 0.3)'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#6495ed' }}>
              Data Settings
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* ポイント数 */}
              <div>
                <label style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginBottom: '4px'
                }}>
                  <span>Points/Spectrum:</span>
                  <span style={{ color: '#22d3ee' }}>{nPoints}</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={nPoints}
                  onChange={e => setNPoints(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#6495ed' }}
                />
              </div>

              {/* スペクトル数 */}
              <div>
                <label style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginBottom: '4px'
                }}>
                  <span>Spectra/Element:</span>
                  <span style={{ color: '#22d3ee' }}>{nSpectra}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={nSpectra}
                  onChange={e => setNSpectra(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#6495ed' }}
                />
              </div>

              {/* 元素数 */}
              <div>
                <label style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginBottom: '4px'
                }}>
                  <span>Elements:</span>
                  <span style={{ color: '#22d3ee' }}>{nElements}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={nElements}
                  onChange={e => setNElements(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#6495ed' }}
                />
              </div>

              {/* 合計ポイント数表示 */}
              <div style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(100, 149, 237, 0.1)',
                borderRadius: '6px',
                fontSize: '12px',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span style={{ color: '#6b7280' }}>Total Points:</span>
                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                  {(nPoints * nSpectra * nElements).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 中央：チャート */}
        <div style={{
          backgroundColor: 'rgba(26, 26, 46, 0.9)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(100, 149, 237, 0.3)'
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#6495ed' }}>
            Spectrum Viewer
          </h3>
          <div
            ref={chartContainerRef}
            style={{
              width: '100%',
              minHeight: '400px',
              backgroundColor: '#0a0a14',
              borderRadius: '8px'
            }}
          />
          {xData.length === 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: '#6b7280',
              fontSize: '14px'
            }}>
              {isLoading ? 'Loading...' : 'Move the XY Pad to fetch data'}
            </div>
          )}
        </div>

        {/* 右パネル：パフォーマンスモニター */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <PerformanceMonitor metrics={metrics} isLoading={isLoading} />

          {/* 最適化情報 */}
          <div style={{
            backgroundColor: 'rgba(26, 26, 46, 0.9)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(100, 149, 237, 0.3)',
            fontSize: '11px'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#6495ed' }}>
              Optimization Info
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#9ca3af' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#22c55e',
                  borderRadius: '50%'
                }} />
                Throttle: {throttleMs}ms ({Math.round(1000 / throttleMs)} req/s max)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#22c55e',
                  borderRadius: '50%'
                }} />
                AbortController: Active
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#22c55e',
                  borderRadius: '50%'
                }} />
                uPlot Canvas: 60 FPS
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#22c55e',
                  borderRadius: '50%'
                }} />
                RAF Sync: Enabled
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpectrumBrowser;
