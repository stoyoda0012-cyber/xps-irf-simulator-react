import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';

// Colours are CSS variables, so this SVG chart follows the theme without a redraw

interface SpectrumChartProps {
  energy: number[];
  spectrum: number[];
  spectrumClean: number[];
  idealFD: number[];
  showNoise?: boolean;
  showIdeal?: boolean;
  showClean?: boolean;
}

export const SpectrumChart: React.FC<SpectrumChartProps> = ({
  energy,
  spectrum,
  spectrumClean,
  idealFD,
  showNoise = true,
  showIdeal = true,
  showClean = true,
}) => {
  const data = useMemo(() => {
    return energy.map((e, i) => ({
      energy: e,
      observed: spectrum[i],
      clean: spectrumClean[i],
      ideal: idealFD[i],
    }));
  }, [energy, spectrum, spectrumClean, idealFD]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="energy"
          stroke="var(--chart-axis)"
          label={{ value: 'Energy (meV)', position: 'insideBottom', offset: -5, fill: 'var(--chart-axis)' }}
          tickFormatter={(v) => v.toFixed(0)}
        />
        <YAxis
          stroke="var(--chart-axis)"
          label={{ value: 'Intensity', angle: -90, position: 'insideLeft', fill: 'var(--chart-axis)' }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
          labelStyle={{ color: 'var(--text-primary)' }}
          formatter={(value) => typeof value === 'number' ? value.toFixed(4) : String(value)}
        />
        <Legend />
        {showIdeal && (
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="var(--chart-ideal)"
            strokeDasharray="5 5"
            dot={false}
            name="Ideal Fermi-Dirac"
            strokeWidth={1.5}
          />
        )}
        {showClean && (
          <Line
            type="monotone"
            dataKey="clean"
            stroke="var(--chart-clean)"
            dot={false}
            name="Clean Observed"
            strokeWidth={1.5}
            opacity={0.5}
          />
        )}
        {showNoise && (
          <Line
            type="monotone"
            dataKey="observed"
            stroke="var(--chart-observed)"
            dot={false}
            name="Observed (with noise)"
            strokeWidth={2}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

interface IRFChartProps {
  energy: number[];
  irf: number[];
}

export const IRFChart: React.FC<IRFChartProps> = ({ energy, irf }) => {
  const data = useMemo(() => {
    return energy.map((e, i) => ({
      energy: e,
      irf: irf[i],
    }));
  }, [energy, irf]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="energy"
          stroke="var(--chart-axis)"
          label={{ value: 'Energy (meV)', position: 'insideBottom', offset: -5, fill: 'var(--chart-axis)' }}
          tickFormatter={(v) => v.toFixed(0)}
        />
        <YAxis stroke="var(--chart-axis)" />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
          labelStyle={{ color: 'var(--text-primary)' }}
          formatter={(value) => typeof value === 'number' ? value.toFixed(4) : String(value)}
        />
        <Area
          type="monotone"
          dataKey="irf"
          fill="var(--chart-irf)"
          fillOpacity={0.2}
          stroke="var(--chart-irf)"
          strokeWidth={2}
          name="IRF"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default SpectrumChart;
