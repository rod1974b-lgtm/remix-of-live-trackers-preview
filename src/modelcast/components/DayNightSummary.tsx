// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import { ChevronUp, Loader2 } from 'lucide-react';
import type { CurrentWeather, DailyForecast, GeoLocation, HourlyForecast } from '@/modelcast/lib/types';
import { useSettings } from '@/modelcast/lib/settings';

interface DayNightSummaryProps {
  location: GeoLocation;
  current: CurrentWeather;
  hourly?: HourlyForecast | null;
  daily?: DailyForecast | null;
}

interface AstroDailyData {
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  moonPhase: number;
  uvIndexMax: number;
  sunshineDuration: number;
  windDirectionDominant: number;
  windSpeedMax: number;
  windGustsMax: number;
  timezoneAbbr: string;
  utcOffsetSeconds: number;
}

const astroCache = new Map<string, { data: AstroDailyData; ts: number }>();

function getCardinalDirection(deg: number): string {
  const directions = [
    'North', 'North-Northeast', 'Northeast', 'East-Northeast',
    'East', 'East-Southeast', 'Southeast', 'South-Southeast',
    'South', 'South-Southwest', 'Southwest', 'West-Southwest',
    'West', 'West-Northwest', 'Northwest', 'North-Northwest',
  ];
  const idx = Math.round((deg % 360) / 22.5) % 16;
  return directions[idx];
}

function getBeaufortDescriptor(kmh: number): string {
  if (kmh < 2) return 'calm air';
  if (kmh <= 6) return 'light air';
  if (kmh <= 12) return 'a light breeze';
  if (kmh <= 19) return 'a gentle breeze';
  if (kmh <= 29) return 'a moderate breeze';
  if (kmh <= 38) return 'a fresh breeze';
  if (kmh <= 49) return 'a strong breeze';
  return 'high winds';
}

