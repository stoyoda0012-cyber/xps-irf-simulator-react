import React, { useRef, useEffect, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { themeColor } from '../lib/theme';
import type { Theme } from '../lib/theme';

/** Axis colours of the current theme; read when a chart is built */
function themedAxis(): Pick<uPlot.Axis, 'stroke' | 'grid' | 'ticks'> {
  const grid = themeColor('--chart-grid');
  return {
    stroke: themeColor('--chart-axis'),
    grid: { stroke: grid, width: 1 },
    ticks: { stroke: grid, size: 5 },
  };
}

interface SpectrumChartCanvasProps {
  energy: number[];
  spectrum: number[];
  spectrumClean: number[];
  idealFD: number[];
  fittedSpectrum?: number[] | null;
  showNoise?: boolean;
  showIdeal?: boolean;
  showClean?: boolean;
  showFitted?: boolean;
  height?: number;
  /** The chart is rebuilt with the theme's colours when it changes */
  theme: Theme;
}

export const SpectrumChartCanvas: React.FC<SpectrumChartCanvasProps> = ({
  energy,
  spectrum,
  spectrumClean,
  idealFD,
  fittedSpectrum = null,
  showNoise = true,
  showIdeal = true,
  showClean = true,
  showFitted = true,
  height = 280,
  theme,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Downsample to 200 points for smoother performance
  const chartData = useMemo(() => {
    const targetPoints = 200;
    const step = Math.max(1, Math.floor(energy.length / targetPoints));

    const downsample = (arr: number[]) =>
      arr.filter((_, i) => i % step === 0);

    // fittedSpectrum may have different length (from fitting), need to interpolate or pad
    let fittedData: number[] | null = null;
    if (fittedSpectrum && fittedSpectrum.length > 0) {
      // If fitted spectrum has same length as energy, just downsample
      if (fittedSpectrum.length === energy.length) {
        fittedData = downsample(fittedSpectrum);
      } else {
        // Simple linear interpolation to match energy axis
        fittedData = downsample(energy).map((_, i) => {
          const ratio = i / (targetPoints - 1);
          const srcIdx = ratio * (fittedSpectrum.length - 1);
          const idx0 = Math.floor(srcIdx);
          const idx1 = Math.min(idx0 + 1, fittedSpectrum.length - 1);
          const t = srcIdx - idx0;
          return fittedSpectrum[idx0] * (1 - t) + fittedSpectrum[idx1] * t;
        });
      }
    }

    const data: (number[] | null)[] = [
      downsample(energy),
      downsample(spectrum),
      downsample(spectrumClean),
      downsample(idealFD),
      fittedData,
    ];

    return data as uPlot.AlignedData;
  }, [energy, spectrum, spectrumClean, idealFD, fittedSpectrum]);

  // Calculate y-axis range from all visible data
  const yRange = useMemo(() => {
    let maxVal = 1.1;
    if (showNoise && spectrum.length > 0) {
      maxVal = Math.max(maxVal, ...spectrum);
    }
    if (showClean && spectrumClean.length > 0) {
      maxVal = Math.max(maxVal, ...spectrumClean);
    }
    if (showIdeal && idealFD.length > 0) {
      maxVal = Math.max(maxVal, ...idealFD);
    }
    if (showFitted && fittedSpectrum && fittedSpectrum.length > 0) {
      maxVal = Math.max(maxVal, ...fittedSpectrum);
    }
    return { min: 0, max: maxVal * 1.05 }; // 5% margin
  }, [spectrum, spectrumClean, idealFD, fittedSpectrum, showNoise, showClean, showIdeal, showFitted]);

  // Build the chart: options and colours are read here, after the theme's
  // data-theme attribute is in place, and the chart is rebuilt when they change
  useEffect(() => {
    if (!containerRef.current) return;

    const axis = themedAxis();
    const options: uPlot.Options = {
      width: 800,
      height,
      padding: [10, 20, 0, 0],
      cursor: {
        drag: { x: false, y: false },
      },
      scales: {
        x: { time: false, min: -100, max: 100 },
        y: { auto: false, min: yRange.min, max: yRange.max },
      },
      axes: [
        {
          ...axis,
          label: 'E − Eꜰ (meV)',
          labelSize: 12,
          labelFont: '10px sans-serif',
          font: '10px sans-serif',
          values: (_, ticks) => ticks.map(v => v.toFixed(0)),
        },
        {
          ...axis,
          label: 'Intensity',
          labelSize: 12,
          labelFont: '10px sans-serif',
          font: '10px sans-serif',
        },
      ],
      series: [
        {},
        // Observed (with noise)
        {
          label: 'Observed (with noise)',
          stroke: themeColor('--chart-observed'),
          width: 1.5,
          show: showNoise,
        },
        // Clean Observed
        {
          label: 'Clean Observed',
          stroke: themeColor('--chart-clean'),
          width: 1.5,
          alpha: 0.5,
          show: showClean,
        },
        // Ideal Fermi-Dirac
        {
          label: 'Ideal Fermi-Dirac',
          stroke: themeColor('--chart-ideal'),
          width: 1.5,
          dash: [5, 5],
          show: showIdeal,
        },
        // Fitted curve
        {
          label: 'Fitted',
          stroke: themeColor('--chart-fit'),
          width: 2,
          show: showFitted && fittedSpectrum !== null,
        },
      ],
      legend: {
        show: true,
      },
    };

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Create new chart
    chartRef.current = new uPlot(options, chartData, containerRef.current);

    // Resize handler
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (chartRef.current && entry.contentRect.width > 0) {
          chartRef.current.setSize({
            width: entry.contentRect.width,
            height,
          });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [height, showNoise, showClean, showIdeal, showFitted, fittedSpectrum, yRange, theme]);

  // Update data when it changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setData(chartData);
    }
  }, [chartData]);

  return <div ref={containerRef} className="uplot-container" />;
};

interface IRFChartCanvasProps {
  energy: number[];
  irf: number[];
  height?: number;
  /** The chart is rebuilt with the theme's colours when it changes */
  theme: Theme;
}

export const IRFChartCanvas: React.FC<IRFChartCanvasProps> = ({
  energy,
  irf,
  height = 180,
  theme,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Downsample to 200 points for smoother performance
  const chartData = useMemo(() => {
    const targetPoints = 200;
    const step = Math.max(1, Math.floor(energy.length / targetPoints));

    const downsample = (arr: number[]) =>
      arr.filter((_, i) => i % step === 0);

    return [downsample(energy), downsample(irf)] as uPlot.AlignedData;
  }, [energy, irf]);

  useEffect(() => {
    if (!containerRef.current) return;

    const axis = themedAxis();
    const options: uPlot.Options = {
      width: 800,
      height,
      padding: [10, 20, 0, 0],
      cursor: {
        drag: { x: false, y: false },
      },
      scales: {
        x: { time: false, min: -100, max: 100 },
        y: { auto: true },
      },
      axes: [
        {
          ...axis,
          label: 'E − Eꜰ (meV)',
          labelSize: 12,
          labelFont: '10px sans-serif',
          font: '10px sans-serif',
          values: (_, ticks) => ticks.map(v => v.toFixed(0)),
        },
        {
          ...axis,
          labelSize: 12,
          labelFont: '10px sans-serif',
          font: '10px sans-serif',
        },
      ],
      series: [
        {},
        {
          label: 'IRF',
          stroke: themeColor('--chart-irf'),
          width: 2,
          fill: themeColor('--chart-irf-fill'),
        },
      ],
      legend: {
        show: false,
      },
    };

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new uPlot(options, chartData, containerRef.current);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (chartRef.current && entry.contentRect.width > 0) {
          chartRef.current.setSize({
            width: entry.contentRect.width,
            height,
          });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [height, theme]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setData(chartData);
    }
  }, [chartData]);

  return <div ref={containerRef} className="uplot-container" />;
};

export default SpectrumChartCanvas;
