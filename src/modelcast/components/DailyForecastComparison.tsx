// @ts-nocheck -- imported Bolt code, written for a looser TS config
import { useMemo } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Sun,
  Droplets,
  Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DailyForecast } from '@/modelcast/lib/types';
import { WEATHER_MODELS } from '@/modelcast/lib/weatherModels';
import { getWeatherCodeInfo } from '@/modelcast/lib/weatherCodes';
import { formatDayName, isToday } from '@/modelcast/lib/utils';
import { useSettings } from '@/modelcast/lib/settings';
import { formatTemp, formatPrecip, formatWind } from '@/modelcast/lib/units';

const ICON_MAP: Record<string, LucideIcon> = {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudLightning,
  CloudOff,
};

function WeatherIcon({ code, size = 20, className }: { code: number; size?: number; className?: string }) {
  const info = getWeatherCodeInfo(code);
  const Icon = ICON_MAP[info.icon] ?? Cloud;
  return <Icon size={size} className={className} />;
}

interface DailyForecastComparisonProps {
  data: DailyForecast;
}

export function DailyForecastComparison({ data }: DailyForecastComparisonProps) {
  const { t, units } = useSettings();
  const days = data.time;

  // Hide models that returned no usable data at all (e.g. ECMWF IFS gaps).
  const visibleModels = useMemo(
    () =>
      WEATHER_MODELS.filter((model) => {
        const m = data.models[model.id];
        if (!m) return false;
        return m.tempMax.some((tv) => tv !== null) || m.tempMin.some((tv) => tv !== null);
      }),
    [data]
  );

  const tempRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const model of visibleModels) {
      const m = data.models[model.id];
      if (!m) continue;
      for (const tv of m.tempMax) if (tv !== null && tv > max) max = tv;
      for (const tv of m.tempMin) if (tv !== null && tv < min) min = tv;
    }
    if (min === Infinity) return { min: 0, max: 1, range: 1 };
    const range = max - min || 1;
    return { min: Math.floor(min - range * 0.1), max: Math.ceil(max + range * 0.1), range: max - min };
  }, [data]);

  return (
    <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white">{t('dailyTitle')}</h3>
        <p className="text-sm text-slate-400">{t('dailySubtitle')}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-800/40 p-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t('model')}
              </th>
              {days.map((day) => (
                <th key={day} className="p-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <div className={isToday(day) ? 'text-sky-400' : ''}>{formatDayName(day)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleModels.map((model) => {
              const m = data.models[model.id];
              if (!m) return null;
              return (
                <tr key={model.id} className="border-t border-slate-700/40 transition-colors hover:bg-slate-700/20">
                  <td className="sticky left-0 z-10 bg-slate-800/40 p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: model.color }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-200">{model.shortName}</p>
                        <p className="truncate text-xs text-slate-500">{model.resolution}</p>
                      </div>
                    </div>
                  </td>
                  {days.map((day, di) => {
                    const max = m.tempMax[di];
                    const min = m.tempMin[di];
                    const precip = m.precipitationSum[di];
                    const code = m.weatherCode[di];
                    const wind = m.windSpeedMax[di];

                    const barLow = min !== null ? ((min - tempRange.min) / tempRange.range) * 100 : 0;
                    const barHigh = max !== null ? ((max - tempRange.min) / tempRange.range) * 100 : 0;
                    const barWidth = Math.max(barHigh - barLow, 2);

                    return (
                      <td key={day} className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <WeatherIcon code={code ?? 0} size={18} className="text-slate-400" />
                          <div className="text-sm font-medium text-slate-200">
                            {formatTemp(max, units)}°
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatTemp(min, units)}°
                          </div>
                          <div className="mt-1 h-1 w-12 rounded-full bg-slate-700/50">
                            <div
                              className="h-1 rounded-full"
                              style={{
                                marginLeft: `${barLow}%`,
                                width: `${barWidth}%`,
                                backgroundColor: model.color,
                              }}
                            />
                          </div>
                          {precip !== null && precip > 0 && (
                            <div className="flex items-center gap-0.5 text-xs text-sky-400">
                              <Droplets size={10} />
                              {formatPrecip(precip, units, 1)}
                            </div>
                          )}
                          {wind !== null && wind > 20 && (
                            <div className="flex items-center gap-0.5 text-xs text-slate-500">
                              <Wind size={10} />
                              {formatWind(wind, units)}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
