/**
 * Performance Monitor - リアルタイム性能計測コンポーネント
 *
 * RTT（ラウンドトリップタイム）、データ点数、通信サイズを表示
 * FPSとフレームタイムも追跡
 */

import React, { useMemo } from 'react';

export interface PerformanceMetrics {
  /** リクエスト開始から描画完了までの時間 (ms) */
  rtt: number;
  /** サーバー側の計算時間 (ms) */
  serverCalcTime: number;
  /** JSON解析時間 (ms) */
  parseTime: number;
  /** 描画時間 (ms) */
  renderTime: number;
  /** 合計データ点数 */
  totalPoints: number;
  /** 通信データサイズ (bytes) */
  dataSize: number;
  /** キャンセルされたリクエスト数 */
  cancelledRequests: number;
  /** 成功したリクエスト数 */
  successfulRequests: number;
  /** 現在のFPS推定値 */
  fps: number;
}

interface PerformanceMonitorProps {
  metrics: PerformanceMetrics;
  isLoading?: boolean;
}

// メトリクス表示用のバー
const MetricBar: React.FC<{
  value: number;
  maxValue: number;
  color: string;
  warningThreshold?: number;
  dangerThreshold?: number;
}> = ({ value, maxValue, color, warningThreshold, dangerThreshold }) => {
  const percentage = Math.min((value / maxValue) * 100, 100);

  let barColor = color;
  if (dangerThreshold && value > dangerThreshold) {
    barColor = '#ef4444'; // red
  } else if (warningThreshold && value > warningThreshold) {
    barColor = '#f59e0b'; // amber
  }

  return (
    <div
      style={{
        width: '100%',
        height: '4px',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginTop: '2px'
      }}
    >
      <div
        style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: barColor,
          transition: 'width 0.1s ease-out, background-color 0.2s ease-out',
          borderRadius: '2px'
        }}
      />
    </div>
  );
};

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  metrics,
  isLoading = false
}) => {
  // パフォーマンス評価（color: バッジ背景、text: 文字色はテーマ依存）
  const performanceGrade = useMemo(() => {
    if (metrics.rtt < 16.67) return { grade: 'A+', color: '#22c55e', text: 'var(--accent-green)', label: '60+ FPS' };
    if (metrics.rtt < 33.33) return { grade: 'A', color: '#22c55e', text: 'var(--accent-green)', label: '30-60 FPS' };
    if (metrics.rtt < 50) return { grade: 'B', color: '#84cc16', text: 'var(--accent-green)', label: '20-30 FPS' };
    if (metrics.rtt < 100) return { grade: 'C', color: '#f59e0b', text: 'var(--text-warn)', label: '10-20 FPS' };
    return { grade: 'D', color: '#ef4444', text: 'var(--accent-red)', label: '<10 FPS' };
  }, [metrics.rtt]);

  // データサイズのフォーマット
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // キャンセル率
  const cancelRate = metrics.successfulRequests > 0
    ? ((metrics.cancelledRequests / (metrics.cancelledRequests + metrics.successfulRequests)) * 100).toFixed(1)
    : '0.0';

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '8px',
        padding: '12px 16px',
        border: '1px solid rgba(100, 149, 237, 0.3)',
        fontFamily: 'monospace',
        fontSize: '12px',
        color: 'var(--text-primary)',
        minWidth: '280px'
      }}
    >
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(100, 149, 237, 0.2)'
      }}>
        <span style={{ fontWeight: 'bold', color: 'var(--accent-blue)' }}>
          Performance Monitor
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLoading && (
            <span style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#f59e0b',
              borderRadius: '50%',
              animation: 'pulse 0.5s ease-in-out infinite alternate'
            }} />
          )}
          <span style={{
            backgroundColor: performanceGrade.color,
            color: '#000',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: 'bold',
            fontSize: '11px'
          }}>
            {performanceGrade.grade} ({performanceGrade.label})
          </span>
        </div>
      </div>

      {/* メトリクス一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* RTT */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total RTT:</span>
            <span style={{ color: performanceGrade.text, fontWeight: 'bold' }}>
              {metrics.rtt.toFixed(2)} ms
            </span>
          </div>
          <MetricBar
            value={metrics.rtt}
            maxValue={100}
            color="var(--accent-blue)"
            warningThreshold={33.33}
            dangerThreshold={50}
          />
        </div>

        {/* 内訳 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px 12px',
          padding: '8px',
          backgroundColor: 'rgba(100, 149, 237, 0.05)',
          borderRadius: '4px',
          fontSize: '11px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Server:</span>
            <span>{metrics.serverCalcTime.toFixed(2)} ms</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Parse:</span>
            <span>{metrics.parseTime.toFixed(2)} ms</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Render:</span>
            <span>{metrics.renderTime.toFixed(2)} ms</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Network:</span>
            <span>
              {Math.max(0, metrics.rtt - metrics.serverCalcTime - metrics.parseTime - metrics.renderTime).toFixed(2)} ms
            </span>
          </div>
        </div>

        {/* データ統計 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Data Points:</span>
            <span style={{ color: 'var(--accent-cyan)' }}>
              {metrics.totalPoints.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Data Size:</span>
            <span style={{ color: 'var(--accent-violet)' }}>
              {formatBytes(metrics.dataSize)}
            </span>
          </div>
        </div>

        {/* リクエスト統計 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 8px',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderRadius: '4px',
          fontSize: '11px'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Requests: {metrics.successfulRequests} OK / {metrics.cancelledRequests} cancelled
          </span>
          <span style={{
            color: parseFloat(cancelRate) > 50 ? 'var(--accent-green)' : 'var(--text-secondary)'
          }}>
            ({cancelRate}% saved)
          </span>
        </div>

        {/* スループット推定 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '4px',
          paddingTop: '8px',
          borderTop: '1px solid rgba(100, 149, 237, 0.2)'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Throughput:</span>
          <span style={{ color: 'var(--text-warn)', fontWeight: 'bold' }}>
            {metrics.rtt > 0
              ? ((metrics.totalPoints / metrics.rtt) * 1000).toFixed(0)
              : '∞'} pts/sec
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          from { opacity: 0.5; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default PerformanceMonitor;