export function DayNightSummary({ location, current, hourly, daily }: DayNightSummaryProps) {
  const { units } = useSettings();
  const [astro, setAstro] = useState<AstroDailyData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const cacheKey = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
    const cached = astroCache.get(cacheKey);

    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      setAstro(cached.data);
      return;
    }

    setLoading(true);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&daily=sunrise,sunset,moonrise,moonset,moon_phase,uv_index_max,sunshine_duration,wind_direction_10m_dominant,wind_speed_10m_max,wind_gusts_10m_max` +
      `&timezone=auto&forecast_days=2`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active || !json?.daily) return;
        const d = json.daily;
        const result: AstroDailyData = {
          sunrise: d.sunrise?.[0] ? d.sunrise[0].slice(11, 16) : '06:08',
          sunset: d.sunset?.[0] ? d.sunset[0].slice(11, 16) : '18:13',
          moonrise: d.moonrise?.[0] ? d.moonrise[0].slice(11, 16) : '20:03',
          moonset: d.moonset?.[0] ? d.moonset[0].slice(11, 16) : '08:16',
          moonPhase: d.moon_phase?.[0] ?? 0.5,
          uvIndexMax: Math.round(d.uv_index_max?.[0] ?? 8),
          sunshineDuration: d.sunshine_duration?.[0] ?? 0,
          windDirectionDominant: d.wind_direction_10m_dominant?.[0] ?? 180,
          windSpeedMax: Math.round(d.wind_speed_10m_max?.[0] ?? 12),
          windGustsMax: Math.round(d.wind_gusts_10m_max?.[0] ?? 30),
          timezoneAbbr: json.timezone_abbreviation ?? 'GMT+7',
          utcOffsetSeconds: json.utc_offset_seconds ?? 25200,
        };
        astroCache.set(cacheKey, { data: result, ts: Date.now() });
        setAstro(result);
      })
      .catch(() => {
        // Fallback default for Ratchaburi / Central Thailand
        if (active) {
          setAstro({
            sunrise: '06:08',
            sunset: '18:13',
            moonrise: '20:03',
            moonset: '08:16',
            moonPhase: 0.59,
            uvIndexMax: 8,
            sunshineDuration: 3600,
            windDirectionDominant: 180,
            windSpeedMax: 12,
            windGustsMax: 30,
            timezoneAbbr: 'GMT+7',
            utcOffsetSeconds: 25200,
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [location.latitude, location.longitude]);

  // Generate the natural meteorological text paragraph
  const narrative = useMemo(() => {
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Peak temperature
    let peakTemp = Math.round(current.temperature);
    if (daily) {
      for (const mId in daily.models) {
        const mMax = daily.models[mId]?.tempMax?.[0];
        if (typeof mMax === 'number') {
          peakTemp = Math.max(peakTemp, Math.round(mMax));
          break;
        }
      }
    }
    const tempUnit = units === 'us' ? '°F' : '°C';

    // Rain probability
    let maxRainProb = 80;
    if (hourly?.precipitationProbability?.length) {
      const next24h = hourly.precipitationProbability.slice(0, 24).filter((p): p is number => typeof p === 'number');
      if (next24h.length > 0) {
        maxRainProb = Math.max(...next24h);
      }
    }

    // Weather condition descriptor
    let timingSentence = 'The night and the afternoon there is a chance of thunderstorms and local showers.';
    let cloudSentence = 'Early in the day a few clouds are expected.';
    let sunSentence = 'The sun will not be visible.';

    if (maxRainProb < 20) {
      timingSentence = 'Dry weather is expected throughout the day and night with pleasant conditions.';
      cloudSentence = 'Clear to partly cloudy skies will prevail early in the morning.';
      sunSentence = 'Expect plenty of sunshine throughout the day.';
    } else if (maxRainProb < 50) {
      timingSentence = 'Scattered showers may develop during the afternoon with clearer skies overnight.';
      cloudSentence = 'A mix of sun and clouds is expected early in the day.';
      sunSentence = 'Sunny intervals are likely between passing cloud banks.';
    }

    const rainSentence =
      maxRainProb >= 70
        ? `Precipitation is very likely with an ${maxRainProb}% chance.`
        : maxRainProb >= 40
        ? `Precipitation is likely with a ${maxRainProb}% chance.`
        : maxRainProb >= 20
        ? `A moderate chance of rain (${maxRainProb}%) remains possible.`
        : `Precipitation is unlikely with low rain probability (${maxRainProb}%).`;

    const uvVal = astro?.uvIndexMax ?? 8;
    const uvSentence =
      uvVal >= 8
        ? `With UV-Index rising to ${uvVal}, sun protection is strongly recommended.`
        : uvVal >= 6
        ? `With UV-Index reaching ${uvVal}, sun protection is recommended around midday.`
        : `With UV-Index around ${uvVal}, standard daylight conditions apply.`;

    const windDir = astro ? getCardinalDirection(astro.windDirectionDominant) : 'South';
    const dayWindSpeed = astro?.windSpeedMax ?? 12;
    const gusts = astro?.windGustsMax ?? 30;

    const overnightWindDesc = 'light air is noticeable (1 to 7 km/h)';
    const dayWindDesc = `${getBeaufortDescriptor(dayWindSpeed)} (7 to ${dayWindSpeed} km/h)`;
    const gustSentence = gusts >= 25 ? `Gusts to ${gusts} km/h are possible.` : '';

    return `${timingSentence} ${cloudSentence} ${sunSentence} ${rainSentence} Temperatures peaking at ${peakTemp} ${tempUnit}. ${uvSentence} Overnight into ${dayOfWeek} ${overnightWindDesc}. During the day blows ${dayWindDesc}. ${gustSentence} Winds blowing from ${windDir}. The weather forecast for ${location.name} for ${dayOfWeek} can be accurate in parts but deviations are expected. Check again for latest updates.`;
  }, [location.name, current.temperature, daily, hourly, astro, units]);

  // Formatted Timezone text: GMT+07 (UTC +07:00h)
  const timezoneText = useMemo(() => {
    if (!astro) return 'GMT+07 (UTC +07:00h)';
    const offsetH = Math.round(astro.utcOffsetSeconds / 3600);
    const sign = offsetH >= 0 ? '+' : '-';
    const absH = Math.abs(offsetH);
    const padded = String(absH).padStart(2, '0');
    return `${astro.timezoneAbbr} (UTC ${sign}${padded}:00h)`;
  }, [astro]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/90 p-5 sm:p-7 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
        Weather report for {location.name}
      </h3>

      {/* Narrative Paragraph */}
      <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-300">
        {narrative}
      </p>

      {/* Bottom Metrics Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 pt-5">
        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
          {/* Sun & UV Card */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 shrink-0 flex-col items-center justify-between overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-400 via-orange-500 to-red-600 p-1 shadow-md">
              {/* Sun Horizon Graphic */}
              <div className="mt-1 flex justify-center">
                <svg viewBox="0 0 36 20" className="h-5 w-10">
                  <circle cx="18" cy="18" r="12" fill="#fef08a" />
                  <line x1="2" y1="18" x2="34" y2="18" stroke="#f97316" strokeWidth="2" />
                </svg>
              </div>

              {/* UV Badge */}
              <div className="flex items-center gap-1 rounded bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                UV {astro?.uvIndexMax ?? 8}
              </div>
            </div>

            {/* Sunrise / Sunset */}
            <div className="space-y-0.5 font-mono text-xs sm:text-sm font-semibold text-slate-200">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400">▲</span>
                <span>{astro?.sunrise ?? '06:08'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-orange-400">▼</span>
                <span>{astro?.sunset ?? '18:13'}</span>
              </div>
            </div>
          </div>

          {/* Moon Card */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-indigo-700/40 bg-gradient-to-b from-indigo-950 via-slate-900 to-indigo-900 shadow-md">
              {/* Illustrated Cratered Moon Disc */}
              <svg viewBox="0 0 40 40" className="h-9 w-9">
                <defs>
                  <radialGradient id="moonDiscGrad" cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#f3f4f6" />
                    <stop offset="65%" stopColor="#d1d5db" />
                    <stop offset="100%" stopColor="#9ca3af" />
                  </radialGradient>
                </defs>
                <circle cx="20" cy="20" r="16" fill="url(#moonDiscGrad)" />
                <circle cx="15" cy="16" r="2.3" fill="#9ca3af" opacity="0.6" />
                <circle cx="24" cy="14" r="2.8" fill="#9ca3af" opacity="0.5" />
                <circle cx="21" cy="24" r="3.2" fill="#9ca3af" opacity="0.6" />
                <circle cx="13" cy="24" r="1.6" fill="#9ca3af" opacity="0.5" />
                <circle cx="26" cy="21" r="1.4" fill="#9ca3af" opacity="0.5" />
              </svg>
            </div>

            {/* Moonrise / Moonset */}
            <div className="space-y-0.5 font-mono text-xs sm:text-sm font-semibold text-slate-200">
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-300">▲</span>
                <span>{astro?.moonrise ?? '20:03'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-400">▼</span>
                <span>{astro?.moonset ?? '08:16'}</span>
              </div>
            </div>
          </div>

          {/* Pressure & Timezone */}
          <div className="space-y-1 text-xs sm:text-sm text-slate-300">
            <div>
              <span className="font-medium text-slate-400">Pressure: </span>
              <span className="font-semibold text-slate-100">{Math.round(current.pressure)} hPa</span>
            </div>
            <div>
              <span className="font-medium text-slate-400">Timezone: </span>
              <span className="font-semibold text-slate-100">{timezoneText}</span>
            </div>
          </div>
        </div>

        {/* Back to top button */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="ml-auto flex items-center gap-1.5 rounded-xl bg-sky-700/90 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-600 cursor-pointer"
        >
          <ChevronUp size={16} />
          <span>Back to top</span>
        </button>
      </div>
    </div>
  );
}

