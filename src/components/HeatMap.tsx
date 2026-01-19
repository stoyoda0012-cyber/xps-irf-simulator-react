import React, { useRef, useEffect, useMemo } from 'react';

interface HeatMapProps {
  data: number[][];
  xAxis: number[];
  yAxis: number[];
  title: string;
  xLabel?: string;
  yLabel?: string;
  colormap?: 'viridis' | 'hot' | 'plasma';
  width?: number;
  height?: number;
}

// Color interpolation functions
const colormaps = {
  viridis: (t: number): [number, number, number] => {
    // Simplified viridis colormap
    return [
      Math.max(0, Math.min(255, Math.floor(68 * (1 - t) + 253 * t * t))),
      Math.max(0, Math.min(255, Math.floor(1 + 230 * t))),
      Math.max(0, Math.min(255, Math.floor(84 + 86 * Math.sin(Math.PI * t)))),
    ];
  },
  hot: (t: number): [number, number, number] => {
    // Hot colormap: black -> red -> yellow -> white
    return [
      Math.min(255, Math.floor(t * 3 * 255)),
      Math.min(255, Math.max(0, Math.floor((t - 0.33) * 3 * 255))),
      Math.min(255, Math.max(0, Math.floor((t - 0.67) * 3 * 255))),
    ];
  },
  plasma: (t: number): [number, number, number] => {
    // Simplified plasma colormap
    return [
      Math.floor(13 + t * (240 - 13)),
      Math.floor(8 + t * 100 * Math.sin(Math.PI * t)),
      Math.floor(135 + (1 - t) * (120)),
    ];
  },
};

export const HeatMap: React.FC<HeatMapProps> = ({
  data,
  xAxis,
  yAxis,
  title,
  xLabel = 'E − Eꜰ (meV)',
  yLabel = 'Y Position (mm)',
  colormap = 'viridis',
  width = 300,
  height = 300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Find data range
  const { minVal, maxVal } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const row of data) {
      for (const val of row) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    return { minVal: min, maxVal: max };
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = data.length;
    const cols = data[0]?.length || 0;
    if (rows === 0 || cols === 0) return;

    // Create image data
    const imgData = ctx.createImageData(cols, rows);
    const getColor = colormaps[colormap];

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const val = data[i][j];
        const t = maxVal > minVal ? (val - minVal) / (maxVal - minVal) : 0;
        const [r, g, b] = getColor(t);

        const idx = (i * cols + j) * 4;
        imgData.data[idx] = r;
        imgData.data[idx + 1] = g;
        imgData.data[idx + 2] = b;
        imgData.data[idx + 3] = 255;
      }
    }

    // Scale to canvas size
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cols;
    tempCanvas.height = rows;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(tempCanvas, 0, 0, width, height);
    }
  }, [data, width, height, colormap, minVal, maxVal]);

  const xMin = xAxis[0]?.toFixed(0) || '-100';
  const xMax = xAxis[xAxis.length - 1]?.toFixed(0) || '100';
  const yMin = yAxis[0]?.toFixed(0) || '-10';
  const yMax = yAxis[yAxis.length - 1]?.toFixed(0) || '10';

  return (
    <div className="heatmap-container">
      <h4 className="heatmap-title">{title}</h4>
      <div className="heatmap-wrapper">
        <div className="heatmap-y-label">{yLabel}</div>
        <div className="heatmap-content">
          <div className="heatmap-y-axis">
            <span>{yMax}</span>
            <span>{yMin}</span>
          </div>
          <div className="heatmap-canvas-wrapper">
            <canvas ref={canvasRef} width={width} height={height} className="heatmap-canvas" />
            <div className="heatmap-x-ticks" style={{ width }}>
              <span>{xMin}</span>
              <span>{xMax}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="heatmap-x-label">{xLabel}</div>
    </div>
  );
};

export default HeatMap;
