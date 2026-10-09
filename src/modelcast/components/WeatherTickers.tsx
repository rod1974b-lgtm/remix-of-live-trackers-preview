// @ts-nocheck
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Shirt,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useSettings } from '@/modelcast/lib/settings';
import { callFunction } from '@/modelcast/lib/supabase';
import type { GeoLocation, CurrentWeather } from '@/modelcast/lib/types';

interface WeatherTickersProps {
  location: GeoLocation | null;
  current: CurrentWeather | null;
  onOpenTrackers?: () => void;
}

interface AlertItem {
  id: string;
  type: 'emergency' | 'warning' | 'watch' | 'advisory' | 'info';
  title: string;
  detail: string;
  source?: string;
}

export function WeatherTickers({ location, current, onOpenTrackers }: WeatherTickersProps) {
  const { units } = useSettings();
  const tempUnit = units === 'us' ? 'F' : 'C';
  const windUnit = units === 'us' ? 'mph' : 'km/h';
  const convertTemp = useCallback((c: number) => (units === 'us' ? (c * 9) / 5 + 32 : c), [units]);
  const convertWind = useCallback((k: number) => (units === 'us' ? k * 0.621371 : k), [units]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // 1. Fetch live severe alerts, watches, GloFAS river flood signals
  useEffect(() => {
    if (!location) {
      setAlerts([]);
      return;
    }

    let isMounted = true;
    setLoadingAlerts(true);
    const lat = location.latitude;
    const lon = location.longitude;

    // Parallel fetch: Official warnings + GloFAS river surge
    const pOfficial = callFunction<{ alerts?: Array<{ alertType?: string; headline?: string; severity?: string; description?: string }> }>(
      'weather-alerts',
      { lat, lon }
    ).catch(() => ({ alerts: [] }));

    const pRiver = fetch(
      `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&past_days=3&forecast_days=3&models=seamless_v4`
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    Promise.all([pOfficial, pRiver])
      .then(([officialRes, riverRes]) => {
        if (!isMounted) return;
        const items: AlertItem[] = [];

        // Parse official warnings/watches/advisories
        if (officialRes?.alerts && officialRes.alerts.length > 0) {
          officialRes.alerts.forEach((a, idx) => {
            const sev = (a.severity || '').toLowerCase();
            const type = sev === 'extreme' || sev === 'severe' ? 'emergency' : sev === 'moderate' ? 'watch' : 'advisory';
            items.push({
              id: `off-${idx}`,
              type,
              title: a.alertType || a.headline || 'Weather Alert',
              detail: a.description || 'Active weather statement in effect for this region.',
              source: 'National Weather Feed',
            });
          });
        }

        // River discharge watch from GloFAS
        const flows = riverRes?.daily?.river_discharge ?? [];
        if (flows.length >= 4) {
          const todayFlow = flows[3] ?? flows[flows.length - 1] ?? 0;
          if (todayFlow >= 2500) {
            items.push({
              id: 'glofas-flood',
              type: 'warning',
              title: '🌊 River Flood Surge Watch',
              detail: `GloFAS Copernicus hydro-model: high discharge (${Math.round(todayFlow)} m³/s).`,
              source: 'GloFAS Copernicus',
            });
          }
        }

        // Check local severe atmospheric telemetry (gusts / storms / extreme heat)
        if (current) {
          const wCode = current.weatherCode ?? 0;
          const isThunderstorm = (wCode >= 95 && wCode <= 99);
          const isHeavyRain = (wCode >= 65 && wCode <= 67) || (wCode >= 81 && wCode <= 82);

          if (isThunderstorm) {
            items.push({
              id: 'atmo-thunder',
              type: 'warning',
              title: '⚡ Severe Thunderstorm Hazard',
              detail: 'Active convective cells detected. Seek indoor shelter.',
              source: 'Live Doppler',
            });
          } else if (isHeavyRain) {
            items.push({
              id: 'atmo-rain',
              type: 'watch',
              title: '🌧️ Heavy Rainfall Watch',
              detail: 'Intense rain rate: risk of localized street flooding.',
              source: 'Live Doppler',
            });
          }

          if (current.windSpeed >= 50) {
            items.push({
              id: 'atmo-gale',
              type: 'advisory',
              title: '💨 High Gale Advisory',
              detail: `Sustained winds exceeding ${Math.round(convertWind(current.windSpeed))} ${windUnit}. Secure loose objects.`,
              source: 'Surface Sensors',
            });
          }

          if (current.temperature >= 38) {
            items.push({
              id: 'atmo-heat',
              type: 'advisory',
              title: '🌡️ Extreme Heat Advisory',
              detail: `Ambient temp ${Math.round(convertTemp(current.temperature))}°${tempUnit}. Limit direct sun exposure.`,
              source: 'Thermal Sensors',
            });
          }
        }

        setAlerts(items);
      })
      .catch(() => {
        if (isMounted) setAlerts([]);
      })
      .finally(() => {
        if (isMounted) setLoadingAlerts(false);
      });

    return () => {
      isMounted = false;
    };
  }, [location, current, convertWind, convertTemp, windUnit, tempUnit]);

  // 2. Synthesize "What to Wear" Smart Recommendations
  const clothingTips = useMemo(() => {
    if (!current) return [];

    const tips: string[] = [];
    const t = current.temperature; // Celsius base
    const code = current.weatherCode;
    const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
    const isSnow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
    const isWindy = current.windSpeed >= 25;
    const isHot = t >= 30;
    const isPleasant = t >= 22 && t < 30;
    const isMild = t >= 16 && t < 22;
    const isChilly = t >= 8 && t < 16;
    const isCold = t < 8;

    // Base outfit
    if (isHot) {
      tips.push('☀️ Breathable cotton or linen fabrics, short sleeves, and loose shorts');
      tips.push('🕶️ Sunglasses, sun hat, and SPF 50+ sunscreen');
    } else if (isPleasant) {
      tips.push('🌤️ Comfortable T-shirt with denim, chinos, or shorts');
      tips.push('🕶️ Light sunglasses and walking sneakers');
    } else if (isMild) {
      tips.push('⛅ Long-sleeve shirt or light knit sweater; carry a light jacket');
      tips.push('👖 Full trousers or comfortable jeans');
    } else if (isChilly) {
      tips.push('🧥 Medium-weight jacket, fleece, or layered sweater');
      tips.push('🧣 Light scarf and closed warm shoes');
    } else if (isCold) {
      tips.push('❄️ Insulated coat or winter parka with thermal base layer');
      tips.push('🧤 Warm beanie, gloves, and winter boots');
    }

    // Rain / Precipitation Gear
    if (isRain) {
      tips.push('☂️ Sturdy compact umbrella and water-resistant hooded jacket');
      tips.push('👟 Non-slip, waterproof footwear');
    }

    // Snow
    if (isSnow) {
      tips.push('🥾 Waterproof snow boots with tread; water-repellent outer shell');
    }

    // Wind protection
    if (isWindy) {
      tips.push('💨 Windproof outer shell; secure loose hats and caps against gusts');
    }

    // High Humidity
    if (current.humidity >= 80 && t >= 26) {
      tips.push('💧 High humidity: choose moisture-wicking and quick-drying fabrics');
    }

    return tips;
  }, [current]);

  if (!location) return null;

  const hasAlerts = alerts.length > 0;
  const cityName = location.name || 'Current Area';

  return (
    <div className="w-full max-w-4xl mx-auto px-2 space-y-1.5 sm:space-y-2 mt-2 sm:mt-3">
      {/* 1. SEVERE WEATHER & THREAT CENTER TICKER */}
      <div
        onClick={onOpenTrackers}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpenTrackers?.();
        }}
        className={`group relative flex items-center overflow-hidden rounded-xl border px-1.5 py-1 sm:px-2.5 sm:py-1.5 md:px-3 md:py-2 text-xs transition-all duration-300 shadow-sm cursor-pointer select-none ${
          hasAlerts
            ? 'border-red-500/50 bg-gradient-to-r from-red-950/70 via-red-900/40 to-slate-900/90 hover:border-red-400'
            : 'border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 via-slate-900/80 to-slate-900/90 hover:border-emerald-400/60'
        }`}
        title="Click to open Live Trackers & Threat Center"
      >
        {/* Left Sticky Badge: Ultra-compact on phones, full on desktop */}
        <div className="relative z-10 flex shrink-0 items-center gap-1 md:gap-1.5 pr-1.5 md:pr-2.5 bg-slate-900/95 backdrop-blur-md rounded-md py-0.5 px-1.5 md:py-1 md:px-2 border border-slate-700/60 shadow-sm">
          {hasAlerts ? (
            <>
              <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 md:h-2 md:w-2 bg-red-500"></span>
              </span>
              <ShieldAlert size={11} className="md:w-3.5 md:h-3.5 text-red-400 shrink-0" />
              <span className="font-extrabold uppercase tracking-tight md:tracking-wider text-red-300 text-[9px] sm:text-[9.5px] md:text-[10.5px]">
                <span className="md:hidden">Threats ({alerts.length})</span>
                <span className="hidden md:inline">Threat Center ({alerts.length})</span>
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 size={11} className="md:w-3.5 md:h-3.5 text-emerald-400 shrink-0" />
              <span className="font-bold uppercase tracking-tight md:tracking-wider text-emerald-300 text-[9px] sm:text-[9.5px] md:text-[10.5px]">
                <span className="md:hidden">Alerts</span>
                <span className="hidden md:inline">Threat Center</span>
              </span>
            </>
          )}
        </div>

        {/* Marquee Content Mask */}
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%-6px),transparent)]">
          <div className="ticker-track flex items-center whitespace-nowrap">
            {hasAlerts ? (
              // Active Alerts Loop
              <div className="flex items-center gap-6 sm:gap-8 py-0.5">
                {alerts.concat(alerts).map((a, i) => (
                  <span key={`${a.id}-${i}`} className="inline-flex items-center gap-2 text-slate-200">
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded font-black text-[9px] sm:text-[10px] uppercase tracking-wider ${
                        a.type === 'emergency'
                          ? 'bg-red-500 text-white'
                          : a.type === 'warning'
                          ? 'bg-orange-500 text-white'
                          : 'bg-amber-400 text-slate-950'
                      }`}
                    >
                      {a.type}
                    </span>
                    <strong className="text-white font-semibold">{a.title}</strong>
                    <span className="text-slate-300 font-normal">— {a.detail}</span>
                    <span className="text-slate-500 text-[11px] font-medium">({a.source})</span>
                    <span className="text-slate-600 select-none">•</span>
                  </span>
                ))}
              </div>
            ) : (
              // All Clear Loop
              <div className="flex items-center gap-6 sm:gap-8 py-0.5">
                {[1, 2].map((idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 text-slate-300">
                    <span className="inline-block px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-emerald-500/30">
                      All Clear
                    </span>
                    <strong className="text-emerald-200 font-semibold">
                      No Active Watches or Warnings for {cityName}
                    </strong>
                    <span className="text-slate-400 font-normal">
                      • River basin & storm scans normal
                    </span>
                    <span className="text-slate-400 font-normal">
                      • Atmospheric telemetry stable
                    </span>
                    <span className="text-sky-400 font-medium group-hover:underline">
                      • Tap to inspect Threat Center radars
                    </span>
                    <span className="text-slate-600 select-none">•</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Arrow Action */}
        <div className="relative z-10 flex shrink-0 items-center pl-1 sm:pl-1.5 md:pl-2 text-slate-400 group-hover:text-white transition-colors">
          <ChevronRight size={13} className="md:w-3.5 md:h-3.5" />
        </div>
      </div>

      {/* 2. WHAT TO WEAR SMART TICKER */}
      {current && clothingTips.length > 0 && (
        <div className="relative flex items-center overflow-hidden rounded-xl border border-sky-500/25 bg-gradient-to-r from-sky-950/40 via-slate-900/80 to-slate-900/90 px-1.5 py-1 sm:px-2.5 sm:py-1.5 md:px-3 md:py-2 text-xs shadow-sm select-none">
          {/* Left Sticky Badge: Ultra-compact on phones, full on desktop */}
          <div className="relative z-10 flex shrink-0 items-center gap-1 md:gap-1.5 pr-1.5 md:pr-2.5 bg-slate-900/95 backdrop-blur-md rounded-md py-0.5 px-1.5 md:py-1 md:px-2 border border-slate-700/60 shadow-sm">
            <Shirt size={11} className="md:w-3.5 md:h-3.5 text-sky-400 shrink-0" />
            <span className="font-bold uppercase tracking-tight md:tracking-wider text-sky-300 text-[9px] sm:text-[9.5px] md:text-[10.5px]">
              <span className="md:hidden">Wear</span>
              <span className="hidden md:inline">What to Wear</span>
            </span>
          </div>

          {/* Marquee Content Mask */}
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%-6px),transparent)]">
            <div className="ticker-track-wear flex items-center whitespace-nowrap">
              <div className="flex items-center gap-6 sm:gap-8 py-0.5">
                {clothingTips.concat(clothingTips).map((tip, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 text-slate-300">
                    <span className="inline-block px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-sky-500/30">
                      Outfit
                    </span>
                    <strong className="text-slate-100 font-medium">{tip}</strong>
                    <span className="text-slate-600 select-none">•</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Icon Pill */}
          <div className="relative z-10 flex shrink-0 items-center pl-1 sm:pl-1.5 md:pl-2 text-sky-400/80">
            <Sparkles size={13} className="md:w-3.5 md:h-3.5" />
          </div>
        </div>
      )}

      {/* Synchronized ultra-slow marquee speeds: 240s on mobile, 180s on desktop */}
      <style>{`
        @keyframes tickerScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .ticker-track,
        .ticker-track-wear {
          display: flex;
          width: max-content;
          animation: tickerScroll 180s linear infinite;
        }
        .ticker-track:hover,
        .ticker-track:active,
        .ticker-track-wear:hover,
        .ticker-track-wear:active {
          animation-play-state: paused !important;
        }
        @media (max-width: 768px) {
          .ticker-track,
          .ticker-track-wear {
            animation-duration: 240s;
          }
        }
      `}</style>
    </div>
  );
}
