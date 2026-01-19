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
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="energy"
          stroke="#9CA3AF"
          label={{ value: 'Energy (meV)', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
          tickFormatter={(v) => v.toFixed(0)}
        />
        <YAxis
          stroke="#9CA3AF"
          label={{ value: 'Intensity', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
          labelStyle={{ color: '#F9FAFB' }}
          formatter={(value) => typeof value === 'number' ? value.toFixed(4) : String(value)}
        />
        <Legend />
        {showIdeal && (
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="#6B7280"
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
            stroke="#3B82F6"
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
            stroke="#EF4444"
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
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="energy"
          stroke="#9CA3AF"
          label={{ value: 'Energy (meV)', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
          tickFormatter={(v) => v.toFixed(0)}
        />
        <YAxis stroke="#9CA3AF" />
        <Tooltip
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
          labelStyle={{ color: '#F9FAFB' }}
          formatter={(value) => typeof value === 'number' ? value.toFixed(4) : String(value)}
        />
        <Area
          type="monotone"
          dataKey="irf"
          fill="#3B82F6"
          fillOpacity={0.2}
          stroke="#3B82F6"
          strokeWidth={2}
          name="IRF"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default SpectrumChart;
