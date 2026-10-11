// @ts-nocheck -- imported Bolt code, written for a looser TS config
import { useMemo, useState } from 'react';
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
  Moon,
  Droplets,
  Wind,
  Thermometer,
  Star,
  Trophy,
  ArrowRight,
  MapPin,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CurrentWeather, GeoLocation, HourlyForecast, DailyForecast, ModelAccuracy, VoteAggregate, WeatherModel } from '@/modelcast/lib/types';
import { getWeatherCodeInfo } from '@/modelcast/lib/weatherCodes';
import { useSettings } from '@/modelcast/lib/settings';
import {
  formatTemp,
  formatWind,
  formatPrecip,
  tempUnitLabel,
} from '@/modelcast/lib/units';
import { formatHour, formatDayName, isToday, getHourIndex } from '@/modelcast/lib/utils';
import { WEATHER_MODELS, getModelById } from '@/modelcast/lib/weatherModels';

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

function WeatherIcon({ code, size = 24, className }: { code: number; size?: number; className?: string }) {
  const info = getWeatherCodeInfo(code);
  const Icon = ICON_MAP[info.icon] ?? Cloud;
  return <Icon size={size} className={className} />;
}

interface DayNightSummary {
  avgTemp: number | null;
  maxTemp: number | null;
  minTemp: number | null;
  totalPrecip: number;
  maxWind: number;
  avgHumidity: number | null;
  dominantCode: number;
  hourlyTemps: (number | null)[];
  hourlyTimes: string[];
  hourlyPrecips: (number | null)[];
  hourlyCodes: (number | null)[];
}

function computeDayNightSummary(
  hourlyTime: string[] = [],
  hourlyTemp: (number | null)[] = [],
  hourlyPrecip: (number | null)[] = [],
  hourlyWind: (number | null)[] = [],
  hourlyHumidity: (number | null)[] = [],
  hourlyCode: (number | null)[] = [],
  dateStr: string,
  startHour: number,
  endHour: number,
): DayNightSummary {
  const indices: number[] = [];
  for (let i = 0; i < hourlyTime.length; i++) {
    const time = hourlyTime[i];
    if (!time) continue;
    const datePart = time.slice(0, 10);
    const h = Number(time.slice(11, 13));
    if (datePart === dateStr && h >= startHour && h < endHour) {
      indices.push(i);
    }
  }

  if (indices.length === 0) {
    return {
      avgTemp: null,
      maxTemp: null,
      minTemp: null,
      totalPrecip: 0,
      maxWind: 0,
      avgHumidity: null,
      dominantCode: 0,
      hourlyTemps: [],
      hourlyTimes: [],
      hourlyPrecips: [],
      hourlyCodes: [],
    };
  }

  const temps = indices
    .map((i) => hourlyTemp[i])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));

  const hums = indices
    .map((i) => hourlyHumidity[i])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));

  const winds = indices
    .map((i) => hourlyWind[i])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));

  const precips = indices
    .map((i) => hourlyPrecip[i])
    .map((v) => (typeof v === 'number' && !isNaN(v) ? v : 0));

  const codes = indices
    .map((i) => hourlyCode[i])
    .map((v) => (typeof v === 'number' && !isNaN(v) ? v : 0));

  const codeFreq: Record<number, number> = {};
  for (const c of codes) codeFreq[c] = (codeFreq[c] ?? 0) + 1;
  const dominantCode = Object.entries(codeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  return {
    avgTemp: temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    maxTemp: temps.length > 0 ? Math.max(...temps) : null,
    minTemp: temps.length > 0 ? Math.min(...temps) : null,
    totalPrecip: precips.length > 0 ? precips.reduce((a, b) => a + b, 0) : 0,
    maxWind: winds.length > 0 ? Math.max(...winds) : 0,
    avgHumidity: hums.length > 0 ? hums.reduce((a, b) => a + b, 0) / hums.length : null,
    dominantCode: Number(dominantCode),
    hourlyTemps: indices.map((i) => (typeof hourlyTemp[i] === 'number' && !isNaN(hourlyTemp[i]) ? hourlyTemp[i] : null)),
    hourlyTimes: indices.map((i) => hourlyTime[i] ?? ''),
    hourlyPrecips: indices.map((i) => (typeof hourlyPrecip[i] === 'number' && !isNaN(hourlyPrecip[i]) ? hourlyPrecip[i] : 0)),
    hourlyCodes: indices.map((i) => (typeof hourlyCode[i] === 'number' && !isNaN(hourlyCode[i]) ? hourlyCode[i] : 0)),
  };
}

