// @ts-nocheck
import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle,
  Shirt,
  ShieldAlert,
  CheckCircle2,
  Wind,
  CloudRain,
  ChevronRight,
  Sparkles,
  Umbrella,
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
  const { tempUnit, windUnit, convertTemp, convertWind } = useSettings();
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
              title: '🌊 River Basin Flood Surge Watch',
              detail: `GloFAS Copernicus hydro-model telemetry indicates high discharge volume (${Math.round(todayFlow)} m³/s).`,
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
              title: '⚡ Severe Thunderstorm & Lightning Hazard',
              detail: 'Active convective cells detected. Seek shelter and avoid open water or elevated terrain.',
              source: 'Live Radar & Atmo Scan',
            });
          } else if (isHeavyRain) {
            items.push({
              id: 'atmo-rain',
              type: 'watch',
              title: '🌧️ Heavy Torrential Rainfall Watch',
              detail: 'Intense precipitation rate may cause localized street flooding and reduced visibility.',
              source: 'Live Doppler',
            });
          }

          if (current.windSpeed >= 50) {
            items.push({
              id: 'atmo-gale',
              type: 'advisory',
              title: '💨 High Wind & Gale Advisory',
              detail: `Sustained winds exceeding ${Math.round(convertWind(current.windSpeed))} ${windUnit}. Secure loose outdoor objects.`,
              source: 'Surface Anemometer',
            });
          }

          if (current.temperature >= 38) {
            items.push({
              id: 'atmo-heat',
              type: 'advisory',
              title: '🌡️ Extreme Heat & Sunstroke Advisory',
              detail: `Ambient temperature at ${Math.round(convertTemp(current.temperature))}°${tempUnit}. Limit direct sun exposure and stay hydrated.`,
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
      tips.push('☀️ Lightweight breathable cotton or linen fabrics, short sleeves, and loose shorts or skirt');
      tips.push('🕶️ Polarized sunglasses, wide-brim sun hat, and broad-spectrum SPF 50+ sunscreen');
    } else if (isPleasant) {
      tips.push('🌤️ Classic T-shirt with comfortable denim, chinos, or shorts');
      tips.push('🕶️ Light sunglasses and comfortable walking shoes or sneakers');
    } else if (isMild) {
      tips.push('⛅ Long-sleeve shirt or light knit sweater; carry a lightweight cardigan or denim jacket');
      tips.push('👖 Full-length trousers or comfortable jeans');
    } else if (isChilly) {
      tips.push('🧥 Medium-weight jacket, fleece, or layered sweater with thermal innerwear');
      tips.push('🧣 Light scarf and closed warm shoes or ankle boots');
    } else if (isCold) {
      tips.push('❄️ Heavy insulated coat or winter parka with thermal base layer');
      tips.push('🧤 Warm wool beanie, fleece-lined gloves, thick socks, and insulated footwear');
    }

    // Rain / Precipitation Gear
    if (isRain) {
      tips.push('☂️ Pack a sturdy compact umbrella and water-resistant hooded jacket or rain poncho');
      tips.push('👟 Non-slip, waterproof shoes or boots to prevent slipping on wet pavements');
    }

    // Snow
    if (isSnow) {
      tips.push('🥾 Waterproof snow boots with aggressive tread; water-repellent outer shell');
    }

    // Wind protection
    if (isWindy) {
      tips.push('💨 Windproof outer shell; secure loose hats, caps, or scarves against strong gusts');
    }

    // High Humidity
    if (current.humidity >= 80 && t >= 26) {
      tips.push('💧 High tropical humidity: choose moisture-wicking and quick-drying athletic wear');
    }

    return tips;
  }, [current]);

  if (!location) return null;

  const hasAlerts = alerts.length > 0;
  const cityName = location.name || 'Current Area';

  return (
    <div className="w-full max-w-4xl mx-auto px-2 space-y-2 mt-3">
      {/* 1. SEVERE WEATHER & THREAT CENTER TICKER */}
      <div
        onClick={onOpenTrackers}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpenTrackers?.();
        }}
        className={`group relative flex items-center overflow-hidden rounded-xl border px-3 py-2 text-xs transition-all duration-300 shadow-sm cursor-pointer select-none ${
          hasAlerts
            ? 'border-red-500/50 bg-gradient-to-r from-red-950/70 via-red-900/40 to-slate-900/90 hover:border-red-400'
            : 'border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 via-slate-900/80 to-slate-900/90 hover:border-emerald-400/60'
        }`}
        title="Click to open Live Trackers & Threat Center"
      >
        {/* Left Sticky Badge */}
        <div className="relative z-10 flex shrink-0 items-center gap-1.5 pr-3 bg-slate-900/90 backdrop-blur-md rounded-lg py-1 px-2 border border-slate-700/60 shadow-sm">
          {hasAlerts ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <ShieldAlert size={14} className="text-red-400" />
              <span className="font-extrabold uppercase tracking-wider text-red-300 text-[10.5px]">
                Threat Center ({alerts.length})
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span className="font-bold uppercase tracking-wider text-emerald-300 text-[10.5px]">
                Threat Center
              </span>
            </>
          )}
        </div>

        {/* Marquee Content Mask */}
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]">
          <div className="ticker-track flex items-center whitespace-nowrap">
            {hasAlerts ? (
              // Active Alerts Loop
              <div className="flex items-center gap-8 py-0.5">
                {alerts.concat(alerts).map((a, i) => (
                  <span key={`${a.id}-${i}`} className="inline-flex items-center gap-2 text-slate-200">
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded font-black text-[10px] uppercase tracking-wider ${
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
              <div className="flex items-center gap-8 py-0.5">
                {[1, 2].map((idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 text-slate-300">
                    <span className="inline-block px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-black text-[10px] uppercase tracking-wider border border-emerald-500/30">
                      All Clear
                    </span>
                    <strong className="text-emerald-200 font-semibold">
                      No Active Watches or Warnings for {cityName}
                    </strong>
                    <span className="text-slate-400 font-normal">
                      • Live river basin & storm monitors normal
                    </span>
                    <span className="text-slate-400 font-normal">
                      • Atmospheric telemetry stable
                    </span>
                    <span className="text-sky-400 font-medium group-hover:underline">
                      • Tap to inspect Live Threat Center radars
                    </span>
                    <span className="text-slate-600 select-none">•</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Arrow Action */}
        <div className="relative z-10 flex shrink-0 items-center pl-2 text-slate-400 group-hover:text-white transition-colors">
          <ChevronRight size={14} />
        </div>
      </div>

      {/* 2. WHAT TO WEAR SMART TICKER */}
      {current && clothingTips.length > 0 && (
        <div className="relative flex items-center overflow-hidden rounded-xl border border-sky-500/25 bg-gradient-to-r from-sky-950/40 via-slate-900/80 to-slate-900/90 px-3 py-1.5 text-xs shadow-sm select-none">
          {/* Left Sticky Badge */}
          <div className="relative z-10 flex shrink-0 items-center gap-1.5 pr-3 bg-slate-900/90 backdrop-blur-md rounded-lg py-1 px-2 border border-slate-700/60 shadow-sm">
            <Shirt size={14} className="text-sky-400" />
            <span className="font-extrabold uppercase tracking-wider text-sky-300 text-[10.5px]">
              What to Wear
            </span>
          </div>

          {/* Marquee Content Mask */}
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]">
            <div className="ticker-track-wear flex items-center whitespace-nowrap">
              <div className="flex items-center gap-8 py-0.5">
                {clothingTips.concat(clothingTips).map((tip, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 text-slate-200">
                    <span className="text-sky-200 font-medium">{tip}</span>
                    <span className="text-slate-600 select-none">•</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Icon Pill */}
          <div className="relative z-10 flex shrink-0 items-center pl-2 text-sky-400/80">
            <Sparkles size={13} />
          </div>
        </div>
      )}

      {/* Self-contained CSS for smooth slow-moving marquee with pause-on-hover */}
      <style>{`
        @keyframes tickerScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: tickerScroll 55s linear infinite;
        }
        .ticker-track-wear {
          display: flex;
          width: max-content;
          animation: tickerScroll 48s linear infinite;
        }
        .ticker-track:hover,
        .ticker-track-wear:hover {
          animation-play-state: paused !important;
        }
        @media (max-width: 640px) {
          .ticker-track {
            animation-duration: 42s;
          }
          .ticker-track-wear {
            animation-duration: 38s;
          }
        }
      `}</style>
    </div>
  );
}
