/**
 * Measured spectrum with the Fermi-edge fit, its background and residuals.
 * The fit window is shaded; dragging across the main plot selects a new one.
 */

import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { themeColor } from '../lib/theme';
import type { Theme } from '../lib/theme';

export interface DataFitChartProps {
  /** Display axis (file units and direction), ascending */
  x: number[];
  y: number[];
  /** Aligned with x; null outside the fit window */
  fit: (number | null)[] | null;
  background: (number | null)[] | null;
  residuals: (number | null)[] | null;
  /** Fit window on the display axis, lo < hi */
  window: [number, number] | null;
  ef: number | null;
  /** Plot high values on the left (binding-energy convention) */
  reversed: boolean;
  view: 'full' | 'window';
  xLabel: string;
  yLabel: string;
  residualLabel: string;
  seriesLabels: { data: string; fit: string; background: string };
  onSelectWindow: (lo: number, hi: number) => void;
  /** The charts are rebuilt with the theme's colours when it changes */
  theme: Theme;
}

const MAIN_HEIGHT = 300;
const RESID_HEIGHT = 130;

export function DataFitChart(props: DataFitChartProps) {
  const {
    x, y, fit, background, residuals, window: win, ef, reversed, view,
    xLabel, yLabel, residualLabel, seriesLabels, onSelectWindow, theme,
  } = props;
  const mainRef = useRef<HTMLDivElement>(null);
  const residRef = useRef<HTMLDivElement>(null);
  // Latest callback without rebuilding the charts when it changes identity
  const onSelectRef = useRef(onSelectWindow);
  useEffect(() => {
    onSelectRef.current = onSelectWindow;
  }, [onSelectWindow]);

  const xRange = useMemo((): [number, number] => {
    if (view === 'window' && win) {
      const pad = 0.04 * (win[1] - win[0]);
      return [win[0] - pad, win[1] + pad];
    }
    return [x[0], x[x.length - 1]];
  }, [view, win, x]);

  useEffect(() => {
    const mainEl = mainRef.current;
    const residEl = residRef.current;
    if (!mainEl || !residEl || x.length < 2) return;
    const width = Math.max(300, mainEl.clientWidth);
    const syncKey = `fermi-${Math.random().toString(36).slice(2)}`;

    const color = {
      data: themeColor('--chart-data'),
      fit: themeColor('--chart-fit'),
      background: themeColor('--chart-background'),
      residual: themeColor('--chart-residual'),
      zero: themeColor('--chart-zero'),
      ef: themeColor('--chart-ef'),
      window: themeColor('--chart-window'),
    };
    const grid = themeColor('--chart-grid');
    const axis = {
      stroke: themeColor('--chart-axis'),
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, size: 5 },
      labelSize: 14,
      labelFont: '11px sans-serif',
      font: '10px sans-serif',
    };

    const shadeWindow = (u: uPlot) => {
      if (!win) return;
      const a = u.valToPos(win[0], 'x', true);
      const b = u.valToPos(win[1], 'x', true);
      const { ctx, bbox } = u;
      const left = Math.max(bbox.left, Math.min(a, b));
      const right = Math.min(bbox.left + bbox.width, Math.max(a, b));
      if (right <= left) return;
      ctx.save();
      ctx.fillStyle = color.window;
      ctx.fillRect(left, bbox.top, right - left, bbox.height);
      ctx.restore();
    };

    const markEf = (u: uPlot, label: boolean) => {
      if (ef === null || !Number.isFinite(ef)) return;
      const px = u.valToPos(ef, 'x', true);
      const { ctx, bbox } = u;
      if (px < bbox.left || px > bbox.left + bbox.width) return;
      ctx.save();
      ctx.strokeStyle = color.ef;
      ctx.lineWidth = 1 * devicePixelRatio;
      ctx.setLineDash([4 * devicePixelRatio, 3 * devicePixelRatio]);
      ctx.beginPath();
      ctx.moveTo(px, bbox.top);
      ctx.lineTo(px, bbox.top + bbox.height);
      ctx.stroke();
      if (label) {
        ctx.setLineDash([]);
        ctx.fillStyle = color.ef;
        ctx.font = `${11 * devicePixelRatio}px sans-serif`;
        ctx.fillText('E_F', px + 4 * devicePixelRatio, bbox.top + 12 * devicePixelRatio);
      }
      ctx.restore();
    };

    const xScale: uPlot.Scale = {
      time: false,
      dir: reversed ? -1 : 1,
      range: () => xRange,
    };

    const main = new uPlot(
      {
        width,
        height: MAIN_HEIGHT,
        padding: [10, 16, 0, 0],
        cursor: {
          drag: { x: true, y: false, setScale: false },
          sync: { key: syncKey },
        },
        scales: { x: xScale, y: { auto: true } },
        axes: [
          { ...axis, label: xLabel },
          { ...axis, label: yLabel, size: 60 },
        ],
        series: [
          { label: xLabel },
          {
            label: seriesLabels.data,
            stroke: color.data,
            width: 0,
            paths: () => null,
            points: { show: true, size: 3, stroke: color.data, fill: color.data },
          },
          { label: seriesLabels.fit, stroke: color.fit, width: 2, spanGaps: false },
          { label: seriesLabels.background, stroke: color.background, width: 1, dash: [5, 4], spanGaps: false },
        ],
        legend: { show: true },
        hooks: {
          drawClear: [shadeWindow],
          draw: [u => markEf(u, true)],
          setSelect: [
            u => {
              const { left, width: w } = u.select;
              if (w > 4) {
                const a = u.posToVal(left, 'x');
                const b = u.posToVal(left + w, 'x');
                onSelectRef.current(Math.min(a, b), Math.max(a, b));
              }
              u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            },
          ],
        },
      },
      [x, y, fit ?? x.map(() => null), background ?? x.map(() => null)] as uPlot.AlignedData,
      mainEl
    );

    const resid = new uPlot(
      {
        width,
        height: RESID_HEIGHT,
        padding: [6, 16, 0, 0],
        cursor: { drag: { x: false, y: false }, sync: { key: syncKey } },
        scales: {
          x: xScale,
          y: {
            range: (_u, lo, hi) => {
              const m = Math.max(Math.abs(lo ?? 0), Math.abs(hi ?? 0)) * 1.1 || 1;
              return [-m, m];
            },
          },
        },
        axes: [
          { ...axis, label: xLabel },
          { ...axis, label: residualLabel, size: 60 },
        ],
        series: [
          {},
          {
            label: residualLabel,
            stroke: color.residual,
            width: 0,
            paths: () => null,
            points: { show: true, size: 3, stroke: color.residual, fill: color.residual },
          },
        ],
        legend: { show: false },
        hooks: {
          drawClear: [shadeWindow],
          draw: [
            u => {
              const { ctx, bbox } = u;
              const py = u.valToPos(0, 'y', true);
              ctx.save();
              ctx.strokeStyle = color.zero;
              ctx.lineWidth = devicePixelRatio;
              ctx.beginPath();
              ctx.moveTo(bbox.left, py);
              ctx.lineTo(bbox.left + bbox.width, py);
              ctx.stroke();
              ctx.restore();
              markEf(u, false);
            },
          ],
        },
      },
      [x, residuals ?? x.map(() => null)] as uPlot.AlignedData,
      residEl
    );

    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) {
        main.setSize({ width: w, height: MAIN_HEIGHT });
        resid.setSize({ width: w, height: RESID_HEIGHT });
      }
    });
    observer.observe(mainEl);

    return () => {
      observer.disconnect();
      main.destroy();
      resid.destroy();
    };
  }, [x, y, fit, background, residuals, win, ef, reversed, xRange, xLabel, yLabel, residualLabel, seriesLabels, theme]);

  return (
    <div className="datafit-chart">
      <div ref={mainRef} className="uplot-container datafit-main" />
      <div ref={residRef} className="uplot-container datafit-resid" />
    </div>
  );
}