interface TopModelForecastProps {
  location: GeoLocation;
  model: WeatherModel | string;
  current: CurrentWeather;
  hourly: HourlyForecast;
  daily: DailyForecast;
  votes: VoteAggregate[];
  accuracy: ModelAccuracy[];
  onOpenModels: () => void;
}

export function TopModelForecast({
  location,
  model: autoModelProp,
  current,
  hourly,
  daily,
  votes,
  accuracy,
  onOpenModels,
}: TopModelForecastProps) {
  const { t, units } = useSettings();
  const [expandedDay, setExpandedDay] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState('auto');

  // Resolve autoModel safely whether passed as object or string ID,
  // and guarantee it points to a model with real data
  const autoModel: WeatherModel = useMemo(() => {
    let base: WeatherModel | undefined;
    if (typeof autoModelProp === 'string') {
      base = getModelById(autoModelProp) ?? WEATHER_MODELS.find((m) => m.id === autoModelProp);
    } else if (autoModelProp && typeof autoModelProp === 'object' && 'id' in autoModelProp) {
      base = autoModelProp as WeatherModel;
    }

    const hasData = base && hourly?.models?.[base.id]?.temperature?.some((temp) => typeof temp === 'number' && !isNaN(temp));
    if (hasData && base) return base;

    // Fallback to first available model with actual forecast numbers
    if (hourly?.models) {
      const workingId = Object.keys(hourly.models).find((id) =>
        hourly.models[id]?.temperature?.some((temp) => typeof temp === 'number' && !isNaN(temp)),
      );
      if (workingId) {
        return getModelById(workingId) ?? WEATHER_MODELS.find((m) => m.id === workingId) ?? WEATHER_MODELS[0];
      }
    }

    return base ?? WEATHER_MODELS[0];
  }, [autoModelProp, hourly]);

  const model = useMemo(() => {
    if (selectedModelId === 'auto') return autoModel;
    return WEATHER_MODELS.find((m) => m.id === selectedModelId) ?? autoModel;
  }, [selectedModelId, autoModel]);

  const modelData = hourly?.models?.[model.id] ?? hourly?.models?.[autoModel.id];
  const dailyData = daily?.models?.[model.id] ?? daily?.models?.[autoModel.id];

  const voteAgg = votes.find((v) => v.model_id === model.id);
  const rating = voteAgg?.avg_rating ?? 0;
  const voteCount = voteAgg?.vote_count ?? 0;
  const accuracyAgg = accuracy.find((a) => a.modelId === model.id && a.hasData);
  const accuracyScore = accuracyAgg?.overallScore ?? null;
  const accuracyRank = accuracyAgg?.rank ?? null;

  const hourIdx = useMemo(() => getHourIndex(hourly.time), [hourly.time]);

  const VIEW_HOURS = 24;
  const startIdx = hourIdx;
  const endIdx = Math.min(startIdx + VIEW_HOURS, hourly.time.length);

  const hours = hourly.time.slice(startIdx, endIdx);
  const temps = modelData?.temperature?.slice(startIdx, endIdx) ?? [];
  const precips = modelData?.precipitation?.slice(startIdx, endIdx) ?? [];
  const codes = modelData?.weatherCode?.slice(startIdx, endIdx) ?? [];
  const currentTemp = current?.temperature ?? 0;
  const currentCode = current?.weatherCode ?? 0;
  const currentInfo = getWeatherCodeInfo(currentCode);
  const currentWind = current?.windSpeed ?? 0;
  const currentHumidity = current?.humidity ?? 0;

  const todayHigh = dailyData?.tempMax?.[0] ?? currentTemp;
  const todayLow = dailyData?.tempMin?.[0] ?? currentTemp;

  const days = daily.time.slice(0, 7);
  const dailyMax = dailyData?.tempMax?.slice(0, 7) ?? [];
  const dailyMin = dailyData?.tempMin?.slice(0, 7) ?? [];
  const dailyCodes = dailyData?.weatherCode?.slice(0, 7) ?? [];
  const dailyPrecip = dailyData?.precipitationSum?.slice(0, 7) ?? [];
  const dailyWind = dailyData?.windSpeedMax?.slice(0, 7) ?? [];

  const allDailyMax = dailyMax.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const allDailyMin = dailyMin.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const weekMin = allDailyMin.length > 0 ? Math.min(...allDailyMin) : 0;
  const weekMax = allDailyMax.length > 0 ? Math.max(...allDailyMax) : 1;
  const weekRange = weekMax - weekMin || 1;

  const hTime = hourly.time;
  const hTemp = modelData?.temperature ?? [];
  const hPrecip = modelData?.precipitation ?? [];
  const hWind = modelData?.windSpeed ?? [];
  const hHum = modelData?.humidity ?? [];
  const hCode = modelData?.weatherCode ?? [];

  return (
    <div className="space-y-4">
      {/* Top model badge */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${model.color}20` }}
          >
            <Trophy size={20} style={{ color: model.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                {t('topModelRank')}
              </p>
              {selectedModelId === 'auto' && (
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Auto #1
                </span>
              )}
            </div>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="mt-0.5 max-w-[240px] cursor-pointer rounded-lg border border-slate-600/60 bg-slate-900/70 px-2 py-1 text-sm font-bold text-white outline-none transition-colors hover:border-sky-400/60 focus:border-sky-400"
            >
              <option value="auto">⭐ Auto (Top Ranked: {autoModel.name})</option>
              <optgroup label="Choose a model">
                {WEATHER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.organization}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-xs text-slate-500">{model.region} · {model.resolution}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {accuracyScore !== null && (
            <div className="text-right">
              <div className="flex items-center gap-1">
                <FlaskConical size={16} className="text-emerald-400" />
                <span className="text-lg font-bold text-white">{accuracyScore.toFixed(0)}</span>
                <span className="text-xs text-slate-500">/100</span>
              </div>
              <p className="text-xs text-slate-500">{accuracyRank === 1 ? 'Most accurate' : `Accuracy #${accuracyRank}`}</p>
            </div>
          )}
          {rating > 0 ? (
            <div className="text-right">
              <div className="flex items-center gap-1">
                <Star size={16} className="fill-amber-400 text-amber-400" />
                <span className="text-lg font-bold text-white">{rating.toFixed(1)}</span>
              </div>
              <p className="text-xs text-slate-500">{voteCount} {voteCount === 1 ? t('vote') : t('votes')}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t('topModelNoVotes')}</p>
          )}
          <button
            onClick={onOpenModels}
            className="flex items-center gap-1 rounded-lg bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/30"
          >
            {t('weatherModelsLive')}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Today section */}
      <div className="overflow-hidden rounded-3xl border border-slate-700/50 bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/40">
        <div className="flex items-center justify-between border-b border-slate-700/40 px-5 py-3 sm:px-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            {t('currentConditions')}
          </h3>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: model.color }} />
            <span className="text-xs font-medium text-slate-400">{model.shortName}</span>
          </div>
        </div>

        {/* Hero current conditions */}
        <div className="px-5 py-6 sm:px-6">
          <div className="flex items-center gap-6">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-3xl"
              style={{ backgroundColor: `${model.color}15` }}
            >
              <WeatherIcon code={currentCode} size={48} className="text-slate-100" />
            </div>
            <div>
              <div className="flex items-start gap-1">
                <span className="text-6xl font-extralight leading-none text-white">
                  {formatTemp(currentTemp, units)}
                </span>
                <span className="mt-1 text-2xl font-light text-slate-400">
                  {tempUnitLabel(units)}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-300">{currentInfo.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {t('feelsLike')} {formatTemp(current.apparentTemperature, units)}°
              </p>
            </div>
            <div className="ml-auto hidden gap-3 sm:flex">
              <TodayMetric icon={<Wind size={16} />} label={t('wind')} value={formatWind(currentWind, units, 0)} />
              <TodayMetric icon={<Droplets size={16} />} label={t('humidity')} value={`${currentHumidity}%`} />
              <TodayMetric icon={<Thermometer size={16} />} label="H" value={`${formatTemp(todayHigh, units)}°`} />
              <TodayMetric icon={<Thermometer size={16} />} label="L" value={`${formatTemp(todayLow, units)}°`} />
            </div>
          </div>

          {/* Mobile metrics */}
          <div className="mt-4 grid grid-cols-4 gap-2 sm:hidden">
            <MobileMetric icon={<Wind size={14} />} label={t('wind')} value={formatWind(currentWind, units, 0)} />
            <MobileMetric icon={<Droplets size={14} />} label={t('humidity')} value={`${currentHumidity}%`} />
            <MobileMetric icon={<Thermometer size={14} />} label="H" value={`${formatTemp(todayHigh, units)}°`} />
            <MobileMetric icon={<Thermometer size={14} />} label="L" value={`${formatTemp(todayLow, units)}°`} />
          </div>
        </div>

        {/* Hourly forecast strip */}
        <div className="border-t border-slate-700/40 px-3 py-3 sm:px-4">
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1" style={{ minWidth: hours.length * 56 }}>
              {hours.map((time, i) => {
                const temp = temps[i];
                const code = codes[i] ?? 0;
                const precip = precips[i] ?? 0;
                const isNow = i === 0;
                return (
                  <div
                    key={time}
                    className={`flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-xl py-2.5 ${
                      isNow ? 'bg-sky-500/15' : ''
                    }`}
                  >
                    <span className={`text-xs font-medium ${isNow ? 'text-sky-400' : 'text-slate-500'}`}>
                      {isNow ? 'Now' : formatHour(time)}
                    </span>
                    <WeatherIcon code={code} size={22} className="text-slate-300" />
                    <span className="text-sm font-semibold text-white">
                      {formatTemp(temp, units)}°
                    </span>
                    {precip !== null && precip > 0 ? (
                      <span className="flex items-center gap-0.5 text-xs text-sky-400">
                        <Droplets size={8} />
                        {formatPrecip(precip, units, 0)}
                      </span>
                    ) : (
                      <span className="h-4" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Daily forecast */}
      <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="text-xl font-bold text-white">{t('dailyTitle')}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
            <MapPin size={15} className="text-sky-400" />
            <span>{location.name}{location.admin1 ? `, ${location.admin1}` : ''}, {location.country}</span>
            <span className="text-slate-600">·</span>
            <span>{model.shortName} live forecast</span>
          </div>
        </div>

        <div className="hidden grid-cols-[100px_minmax(230px,1.25fr)_64px_minmax(160px,1fr)_64px_104px_24px] gap-3 border-b border-slate-700/60 px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:grid">
          <span>Day</span>
          <span>Conditions</span>
          <span className="text-right">Low</span>
          <span />
          <span>High</span>
          <span className="text-right">Wind</span>
          <span />
        </div>

        <div className="space-y-1.5 sm:space-y-0">
          {days.map((day, i) => (
            <DayRow
              key={day}
              day={day}
              max={dailyMax[i]}
              min={dailyMin[i]}
              code={dailyCodes[i] ?? 0}
              precip={dailyPrecip[i]}
              wind={dailyWind[i] ?? 0}
              weekMin={weekMin}
              weekRange={weekRange}
              model={model}
              units={units}
              isExpanded={expandedDay === i}
              onToggle={() => setExpandedDay(expandedDay === i ? -1 : i)}
              hTime={hTime}
              hTemp={hTemp}
              hPrecip={hPrecip}
              hWind={hWind}
              hHum={hHum}
              hCode={hCode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface DayRowProps {
  day: string;
  max: number | null;
  min: number | null;
  code: number;
  precip: number | null;
  wind: number;
  weekMin: number;
  weekRange: number;
  model: WeatherModel;
  units: 'metric' | 'us';
  isExpanded: boolean;
  onToggle: () => void;
  hTime: string[];
  hTemp: (number | null)[];
  hPrecip: (number | null)[];
  hWind: (number | null)[];
  hHum: (number | null)[];
  hCode: (number | null)[];
}

function DayRow({
  day,
  max,
  min,
  code,
  precip,
  wind,
  weekMin,
  weekRange,
  model,
  units,
  isExpanded,
  onToggle,
  hTime,
  hTemp,
  hPrecip,
  hWind,
  hHum,
  hCode,
}: DayRowProps) {
  const info = getWeatherCodeInfo(code);
  const barLow = min !== null ? ((min - weekMin) / weekRange) * 100 : 0;
  const barWidth = max !== null && min !== null ? Math.max(((max - min) / weekRange) * 100, 6) : 0;

  const daySummary = useMemo(
    () => computeDayNightSummary(hTime, hTemp, hPrecip, hWind, hHum, hCode, day, 6, 18),
    [hTime, hTemp, hPrecip, hWind, hHum, hCode, day],
  );

  const nightSummary = useMemo(
    () => {
      const firstHalf = computeDayNightSummary(hTime, hTemp, hPrecip, hWind, hHum, hCode, day, 0, 6);
      const secondHalf = computeDayNightSummary(hTime, hTemp, hPrecip, hWind, hHum, hCode, day, 18, 24);
      
      const combinedTemps = [...firstHalf.hourlyTemps, ...secondHalf.hourlyTemps].filter(
        (v): v is number => typeof v === 'number' && !isNaN(v),
      );

      return {
        ...firstHalf,
        totalPrecip: firstHalf.totalPrecip + secondHalf.totalPrecip,
        maxWind: Math.max(firstHalf.maxWind, secondHalf.maxWind),
        hourlyTemps: [...firstHalf.hourlyTemps, ...secondHalf.hourlyTemps],
        hourlyTimes: [...firstHalf.hourlyTimes, ...secondHalf.hourlyTimes],
        hourlyPrecips: [...firstHalf.hourlyPrecips, ...secondHalf.hourlyPrecips],
        hourlyCodes: [...firstHalf.hourlyCodes, ...secondHalf.hourlyCodes],
        avgTemp: combinedTemps.length > 0 ? combinedTemps.reduce((a, b) => a + b, 0) / combinedTemps.length : null,
        maxTemp: combinedTemps.length > 0 ? Math.max(...combinedTemps) : null,
        minTemp: combinedTemps.length > 0 ? Math.min(...combinedTemps) : null,
        avgHumidity:
          firstHalf.avgHumidity !== null && secondHalf.avgHumidity !== null
            ? (firstHalf.avgHumidity + secondHalf.avgHumidity) / 2
            : firstHalf.avgHumidity ?? secondHalf.avgHumidity,
        dominantCode: firstHalf.hourlyTimes.length >= secondHalf.hourlyTimes.length
          ? firstHalf.dominantCode
          : secondHalf.dominantCode,
      };
    },
    [hTime, hTemp, hPrecip, hWind, hHum, hCode, day],
  );

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`grid w-full grid-cols-[minmax(64px,0.6fr)_minmax(150px,1.4fr)_48px_minmax(70px,1fr)_48px_24px] items-center gap-2 rounded-xl px-3 py-3 text-left transition-colors sm:grid-cols-[100px_minmax(230px,1.25fr)_64px_minmax(160px,1fr)_64px_104px_24px] sm:gap-3 ${
          isExpanded ? 'bg-sky-500/10' : 'hover:bg-slate-700/30'
        }`}
      >
        <span className="text-sm font-semibold text-slate-200">
          {isToday(day) ? 'Today' : formatDayName(day)}
        </span>

        <span className="flex min-w-0 items-center gap-2">
          <WeatherIcon code={code} size={23} className="shrink-0 text-slate-300" />
          {precip !== null && precip > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-sky-400">
              <Droplets size={10} />
              {formatPrecip(precip, units, 0)}
            </span>
          )}
          <span className="truncate text-sm text-slate-300">{info.label}</span>
        </span>

        <span className="text-right text-sm text-slate-500">{formatTemp(min, units)}°</span>

        <span className="relative hidden h-1.5 rounded-full bg-slate-700/60 sm:block">
          <span
            className="absolute h-1.5 rounded-full"
            style={{ left: `${barLow}%`, width: `${barWidth}%`, backgroundColor: model.color }}
          />
        </span>

        <span className="text-sm font-semibold text-white">{formatTemp(max, units)}°</span>

        <span className="hidden items-center justify-end gap-1 text-xs text-slate-400 sm:flex">
          <Wind size={12} />
          {formatWind(wind, units, 0)}
        </span>

        <span className="flex justify-end text-slate-500">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {isExpanded && (
        <div className="mx-1 mb-2 rounded-2xl border border-slate-700/50 bg-slate-900/50 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <PeriodCard
              title="Day"
              icon={<Sun size={18} className="text-amber-400" />}
              subtitle="6 AM – 6 PM"
              summary={daySummary}
              model={model}
              units={units}
            />
            <PeriodCard
              title="Night"
              icon={<Moon size={18} className="text-indigo-300" />}
              subtitle="6 PM – 6 AM"
              summary={nightSummary}
              model={model}
              units={units}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PeriodCard({
  title,
  icon,
  subtitle,
  summary,
  model,
  units,
}: {
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  summary: DayNightSummary;
  model: WeatherModel;
  units: 'metric' | 'us';
}) {
  const { t } = useSettings();
  const info = getWeatherCodeInfo(summary.dominantCode);
  const hasHourly = summary.hourlyTemps.length > 0;

  const allVals = summary.hourlyTemps.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const minVal = allVals.length > 0 ? Math.min(...allVals) : 0;
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 1;
  const valRange = maxVal - minVal || 1;

  const chartH = 48;
  const chartW = 100;

  const points = summary.hourlyTemps.map((v, i) => {
    if (typeof v !== 'number' || isNaN(v)) return null;
    const x = (i / Math.max(summary.hourlyTemps.length - 1, 1)) * chartW;
    const y = chartH - ((v - minVal) / valRange) * (chartH - 8) - 4;
    return { x, y, v };
  });

  const validPoints = points.filter((p): p is { x: number; y: number; v: number } => p !== null && !isNaN(p.x) && !isNaN(p.y));
  const pathD = validPoints.length > 1
    ? validPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    : '';

  const displayTemp = title === 'Day' ? summary.maxTemp : summary.minTemp;

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <span className="text-xs text-slate-500">{subtitle}</span>
        </div>
        <WeatherIcon code={summary.dominantCode} size={28} className="text-slate-300" />
      </div>

      <div className="mt-3 flex items-end gap-3">
        <div className="flex items-baseline gap-2">
          <p className="text-4xl font-semibold text-white">
            {formatTemp(displayTemp, units)}°
          </p>
          <p className="text-sm text-slate-300">{info.label}</p>
        </div>
        <div className="ml-auto flex gap-4 text-xs">
          <div className="text-right">
            <p className="text-slate-500">High</p>
            <p className="font-semibold text-white">{formatTemp(summary.maxTemp, units)}°</p>
          </div>
          <div className="text-right">
            <p className="text-slate-500">Low</p>
            <p className="font-semibold text-white">{formatTemp(summary.minTemp, units)}°</p>
          </div>
        </div>
      </div>

      {/* Mini temperature chart */}
      {hasHourly && pathD && (
        <div className="mt-3 overflow-hidden rounded-lg bg-slate-900/40 p-2">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" preserveAspectRatio="none" style={{ height: chartH }}>
            <path d={pathD} fill="none" stroke={model.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* Metrics grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/50 pt-3">
        <DetailMetric
          icon={<Droplets size={14} />}
          label={t('precip')}
          value={summary.totalPrecip > 0 ? formatPrecip(summary.totalPrecip, units, 1) : '0'}
          accent={summary.totalPrecip > 0 ? 'text-sky-400' : undefined}
        />
        <DetailMetric
          icon={<Wind size={14} />}
          label={t('wind')}
          value={formatWind(summary.maxWind, units, 0)}
        />
        <DetailMetric
          icon={<Droplets size={14} />}
          label={t('humidity')}
          value={summary.avgHumidity !== null ? `${Math.round(summary.avgHumidity)}%` : '—'}
        />
        <DetailMetric
          icon={<Thermometer size={14} />}
          label="Range"
          value={
            summary.maxTemp !== null && summary.minTemp !== null
              ? `${formatTemp(summary.maxTemp, units)}° / ${formatTemp(summary.minTemp, units)}°`
              : '—'
          }
        />
      </div>
    </div>
  );
}

function TodayMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-slate-800/50 px-3 py-2">
      <div className="flex items-center gap-1 text-slate-400">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function MobileMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-slate-800/50 py-1.5">
      <div className="flex items-center gap-1 text-slate-400">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function DetailMetric({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{icon}</span>
      <span className="text-slate-400">{label}</span>
      <span className={`ml-auto font-medium ${accent ?? 'text-slate-200'}`}>{value}</span>
    </div>
  );
}
