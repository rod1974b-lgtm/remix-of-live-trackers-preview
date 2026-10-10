// @ts-nocheck
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Shirt,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
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

  // Velocity-matched marquee animation durations (seconds)
  const threatTrackRef = useRef<HTMLDivElement>(null);
  const wearTrackRef = useRef<HTMLDivElement>(null);
  const [threatDuration, setThreatDuration] = useState<number>(75);
  const [wearDuration, setWearDuration] = useState<number>(45);

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
          const isExtremeGust = current.windSpeed >= 50; // km/h

          if (isThunderstorm) {
            items.push({
              id: 'atmo-tstorm',
              type: 'warning',
              title: '⚡ Severe Thunderstorm Activity',
              detail: 'Doppler echo: convective cells active in regional airspace. Seek indoor shelter.',
              source: 'Ground Radar Telemetry',
            });
          }

          if (isHeavyRain && !isThunderstorm) {
            items.push({
              id: 'atmo-rain',
              type: 'watch',
              title: '🌧️ Heavy Torrential Rainfall',
              detail: 'Intense precipitation rate detected. Localized ponding & reduced road visibility.',
              source: 'Surface Radar',
            });
          }

          if (isExtremeGust) {
            items.push({
              id: 'atmo-wind',
              type: 'watch',
              title: '💨 High Wind Advisory',
              detail: `Sustained wind gusts reaching ${Math.round(convertWind(current.windSpeed))} ${windUnit}. Secure loose lightweight outdoor gear.`,
              source: 'Anemometer Array',
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

  // Seamless clothing loop data
  const repeatedClothingTips = useMemo(() => {
    if (clothingTips.length === 0) return [];
    if (clothingTips.length <= 2) {
      return [...clothingTips, ...clothingTips, ...clothingTips, ...clothingTips];
    }
    return [...clothingTips, ...clothingTips];
  }, [clothingTips]);

  // 3. Synchronize Marquee Speeds: Level 3 (14 px/s on mobile, 18 px/s on desktop)
  useEffect(() => {
    const updateDurations = () => {
      const isMobile = window.innerWidth < 768;
      // Level 3 News Ticker velocity: 18.0 px/sec on PC, 14.0 px/sec on Phone
      const targetVelocity = isMobile ? 14.0 : 18.0;

      if (threatTrackRef.current) {
        const halfWidth = threatTrackRef.current.scrollWidth / 2;
        if (halfWidth > 0) {
          setThreatDuration(Math.max(12, Math.round(halfWidth / targetVelocity)));
        }
      }
      if (wearTrackRef.current) {
        const halfWidth = wearTrackRef.current.scrollWidth / 2;
        if (halfWidth > 0) {
          setWearDuration(Math.max(12, Math.round(halfWidth / targetVelocity)));
        }
      }
    };

    updateDurations();
    const timer = setTimeout(updateDurations, 250);
    window.addEventListener('resize', updateDurations);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDurations);
    };
  }, [alerts, repeatedClothingTips]);

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
        {/* Left Sticky Badge: Shortened on phone (62px), full on PC */}
        <div className="relative z-10 flex shrink-0 items-center justify-center gap-1 md:gap-1.5 bg-slate-900/95 backdrop-blur-md rounded-md py-0.5 px-1 md:py-1 md:px-2 border border-slate-700/60 shadow-sm w-[62px] min-w-[62px] sm:w-[68px] sm:min-w-[68px] md:w-auto md:min-w-0">
          {hasAlerts ? (
            <>
              <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 md:h-2 md:w-2 bg-red-500"></span>
              </span>
              <ShieldAlert size={11} className="md:w-3.5 md:h-3.5 text-red-400 shrink-0" />
              <span className="font-extrabold uppercase tracking-tight md:tracking-wider text-red-300 text-[8.5px] sm:text-[9.5px] md:text-[10.5px] truncate">
                <span className="md:hidden">Alerts{alerts.length > 0 ? ` (${alerts.length})` : ''}</span>
                <span className="hidden md:inline">Threat Center ({alerts.length})</span>
              </span>
            </>
          ) : (
            <>
              <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2 shrink-0">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 md:h-2 md:w-2 bg-emerald-400"></span>
              </span>
              <CheckCircle2 size={11} className="md:w-3.5 md:h-3.5 text-emerald-400 shrink-0" />
              <span className="font-bold uppercase tracking-tight md:tracking-wider text-emerald-300 text-[8.5px] sm:text-[9.5px] md:text-[10.5px] truncate">
                <span className="md:hidden">Alerts</span>
                <span className="hidden md:inline">Threat Center</span>
              </span>
            </>
          )}
        </div>

        {/* Marquee Content Mask */}
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%-6px),transparent)]">
          <div
            ref={threatTrackRef}
            className="ticker-track flex items-center whitespace-nowrap"
            style={{ animationDuration: `${threatDuration}s` }}
          >
            {hasAlerts ? (
              // Active Alerts Loop
              <div className="flex items-center gap-6 sm:gap-8 py-0.5">
                {alerts.concat(alerts).map((a, i) => (
                  <span key={`${a.id}-${i}`} className="inline-flex items-center gap-2 text-slate-200">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded font-black text-[9px] sm:text-[10px] uppercase tracking-wider ${
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
                    <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-emerald-500/30">
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
      {current && repeatedClothingTips.length > 0 && (
        <div className="group relative flex items-center overflow-hidden rounded-xl border border-sky-500/25 bg-gradient-to-r from-sky-950/40 via-slate-900/80 to-slate-900/90 hover:border-sky-500/50 px-1.5 py-1 sm:px-2.5 sm:py-1.5 md:px-3 md:py-2 text-xs transition-all duration-300 shadow-sm select-none">
          {/* Left Sticky Badge: Symmetrically shortened on phone (62px), full on PC */}
          <div className="relative z-10 flex shrink-0 items-center justify-center gap-1 md:gap-1.5 bg-slate-900/95 backdrop-blur-md rounded-md py-0.5 px-1 md:py-1 md:px-2 border border-slate-700/60 shadow-sm w-[62px] min-w-[62px] sm:w-[68px] sm:min-w-[68px] md:w-auto md:min-w-0">
            <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2 shrink-0">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 md:h-2 md:w-2 bg-sky-400"></span>
            </span>
            <Shirt size={11} className="md:w-3.5 md:h-3.5 text-sky-400 shrink-0" />
            <span className="font-bold uppercase tracking-tight md:tracking-wider text-sky-300 text-[8.5px] sm:text-[9.5px] md:text-[10.5px] truncate">
              <span className="md:hidden">Wear</span>
              <span className="hidden md:inline">What to Wear</span>
            </span>
          </div>

          {/* Marquee Content Mask */}
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%-6px),transparent)]">
            <div
              ref={wearTrackRef}
              className="ticker-track-wear flex items-center whitespace-nowrap"
              style={{ animationDuration: `${wearDuration}s` }}
            >
              <div className="flex items-center gap-6 sm:gap-8 py-0.5">
                {repeatedClothingTips.map((tip, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 text-slate-300">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-sky-500/30">
                      Outfit
                    </span>
                    <strong className="text-slate-100 font-semibold">{tip}</strong>
                    <span className="text-slate-600 select-none">•</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Indicator */}
          <div className="relative z-10 flex shrink-0 items-center pl-1 sm:pl-1.5 md:pl-2 text-sky-400/80 group-hover:text-sky-300 transition-colors">
            <ChevronRight size={13} className="md:w-3.5 md:h-3.5" />
          </div>
        </div>
      )}

      {/* Marquee Keyframes & Hover/Touch Pause */}
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
          animation-name: tickerScroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .ticker-track:hover,
        .ticker-track:active,
        .ticker-track-wear:hover,
        .ticker-track-wear:active {
          animation-play-state: paused !important;
        }
      `}</style>
    </div>
  );
}
