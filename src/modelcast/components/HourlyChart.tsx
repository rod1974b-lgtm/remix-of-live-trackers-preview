import { useMemo, useState } from 'react';
import type { HourlyForecast } from '@/modelcast/lib/types';
import { WEATHER_MODELS } from '@/modelcast/lib/weatherModels';
import { formatHour, round } from '@/modelcast/lib/utils';
import { useSettings } from '@/modelcast/lib/settings';
import { tempUnitLabel, windUnitLabel, precipUnitLabel } from '@/modelcast/lib/units';

interface HourlyChartProps {
  data: HourlyForecast;
}

type Metric = 'temperature' | 'precipitation' | 'windSpeed' | 'humidity';

export function HourlyChart({ data }: HourlyChartProps) {
  const { t, units } = useSettings();
  const [metric, setMetric] = useState<Metric>('temperature');
  const [visibleModels, setVisibleModels] = useState<Set<string>>(
    new Set(WEATHER_MODELS.map((m) => m.id)),
  );

  const METRICS: { key: Metric; label: string; unit: string }[] = [
    { key: 'temperature', label: t('temperature'), unit: tempUnitLabel(units) },
    { key: 'precipitation', label: t('precipitation'), unit: precipUnitLabel(units) },
    { key: 'windSpeed', label: t('windSpeed'), unit: windUnitLabel(units) },
    { key: 'humidity', label: t('humidityMetric'), unit: '%' },
  ];

  const VIEW_HOURS = 24;

  const slice = useMemo(() => {
    const start = 0;
    const end = Math.min(VIEW_HOURS, data.time.length);
    return { start, end };
  }, [data.time]);

  const times = data.time.slice(slice.start, slice.end);

  const chartData = useMemo(() => {
    const values: { modelId: string; color: string; name: string; points: (number | null)[] }[] = [];
    for (const model of WEATHER_MODELS) {
      if (!visibleModels.has(model.id)) continue;
      const raw = data.models[model.id]?.[metric] ?? [];
      let points = raw.slice(slice.start, slice.end);
      if (metric === 'temperature' && units === 'us') {
        points = points.map((v) => (v === null ? null : (v * 9) / 5 + 32));
      }
      if (metric === 'windSpeed' && units === 'us') {
        points = points.map((v) => (v === null ? null : v * 0.621371));
      }
      if (metric === 'precipitation' && units === 'us') {
        points = points.map((v) => (v === null ? null : v * 0.0393701));
      }
      values.push({
        modelId: model.id,
        color: model.color,
        name: model.shortName,
        points,
      });
    }
    return values;
  }, [data, metric, visibleModels, slice, units]);

  const allValues = chartData.flatMap((s) => s.points.filter((v): v is number => v !== null));
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
  const range = maxVal - minVal || 1;
  const padding = range * 0.15;
  const yMin = Math.floor(minVal - padding);
  const yMax = Math.ceil(maxVal + padding);
  const yRange = yMax - yMin || 1;

  const width = 800;
  const height = 280;
  const paddingX = 50;
  const paddingY = 30;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const xForIndex = (i: number) => paddingX + (i / (times.length - 1)) * chartW;
  const yForValue = (v: number) => paddingY + chartH - ((v - yMin) / yRange) * chartH;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (yRange * i) / yTicks);

  const toggleModel = (id: string) => {
    setVisibleModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const currentMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{t('hourlyTitle')}</h3>
          <p className="text-sm text-slate-400">{t('hourlySubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                metric === m.key
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 600 }}>
          {tickValues.map((tv, i) => (
            <g key={i}>
              <line
                x1={paddingX}
                y1={yForValue(tv)}
                x2={width - paddingX}
                y2={yForValue(tv)}
                stroke="#334155"
                strokeWidth={0.5}
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 8}
                y={yForValue(tv) + 4}
                textAnchor="end"
                className="fill-slate-500"
                style={{ fontSize: 11 }}
              >
                {round(tv, metric === 'precipitation' ? (units === 'us' ? 2 : 1) : 0)}
              </text>
            </g>
          ))}

          {times.map((time, i) => {
            if (i % 3 !== 0) return null;
            return (
              <text
                key={time}
                x={xForIndex(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-500"
                style={{ fontSize: 11 }}
              >
                {formatHour(time)}
              </text>
            );
          })}

          {chartData.map((series) => {
            const pathParts: string[] = [];
            let started = false;
            series.points.forEach((v, i) => {
              if (v === null) return;
              const x = xForIndex(i);
              const y = yForValue(v);
              if (!started) {
                pathParts.push(`M ${x} ${y}`);
                started = true;
              } else {
                pathParts.push(`L ${x} ${y}`);
              }
            });
            const d = pathParts.join(' ');
            if (!d) return null;
            return (
              <g key={series.modelId}>
                <path
                  d={d}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.9}
                />
                {series.points.map((v, i) => {
                  if (v === null) return null;
                  if (i % 3 !== 0) return null;
                  return (
                    <circle
                      key={i}
                      cx={xForIndex(i)}
                      cy={yForValue(v)}
                      r={2.5}
                      fill={series.color}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 text-center text-xs text-slate-500">
        {currentMetric.unit} · {times.length} {t('hourlySubtitle').includes('24') ? 'hours' : ''}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {WEATHER_MODELS.map((model) => {
          const visible = visibleModels.has(model.id);
          return (
            <button
              key={model.id}
              onClick={() => toggleModel(model.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all ${
                visible
                  ? 'border-slate-600 bg-slate-700/40 text-slate-200'
                  : 'border-slate-800 bg-transparent text-slate-500'
              }`}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: visible ? model.color : '#475569' }}
              />
              {model.shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
