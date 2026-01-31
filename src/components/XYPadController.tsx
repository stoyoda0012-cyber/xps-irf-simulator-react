/**
 * XY Pad Controller - 2Dパラメータコントローラー
 *
 * マウス移動でp1 (x軸) と p2 (y軸) をリアルタイム更新
 * 「指に吸い付くような」レスポンスを実現
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';

interface XYPadControllerProps {
  /** X軸の値 (-1 to 1) */
  valueX: number;
  /** Y軸の値 (-1 to 1) */
  valueY: number;
  /** 値が変更されたときのコールバック */
  onChange: (x: number, y: number) => void;
  /** パッドの幅 (px) */
  width?: number;
  /** パッドの高さ (px) */
  height?: number;
  /** X軸ラベル */
  labelX?: string;
  /** Y軸ラベル */
  labelY?: string;
  /** 無効化 */
  disabled?: boolean;
}

export const XYPadController: React.FC<XYPadControllerProps> = ({
  valueX,
  valueY,
  onChange,
  width = 300,
  height = 300,
  labelX = 'p1 (Shift)',
  labelY = 'p2 (Width)',
  disabled = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ x: number; y: number } | null>(null);

  // 座標変換: キャンバス座標 → 正規化座標 (-1 to 1)
  const canvasToNormalized = useCallback((canvasX: number, canvasY: number): { x: number; y: number } => {
    const x = (canvasX / width) * 2 - 1;
    const y = -((canvasY / height) * 2 - 1); // Y軸は反転（上が+1）
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y))
    };
  }, [width, height]);

  // 座標変換: 正規化座標 → キャンバス座標
  const normalizedToCanvas = useCallback((normX: number, normY: number): { x: number; y: number } => {
    return {
      x: ((normX + 1) / 2) * width,
      y: ((-normY + 1) / 2) * height
    };
  }, [width, height]);

  // キャンバス描画
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 背景
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.max(width, height) / 2
    );
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#0f0f1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // グリッド線
    ctx.strokeStyle = 'rgba(100, 149, 237, 0.15)';
    ctx.lineWidth = 1;

    // 垂直グリッド
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 水平グリッド
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 中心線（軸）
    ctx.strokeStyle = 'rgba(100, 149, 237, 0.4)';
    ctx.lineWidth = 2;

    // X軸（中央水平線）
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Y軸（中央垂直線）
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    // カーソル位置
    const { x: cursorX, y: cursorY } = normalizedToCanvas(valueX, valueY);

    // カーソルの軌跡線（クロスヘア）
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, cursorY);
    ctx.lineTo(width, cursorY);
    ctx.stroke();

    ctx.setLineDash([]);

    // カーソル（グロー効果）
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = isDragging ? 20 : 10;

    // 外側の円
    ctx.fillStyle = 'rgba(255, 102, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, isDragging ? 18 : 14, 0, Math.PI * 2);
    ctx.fill();

    // 内側の円
    ctx.fillStyle = isDragging ? '#ff8800' : '#ff6600';
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, isDragging ? 10 : 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // 座標値表示
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`x: ${valueX.toFixed(3)}`, 8, 18);
    ctx.fillText(`y: ${valueY.toFixed(3)}`, 8, 34);

    // ラベル
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labelX, width / 2, height - 6);

    ctx.save();
    ctx.translate(14, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(labelY, 0, 0);
    ctx.restore();

  }, [valueX, valueY, width, height, labelX, labelY, normalizedToCanvas, isDragging]);

  // 描画更新（60FPSを維持）
  useEffect(() => {
    draw();
  }, [draw]);

  // マウスイベント処理（requestAnimationFrameで最適化）
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || disabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // pendingUpdateに保存（次のrAFで処理）
    pendingUpdateRef.current = canvasToNormalized(canvasX, canvasY);

    // すでにrAFがスケジュールされていなければスケジュール
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        if (pendingUpdateRef.current) {
          onChange(pendingUpdateRef.current.x, pendingUpdateRef.current.y);
          pendingUpdateRef.current = null;
        }
        animationFrameRef.current = null;
      });
    }
  }, [isDragging, disabled, canvasToNormalized, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;

    setIsDragging(true);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const { x, y } = canvasToNormalized(canvasX, canvasY);
    onChange(x, y);
  }, [disabled, canvasToNormalized, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // グローバルマウスイベントのバインド
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // タッチイベント対応
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();

    setIsDragging(true);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const canvasX = touch.clientX - rect.left;
    const canvasY = touch.clientY - rect.top;

    const { x, y } = canvasToNormalized(canvasX, canvasY);
    onChange(x, y);
  }, [disabled, canvasToNormalized, onChange]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging || disabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const canvasX = touch.clientX - rect.left;
    const canvasY = touch.clientY - rect.top;

    pendingUpdateRef.current = canvasToNormalized(canvasX, canvasY);

    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        if (pendingUpdateRef.current) {
          onChange(pendingUpdateRef.current.x, pendingUpdateRef.current.y);
          pendingUpdateRef.current = null;
        }
        animationFrameRef.current = null;
      });
    }
  }, [isDragging, disabled, canvasToNormalized, onChange]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'inline-block',
        position: 'relative',
        userSelect: 'none',
        cursor: disabled ? 'not-allowed' : (isDragging ? 'grabbing' : 'crosshair')
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: width,
          height: height,
          borderRadius: '8px',
          border: '1px solid rgba(100, 149, 237, 0.3)',
          boxShadow: isDragging
            ? '0 0 20px rgba(255, 102, 0, 0.4)'
            : '0 4px 16px rgba(0, 0, 0, 0.3)',
          transition: 'box-shadow 0.15s ease-out',
          opacity: disabled ? 0.5 : 1
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
};

export default XYPadController;
