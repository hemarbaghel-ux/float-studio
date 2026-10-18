import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { ChartData, ChartType } from './types';
import { BarChart3, LineChart as LineIcon, PieChart as PieIcon, Maximize2, Check } from 'lucide-react';

const DEFAULT_PALETTE = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

interface InteractiveChartsProps {
  chart: ChartData;
  className?: string;
}

export function InteractiveCharts({ chart, className = '' }: InteractiveChartsProps) {
  const [selectedType, setSelectedType] = useState<ChartType>(chart.type);

  if (!chart || !chart.data || chart.data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center rounded-xl bg-slate-50 dark:bg-[#12151B] border border-slate-200 dark:border-[#21262D] text-slate-400 text-xs">
        <BarChart3 size={24} className="mb-2 opacity-50" />
        <span>No chart data available</span>
      </div>
    );
  }

  const series = chart.series && chart.series.length > 0 ? chart.series : [{ key: Object.keys(chart.data[0]).find(k => k !== chart.xAxisKey && typeof chart.data[0][k] === 'number') || 'value', name: 'Value' }];

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 dark:bg-[#161B22]/95 backdrop-blur-md border border-slate-700 dark:border-[#30363D] p-3 rounded-lg shadow-xl text-xs space-y-1 z-50">
          <p className="font-semibold text-slate-200">{label}</p>
          {payload.map((entry: any, index: number) => {
            const val = typeof entry.value === 'number' ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : entry.value;
            return (
              <div key={`item-${index}`} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] }} />
                <span className="text-slate-400">{entry.name}:</span>
                <span className="font-mono font-medium text-white">{val}</span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`p-4 rounded-xl bg-white dark:bg-[#12151B] border border-slate-200 dark:border-[#21262D] space-y-3 ${className}`}>
      {/* Chart Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-white/5">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            {chart.title}
          </h4>
          {chart.description && (
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              {chart.description}
            </p>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#1C2128] p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setSelectedType('bar')}
            title="Bar Chart"
            className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
              selectedType === 'bar'
                ? 'bg-white dark:bg-[#2D333B] text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <BarChart3 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('line')}
            title="Line Chart"
            className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
              selectedType === 'line'
                ? 'bg-white dark:bg-[#2D333B] text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <LineIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('pie')}
            title="Donut / Distribution"
            className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
              selectedType === 'pie'
                ? 'bg-white dark:bg-[#2D333B] text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <PieIcon size={13} />
          </button>
        </div>
      </div>

      {/* Responsive Chart Container */}
      <div className="w-full h-72 sm:h-80 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {selectedType === 'line' ? (
            <LineChart data={chart.data} margin={{ top: 10, right: 15, left: -10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
              <XAxis
                dataKey={chart.xAxisKey}
                stroke="#6E7681"
                fontSize={11}
                tickLine={false}
                angle={-25}
                textAnchor="end"
                height={40}
              />
              <YAxis stroke="#6E7681" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              {series.map((s, idx) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: s.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length] }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          ) : selectedType === 'area' ? (
            <AreaChart data={chart.data} margin={{ top: 10, right: 15, left: -10, bottom: 25 }}>
              <defs>
                {series.map((s, idx) => {
                  const color = s.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
                  return (
                    <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
              <XAxis dataKey={chart.xAxisKey} stroke="#6E7681" fontSize={11} tickLine={false} angle={-25} textAnchor="end" height={40} />
              <YAxis stroke="#6E7681" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              {series.map((s, idx) => {
                const color = s.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={color}
                    fillOpacity={1}
                    fill={`url(#grad-${s.key})`}
                  />
                );
              })}
            </AreaChart>
          ) : selectedType === 'pie' ? (
            <PieChart>
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Pie
                data={chart.data.map((item) => {
                  const valKey = series[0]?.key || 'value';
                  const rawVal = Number(item[valKey]);
                  return {
                    ...item,
                    [valKey]: isNaN(rawVal) ? 0 : Math.max(0, rawVal),
                  };
                })}
                dataKey={series[0]?.key || 'value'}
                nameKey={chart.xAxisKey || 'name'}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
              >
                {chart.data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]} stroke="#0D1117" strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 10, right: 15, left: -10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
              <XAxis dataKey={chart.xAxisKey} stroke="#6E7681" fontSize={11} tickLine={false} angle={-25} textAnchor="end" height={40} />
              <YAxis stroke="#6E7681" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              {series.map((s, idx) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={45}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
