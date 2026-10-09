import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { GeoLocation, HourlyForecast } from '@/modelcast/lib/types';
import { callFunction, supabaseUrl, supabaseAnonKey, FunctionHttpError } from '@/modelcast/lib/supabase';

async function fetchLightningStrikes(bbox?: [number, number, number, number]) {
  const [lonMin, latMin, lonMax, latMax] = bbox ?? [-180, -90, 180, 90];
  const payload = await callFunction<{ strikes?: { lat: number; lon: number; time?: number }[] }>(
    'lightning-proxy',
    { latMin, latMax, lonMin, lonMax },
  );
  return payload?.strikes ?? [];
}
import { fetchPrecipitationNearby, fetchTropicalStorms, haversineKm } from '@/modelcast/lib/liveTrackers';
import type { TropicalStorm } from '@/modelcast/lib/liveTrackers';
import { useSettings } from '@/modelcast/lib/settings';
import { cToF, kmhToMph, mmToInches, hpaToInhg } from '@/modelcast/lib/units';
import type { UnitSystem } from '@/modelcast/lib/units';

const uP = (mm: number, u: UnitSystem) => (u === 'us' ? mmToInches(mm).toFixed(2) : mm.toFixed(1));
const uPL = (u: UnitSystem) => (u === 'us' ? 'in' : 'mm');
const uW = (kmh: number, u: UnitSystem) => Math.round(u === 'us' ? kmhToMph(kmh) : kmh);
const uWL = (u: UnitSystem) => (u === 'us' ? 'mph' : 'km/h');
const uT = (c: number, u: UnitSystem) => `${Math.round(u === 'us' ? cToF(c) : c)}${u === 'us' ? '°F' : '°C'}`;
const uD = (km: number, u: UnitSystem) => `${Math.round(u === 'us' ? km * 0.621371 : km).toLocaleString()} ${u === 'us' ? 'mi' : 'km'}`;
import { X, Satellite, Wind, Zap, ExternalLink, Loader2, AlertTriangle, Clock, CheckCircle2, Info } from 'lucide-react';

type TabId = 'precip' | 'warnings' | 'satellite' | 'earthquake' | 'hurricane' | 'lightning';
type LightningRegion = 'nearby' | 'asia' | 'europe' | 'americas' | 'global';

type EarthquakeFeature = {
  id: string;
  properties: { place?: string | undefined; mag?: number; time?: number };
  geometry: { coordinates: [number, number, number] };
};

interface WeatherAlertData {
  id: string;
  area: string;
  alertType: string;
  severity: string;
  certainty: string;
  onset: string;
  expires: string;
  description: string;
  instruction: string;
  source?: string;
}

function ProxyErrorBanner({ message, mapUrl, mapLabel }: { message: string; mapUrl: string; mapLabel: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex flex-wrap items-start gap-3">
      <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="flex-1 min-w-[180px] text-xs text-red-200 font-medium break-words">{message}</p>
      <a href={mapUrl} target="_blank" rel="noreferrer" className="shrink-0 px-3 py-1.5 rounded-full bg-sky-600 text-white text-xs flex items-center gap-1 hover:bg-sky-500">{mapLabel} <ExternalLink size={10} /></a>
    </div>
  );
}

function formatAlertTime(iso: string): string {
  if (!iso) return 'Unknown';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function severityColor(severity: string): { bg: string; border: string; text: string } {
  const s = severity.toLowerCase();
  if (s === 'extreme') return { bg: 'bg-red-500/15', border: 'border-red-500/40', text: 'text-red-300' };
  if (s === 'severe') return { bg: 'bg-orange-500/15', border: 'border-orange-500/40', text: 'text-orange-300' };
  if (s === 'moderate') return { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-300' };
  if (s === 'minor') return { bg: 'bg-yellow-500/15', border: 'border-yellow-500/40', text: 'text-yellow-300' };
  return { bg: 'bg-sky-500/15', border: 'border-sky-500/40', text: 'text-sky-300' };
}

function WarningsTracker({ location, onSelectTab }: { location: GeoLocation | null; onSelectTab?: (tab: 'precipitation' | 'lightning') => void }) {
  const { units } = useSettings();
  const [alerts, setAlerts] = useState<WeatherAlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [showHydroDrawer, setShowHydroDrawer] = useState(false);

  // Live River & Atmospheric State
  const [river, setRiver] = useState<{
    today: number;
    pastMin: number;
    pastMax: number;
    surgePct: number;
    forecastMax: number;
    level: 'critical' | 'watch' | 'advisory' | 'safe';
    trend: 'rising' | 'peaking' | 'receding' | 'stable';
    history: { date: string; flow: number }[];
    forecast: { date: string; flow: number }[];
  } | null>(null);

  const [atmo, setAtmo] = useState<{
    feelsLike: number;
    temp: number;
    humidity: number;
    windGusts: number;
    maxGustsToday: number;
    rain3DaySum: number;
    stormProb: number;
    isThunderstorm: boolean;
  } | null>(null);

  const lat = location?.latitude ?? 13.54;
  const lon = location?.longitude ?? 99.82;
  const locName = location?.name ?? 'Ratchaburi';

  // 5-minute auto-refresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    // Parallel fetch: Official warnings + GloFAS river discharge + Live atmospheric telemetry
    const pAlerts = callFunction<{ alerts?: WeatherAlertData[]; error?: string }>('weather-alerts', { lat, lon })
      .catch(() => ({ alerts: [] }));

    const pRiver = fetch(
      `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge,river_discharge_max,river_discharge_min&past_days=7&forecast_days=7&models=seamless_v4`
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const pAtmo = fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,weather_code&daily=precipitation_sum,precipitation_probability_max,wind_gusts_10m_max&past_days=3&forecast_days=3&timezone=auto`
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    Promise.all([pAlerts, pRiver, pAtmo])
      .then(([alertRes, riverRes, atmoRes]) => {
        if (!mounted) return;

        // Process River Discharge Data (GloFAS Copernicus)
        let computedRiver: typeof river = null;
        if (riverRes?.daily?.river_discharge?.length >= 8) {
          const times: string[] = riverRes.daily.time ?? [];
          const flows: number[] = riverRes.daily.river_discharge ?? [];
          const todayIdx = 7; // index 7 is today (7 past days: 0..6)
          const todayFlow = flows[todayIdx] ?? flows[flows.length - 1] ?? 0;
          const pastFlows = flows.slice(0, 7);
          const pastMin = pastFlows.length ? Math.min(...pastFlows) : todayFlow;
          const pastMax = pastFlows.length ? Math.max(...pastFlows) : todayFlow;
          const forecastFlows = flows.slice(7);
          const forecastMax = forecastFlows.length ? Math.max(...forecastFlows) : todayFlow;

          const baseline = pastMin > 1 ? pastMin : 10;
          const surgePct = todayFlow > baseline ? ((todayFlow - baseline) / baseline) * 100 : 0;

          let level: 'critical' | 'watch' | 'advisory' | 'safe' = 'safe';
          if ((surgePct >= 120 || todayFlow >= 3000) && todayFlow > 50) {
            level = 'critical';
          } else if ((surgePct >= 60 || todayFlow >= 1500) && todayFlow > 30) {
            level = 'watch';
          } else if ((surgePct >= 25 || todayFlow >= 500) && todayFlow > 15) {
            level = 'advisory';
          }

          const tomorrowFlow = flows[todayIdx + 1] ?? todayFlow;
          let trend: 'rising' | 'peaking' | 'receding' | 'stable' = 'stable';
          if (tomorrowFlow > todayFlow * 1.05) trend = 'rising';
          else if (tomorrowFlow < todayFlow * 0.95) trend = 'receding';
          else if (todayFlow >= forecastMax * 0.95 && todayFlow > pastMin * 1.5) trend = 'peaking';

          const history = times.slice(0, 8).map((t, idx) => ({ date: t, flow: flows[idx] ?? 0 }));
          const forecast = times.slice(8).map((t, idx) => ({ date: t, flow: flows[8 + idx] ?? 0 }));

          computedRiver = {
            today: todayFlow,
            pastMin,
            pastMax,
            surgePct,
            forecastMax,
            level,
            trend,
            history,
            forecast,
          };
          setRiver(computedRiver);
        }

        // Process Atmospheric Data
        if (atmoRes) {
          const cur = atmoRes.current ?? {};
          const daily = atmoRes.daily ?? {};
          const pastRains: number[] = (daily.precipitation_sum ?? []).slice(0, 3);
          const rain3Day = pastRains.reduce((a: number, b: number) => a + (b || 0), 0);
          const weatherCode = cur.weather_code ?? 0;
          const stormProb = (daily.precipitation_probability_max ?? [])[3] ?? (daily.precipitation_probability_max ?? [])[0] ?? 0;
          const maxGustsToday = (daily.wind_gusts_10m_max ?? [])[3] ?? cur.wind_gusts_10m ?? 0;

          setAtmo({
            feelsLike: Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 32),
            temp: Math.round(cur.temperature_2m ?? 30),
            humidity: Math.round(cur.relative_humidity_2m ?? 70),
            windGusts: Math.round(cur.wind_gusts_10m ?? 15),
            maxGustsToday: Math.round(maxGustsToday),
            rain3DaySum: Math.round(rain3Day * 10) / 10,
            stormProb: Math.round(stormProb),
            isThunderstorm: weatherCode >= 95,
          });
        }

        // Combine Alerts
        const incomingAlerts: WeatherAlertData[] = alertRes.alerts ?? [];
        const combinedAlerts = [...incomingAlerts];

        // Synthesize high-priority River Warning if GloFAS detects an elevated or critical surge
        if (computedRiver && (computedRiver.level === 'critical' || computedRiver.level === 'watch')) {
          const isCritical = computedRiver.level === 'critical';
          combinedAlerts.unshift({
            id: 'river-surge-' + locName.toLowerCase(),
            area: `${locName} Basin (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
            alertType: isCritical ? '🌊 River Surge Emergency Warning' : '🌊 River Basin Flood Watch',
            severity: isCritical ? 'extreme' : 'severe',
            certainty: 'Observed',
            onset: new Date().toISOString(),
            expires: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            description: `Global Flood Awareness System (GloFAS / Copernicus ECMWF) reports river discharge currently surging at ${Math.round(computedRiver.today).toLocaleString()} m³/s (+${Math.round(computedRiver.surgePct)}% above 7-day baseline of ${Math.round(computedRiver.pastMin).toLocaleString()} m³/s).\n\nRiverbanks, canal junctions, and low-lying agricultural zones along the basin are at high risk of bank overflow and severe waterlogging.`,
            instruction: `1. Avoid riverbanks, canal retention basins, and low bridges.\n2. Move valuable equipment, livestock, and vehicles to higher ground.\n3. Monitor real-time sluice gate announcements from the local irrigation department (RID / TMD).`,
            source: 'Copernicus GloFAS Seamless v4 & Open-Meteo Flood API',
          });
        }

        setAlerts(combinedAlerts);
        setUpdatedAt(new Date());
      })
      .catch((e: Error) => {
        if (!mounted) return;
        setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [lat, lon, tick, locName]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-300">
        <Loader2 size={32} className="animate-spin mb-3 text-amber-400" />
        <span className="text-base font-semibold">Scanning severe weather &amp; river basin threats for {locName}...</span>
      </div>
    );
  }

  const rank = (s: string) => ({ extreme: 0, severe: 1, moderate: 2, minor: 3 } as Record<string, number>)[s.toLowerCase()] ?? 4;
  const sorted = [...alerts].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || new Date(a.expires).getTime() - new Date(b.expires).getTime(),
  );

  const highestAlert = sorted[0];
  const hasSevere = highestAlert && (highestAlert.severity.toLowerCase() === 'severe' || highestAlert.severity.toLowerCase() === 'extreme');
  const hasModerate = highestAlert && highestAlert.severity.toLowerCase() === 'moderate';

  const endsIn = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const h = Math.max(0, Math.round((d.getTime() - Date.now()) / 3600000));
    return `Ends in ${h}h (${fmtICT(d)} ICT)`;
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse shadow-sm shadow-amber-500" />
          <span className="text-sm text-white font-bold tracking-wide">SEVERE WEATHER &amp; RIVER HAZARDS &bull; {locName}</span>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          Updated {fmtICT(updatedAt)} ICT &bull; auto-refreshes 5m
        </span>
      </div>

      {/* Error Banner */}
      {error && alerts.length === 0 && (
        <ProxyErrorBanner message={error} mapUrl="https://www.tmd.go.th/en/" mapLabel="Open TMD Warnings" />
      )}

      {/* Big Status Hero Banner */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          hasSevere
            ? 'bg-red-500/15 border-red-500/50 text-red-200'
            : hasModerate
            ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
            : alerts.length > 0
            ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
            : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
        }`}
      >
        <div>
          <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1.5 border border-current/30">
            {hasSevere ? '⚠️ EMERGENCY WARNING' : hasModerate ? '⚡ WEATHER ADVISORY' : alerts.length > 0 ? 'ℹ️ WEATHER NOTICE' : '✅ ALL CLEAR'}
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-white leading-snug">
            {highestAlert ? highestAlert.alertType : 'No Active Weather Emergencies'}
          </h2>
          <p className="text-sm font-medium text-slate-200/90 mt-0.5">
            {highestAlert
              ? `${locName} (${lat.toFixed(2)}, ${lon.toFixed(2)}) • ${endsIn(highestAlert.expires)}`
              : `Atmosphere & river levels over ${locName} are currently within safe baseline ranges.`}
          </p>
        </div>

        <div className="shrink-0 bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-700/60 text-right">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">Active Alerts</span>
          <span className={`text-2xl font-black ${alerts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {alerts.length}
          </span>
        </div>
      </div>

      {/* 4-Pillar Daily Hazard Matrix (Powered by Live Hydrology + Atmospheric Feeds) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Atmospheric &amp; River Hazard Matrix
          </span>
          <span className="text-[11px] text-slate-500 font-medium">Live sensor &amp; model feeds</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* 1. Lightning & Storms */}
          <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span>⚡ Lightning</span>
              <span className={atmo?.isThunderstorm || (atmo?.stormProb ?? 0) >= 70 ? 'text-amber-400' : 'text-emerald-400'}>
                {atmo?.isThunderstorm ? 'HIGH' : (atmo?.stormProb ?? 0) >= 50 ? 'ELEVATED' : 'LOW'}
              </span>
            </div>
            <div className="text-base font-extrabold text-white mt-1">
              {atmo?.isThunderstorm ? 'Active Cells' : (atmo?.stormProb ?? 0) >= 50 ? 'Rain Showers' : 'Scattered'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {atmo ? `${atmo.stormProb}% precip prob` : 'Under 10 strikes/hr'}
            </div>
          </div>

          {/* 2. Live River & Flash Flood */}
          <button
            type="button"
            onClick={() => setShowHydroDrawer((s) => !s)}
            className={`rounded-xl p-3 shadow-sm text-left transition-all border ${
              river?.level === 'critical'
                ? 'bg-red-500/20 border-red-500/60 hover:bg-red-500/25 ring-1 ring-red-500/50'
                : river?.level === 'watch'
                ? 'bg-amber-500/20 border-amber-500/60 hover:bg-amber-500/25'
                : 'bg-slate-800/80 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-300">🌊 River Flood</span>
              <span
                className={
                  river?.level === 'critical'
                    ? 'text-red-300 animate-pulse font-black'
                    : river?.level === 'watch'
                    ? 'text-amber-300 font-bold'
                    : 'text-emerald-400'
                }
              >
                {river?.level === 'critical' ? 'SURGE' : river?.level === 'watch' ? 'WATCH' : 'SAFE'}
              </span>
            </div>
            <div className="text-base font-extrabold text-white mt-1">
              {river && river.today > 10 ? `${Math.round(river.today).toLocaleString()} m³/s` : 'Normal Flow'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>{river && river.surgePct > 10 ? `+${Math.round(river.surgePct)}% surge` : `3-Day rain < ${units === 'us' ? '1 in' : '25 mm'}`}</span>
              <span className="text-[10px] text-sky-400 font-bold">{showHydroDrawer ? '▲ Hide' : '▼ Hydro'}</span>
            </div>
          </button>

          {/* 3. Wind Gusts */}
          <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span>💨 Wind Gusts</span>
              <span className={(atmo?.maxGustsToday ?? 0) >= 50 ? 'text-red-400' : (atmo?.maxGustsToday ?? 0) >= 30 ? 'text-amber-400' : 'text-emerald-400'}>
                {(atmo?.maxGustsToday ?? 0) >= 50 ? 'GALE' : (atmo?.maxGustsToday ?? 0) >= 30 ? 'GUSTY' : 'CALM'}
              </span>
            </div>
            <div className="text-base font-extrabold text-white mt-1">
              {atmo ? `${uW(atmo.windGusts, units)}–${uW(atmo.maxGustsToday, units)} ${uWL(units)}` : `${uW(15, units)}–${uW(25, units)} ${uWL(units)}`}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {(atmo?.maxGustsToday ?? 0) >= 35 ? 'Hold loose objects' : 'Breeze • safe'}
            </div>
          </div>

          {/* 4. Heat Index */}
          <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span>🌡️ Heat Index</span>
              <span className={(atmo?.feelsLike ?? 32) >= 41 ? 'text-red-400' : (atmo?.feelsLike ?? 32) >= 35 ? 'text-amber-400' : 'text-emerald-400'}>
                {(atmo?.feelsLike ?? 32) >= 41 ? 'DANGER' : (atmo?.feelsLike ?? 32) >= 35 ? 'CAUTION' : 'NORMAL'}
              </span>
            </div>
            <div className="text-base font-extrabold text-amber-300 mt-1">
              Feels {uT(atmo?.feelsLike ?? 37, units)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {atmo ? `${uT(atmo.temp, units)} • ${atmo.humidity}% RH` : 'Stay hydrated'}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive River Basin Hydrograph Drawer */}
      {showHydroDrawer && river && (
        <div className="rounded-2xl border border-sky-500/40 bg-sky-950/20 p-4 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌊</span>
              <div>
                <h4 className="text-sm font-extrabold text-white">
                  River Basin Telemetry &bull; {locName}
                </h4>
                <p className="text-[11px] text-sky-200/80">
                  Global Flood Awareness System (GloFAS Copernicus Seamless v4)
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-black uppercase ${
                river.level === 'critical'
                  ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                  : river.level === 'watch'
                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                  : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
              }`}
            >
              {river.level === 'critical' ? '⚠️ Severe River Surge' : river.level === 'watch' ? '⚡ Flood Watch' : 'Normal Basin Flow'}
            </span>
          </div>

          {/* Hydro Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/60 p-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Discharge</span>
              <span className="text-base sm:text-lg font-black text-white">
                {Math.round(river.today).toLocaleString()} <span className="text-xs font-normal text-slate-400">m³/s</span>
              </span>
            </div>
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/60 p-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">7-Day Surge</span>
              <span className={`text-base sm:text-lg font-black ${river.surgePct >= 80 ? 'text-red-400' : river.surgePct >= 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                +{Math.round(river.surgePct)}%
              </span>
            </div>
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/60 p-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">7-Day Baseline Low</span>
              <span className="text-base sm:text-lg font-black text-slate-300">
                {Math.round(river.pastMin).toLocaleString()} <span className="text-xs font-normal text-slate-400">m³/s</span>
              </span>
            </div>
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/60 p-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Flow Trend</span>
              <span className="text-base sm:text-lg font-black text-sky-300 capitalize">
                {river.trend}
              </span>
            </div>
          </div>

          {/* Discharge Flow Mini-Timeline */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-3">
            <span className="text-[11px] font-bold text-slate-300 block mb-2">
              Recent Flow Progression &bull; 7-Day Buildup to Peak (m³/s)
            </span>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-center">
              {river.history.map((h, i) => {
                const isToday = i === river.history.length - 1;
                const dateLabel = h.date.slice(5); // "09-30"
                const pctOfMax = Math.min(100, Math.max(15, (h.flow / (river.pastMax || river.today || 1)) * 100));
                return (
                  <div
                    key={h.date}
                    className={`rounded-lg p-1.5 border transition-all ${
                      isToday
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200 font-bold ring-1 ring-sky-400/50'
                        : 'bg-slate-800/60 border-slate-700/40 text-slate-400'
                    }`}
                  >
                    <div className="text-[10px]">{isToday ? 'Today' : dateLabel}</div>
                    <div className="h-8 flex items-end justify-center my-1">
                      <div
                        className={`w-full rounded-sm ${isToday ? 'bg-sky-400' : 'bg-slate-600'}`}
                        style={{ height: `${pctOfMax}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-bold text-slate-200 truncate">
                      {Math.round(h.flow)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>
              💡 Volumetric flow &gt; 1,500 m³/s or surge &gt; +100% signals elevated riverbank overflow risk.
            </span>
            <a
              href="https://www.thaiwater.net/"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300 font-semibold underline shrink-0 ml-2"
            >
              ThaiWater Hydro Station →
            </a>
          </div>
        </div>
      )}

      {/* Official Alert Cards List */}
      {sorted.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Active Bulletins &amp; Severe Warnings
          </div>
          {sorted.map((a) => {
            const colors = severityColor(a.severity);
            const open = openId === a.id;
            return (
              <div key={a.id} className={`rounded-2xl border-l-4 border ${colors.border} ${colors.bg} overflow-hidden shadow-md`}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : a.id)}
                  className="w-full text-left p-4 flex items-center gap-3.5"
                >
                  <AlertTriangle size={22} className={`${colors.text} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-extrabold text-base sm:text-lg">{a.alertType}</div>
                    <div className="text-slate-300 text-xs sm:text-sm mt-0.5 font-medium">
                      {locName} &bull; {endsIn(a.expires)}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg border ${colors.border} ${colors.text} text-xs uppercase font-extrabold`}>
                    {a.severity}
                  </span>
                  <span className="text-slate-400 text-sm font-bold ml-1">{open ? '▲' : '▼'}</span>
                </button>

                {open && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-700/60 pt-3">
                    {(a.onset || a.expires) && (
                      <div className="text-xs text-slate-300 flex items-center gap-2">
                        <Clock size={14} className="text-amber-400" />
                        <span>
                          {a.onset && <>From <b>{formatAlertTime(a.onset)}</b> </>}
                          {a.expires && <>until <b>{formatAlertTime(a.expires)}</b></>}
                        </span>
                      </div>
                    )}
                    {a.description && (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Description</div>
                        <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line">{a.description}</p>
                      </div>
                    )}
                    {a.instruction && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-1">Safety Advice</div>
                        <p className="text-amber-100 text-sm leading-relaxed whitespace-pre-line">{a.instruction}</p>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 font-medium">
                      Certainty: <span className="text-slate-200 font-semibold">{a.certainty}</span> &bull; Source: <span className="text-slate-200 font-semibold">{a.source ?? 'Open-Meteo & TMD feed'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Info & External Link */}
      <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Real-time Copernicus GloFAS &bull; Official TMD &amp; Open-Meteo feeds</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://www.thaiwater.net/"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:text-sky-300 underline font-semibold"
          >
            ThaiWater Portal →
          </a>
          <a
            href="https://www.tmd.go.th/en/"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:text-sky-300 underline font-semibold"
          >
            TMD Portal →
          </a>
        </div>
      </div>
    </div>
  );
}

interface PrecipHour {
  time: string;
  precip: number;
  prob: number;
  dateKey: string;
  hour: number;
  isPast: boolean;
  isNow: boolean;
}

function precipLevel(mm: number): string {
  if (mm > 7.5) return 'Heavy';
  if (mm >= 2.5) return 'Moderate';
  if (mm > 0) return 'Light';
  return 'None';
}

function precipBarColor(mm: number): string {
  if (mm > 7.5) return '#a855f7'; // Vivid Purple for heavy
  if (mm >= 2.5) return '#3b82f6'; // Royal Blue for moderate
  if (mm > 0) return '#38bdf8';   // Sky Blue for light
  return '#334155';
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PrecipitationTracker({ location }: { location: GeoLocation | null }) {
  const { units } = useSettings();
  const lat = location?.latitude ?? 13.9642;
  const lon = location?.longitude ?? 99.9445;
  const locName = location?.name ?? 'this area';

  const [hours, setHours] = useState<PrecipHour[]>([]);
  const [currentPrecip, setCurrentPrecip] = useState(0);
  const [currentProb, setCurrentProb] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Big readability state controls
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0); // 0 = Today, 1 = Tomo, 2 = Day 3, 3 = All
  const [viewMode, setViewMode] = useState<'chart' | 'list'>('chart');
  const [inspectedHour, setInspectedHour] = useState<PrecipHour | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchData = async () => {
      if (!mounted) return;
      setError(null);
      try {
        const result = await fetchPrecipitationNearby(lat, lon);
        if (!mounted) return;

        const now = Date.now();
        const allHours: PrecipHour[] = result.timeline.map((time, i) => {
          const d = new Date(time);
          return {
            time,
            precip: result.precipitation[i] ?? 0,
            prob: result.probability[i] ?? 0,
            dateKey: localDateKey(d),
            hour: d.getHours(),
            isPast: d.getTime() < now,
            isNow: false,
          };
        });

        let minDiff = Infinity;
        let nowIdx = -1;
        for (let i = 0; i < allHours.length; i++) {
          const diff = Math.abs(new Date(allHours[i]!.time).getTime() - now);
          if (diff < minDiff) {
            minDiff = diff;
            nowIdx = i;
          }
        }
        if (nowIdx >= 0) allHours[nowIdx]!.isNow = true;

        if (allHours.length === 0) throw new Error('No precipitation data available for this location');
        setHours(allHours);
        if (nowIdx >= 0) {
          setCurrentPrecip(allHours[nowIdx]!.precip);
          setCurrentProb(allHours[nowIdx]!.prob);
          setInspectedHour(allHours[nowIdx]!);
        }
        setLastUpdated(new Date());
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch precipitation data');
        setHours([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    setLoading(true);
    void fetchData();
    timer = setInterval(() => void fetchData(), 5 * 60 * 1000);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [lat, lon]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-300">
        <Loader2 size={32} className="animate-spin mb-3 text-sky-400" />
        <span className="text-base font-semibold">Fetching precipitation data for {locName}...</span>
      </div>
    );
  }

  // Group hours by day
  const dayGroups: { dateKey: string; label: string; hours: PrecipHour[] }[] = [];
  hours.forEach((h) => {
    let group = dayGroups.find((g) => g.dateKey === h.dateKey);
    if (!group) {
      const d = new Date(h.time);
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      group = { dateKey: h.dateKey, label, hours: [] };
      dayGroups.push(group);
    }
    group.hours.push(h);
  });

  const displayedHours = selectedDayIdx < 3 && dayGroups[selectedDayIdx]
    ? dayGroups[selectedDayIdx]!.hours
    : hours;

  const nowIdx = hours.findIndex((h) => h.isNow);
  const nextRain = nowIdx >= 0 ? hours.find((h, i) => i > nowIdx && h.precip > 0.1) : undefined;
  const totalForecast = hours.slice(nowIdx >= 0 ? nowIdx : 0).reduce((sum, h) => sum + h.precip, 0);

  let peakIdx = -1;
  displayedHours.forEach((h, i) => {
    if (h.precip > 0 && (peakIdx < 0 || h.precip > displayedHours[peakIdx]!.precip)) peakIdx = i;
  });
  const peakHour = peakIdx >= 0 ? displayedHours[peakIdx] : undefined;

  // Natural-language hero headline
  let heroHeadline = 'No precipitation expected over the next 3 days.';
  let heroSubline = 'Clear skies and dry conditions forecasted.';
  let heroBadge = 'Dry';
  let heroBadgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

  if (currentPrecip > 0.1) {
    heroBadge = `${precipLevel(currentPrecip)} Rain Now`;
    heroBadgeColor = currentPrecip > 7.5 ? 'bg-purple-500/20 text-purple-200 border-purple-500/50' : 'bg-sky-500/20 text-sky-200 border-sky-500/50';
    heroHeadline = `Currently raining at ${uP(currentPrecip, units)} ${uPL(units)}/h (${currentProb}% chance)`;
    heroSubline = nextRain ? `Showers continuing through ${fmtICT(new Date(nextRain.time))} ICT` : 'Showers tapering off soon';
  } else if (nextRain) {
    const mins = Math.max(0, Math.round((new Date(nextRain.time).getTime() - Date.now()) / 60000));
    const hoursAway = Math.floor(mins / 60);
    const minsAway = mins % 60;
    heroBadge = nextRain.precip > 7.5 ? 'Heavy Downpour Expected' : 'Showers Coming';
    heroBadgeColor = nextRain.precip > 7.5 ? 'bg-amber-500/20 text-amber-200 border-amber-500/50' : 'bg-sky-500/20 text-sky-200 border-sky-500/50';
    heroHeadline = `Rain begins in ${hoursAway > 0 ? `${hoursAway}h ` : ''}${minsAway}m around ${fmtICT(new Date(nextRain.time))} ICT`;
    heroSubline = `Expected rate: ${uP(nextRain.precip, units)} ${uPL(units)}/h (${nextRain.prob}% probability)`;
  }

  // Chart geometry with large, uncompressed sizing
  const yMax = 12;
  const tickStep = 3;
  const barSlot = selectedDayIdx < 3 ? 38 : 22; // wide bars when 1 day selected
  const chartW = displayedHours.length * barSlot;
  const W = Math.max(chartW + 70, 750);
  const H = 340;
  const padL = 55;
  const padR = 20;
  const padT = 45;
  const padB = 40;
  const plotH = H - padT - padB;    

  const yForVal = (v: number) => padT + plotH - (Math.min(v, yMax) / yMax) * plotH;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500" />
          <span className="text-sm text-white font-bold tracking-wide">LIVE RAIN TRACKER &bull; {locName}</span>
        </div>
        {lastUpdated && (
          <span className="text-xs text-slate-400 font-medium">
            Updated {fmtICT(lastUpdated)} ICT &bull; auto-refreshes every 5m
          </span>
        )}
      </div>

      {/* Error state */}
      {error && hours.length === 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5">
          <div className="flex items-center gap-2 text-red-300 text-base font-semibold mb-1">
            <AlertTriangle size={20} />
            <span>Precipitation data unavailable</span>
          </div>
          <p className="text-sm text-slate-300">{error}</p>
        </div>
      )}

      {hours.length > 0 && (
        <>
          {/* Big English Summary Banner */}
          <div className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${heroBadgeColor}`}>
            <div>
              <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1.5 border border-current/30">
                {heroBadge}
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white leading-snug">
                {heroHeadline}
              </h2>
              <p className="text-sm text-slate-200/90 font-medium mt-0.5">
                {heroSubline}
              </p>
            </div>
            {peakHour && peakHour.precip > 0.1 && (
              <div className="shrink-0 bg-slate-900/60 rounded-xl px-3.5 py-2 border border-slate-700/60 text-right">
                <span className="text-[11px] uppercase tracking-wider text-amber-300 font-bold block">3-Day Peak</span>
                <span className="text-lg font-black text-amber-400">{uP(peakHour.precip, units)} {uPL(units)}</span>
                <span className="text-xs text-slate-300 block">{fmtICT(new Date(peakHour.time))} ICT</span>
              </div>
            )}
          </div>

          {/* High-Readability Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3.5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Right Now</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-sky-300">{uP(currentPrecip, units)}</span>
                <span className="text-sm font-semibold text-slate-300">{uPL(units)}/h</span>
              </div>
              <div className="text-xs font-semibold text-slate-400 mt-1">{currentProb}% rain probability</div>
            </div>

            <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3.5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Next Rain</div>
              {nextRain ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-sky-300">{uP(nextRain.precip, units)}</span>
                    <span className="text-sm font-semibold text-slate-300">{uPL(units)}/h &bull; {nextRain.prob}%</span>
                  </div>
                  <div className="text-xs font-semibold text-amber-300 mt-1">
                    {fmtICT(new Date(nextRain.time))} ICT ({Math.round((new Date(nextRain.time).getTime() - Date.now()) / 3600000)}h away)
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-1 text-2xl font-black text-emerald-400">Dry</div>
                  <div className="text-xs font-semibold text-slate-400 mt-1">No rain forecasted</div>
                </>
              )}
            </div>

            <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3.5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">3-Day Total</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-sky-300">{uP(totalForecast, units)}</span>
                <span className="text-sm font-semibold text-slate-300">{uPL(units)} total</span>
              </div>
              <div className="text-xs font-semibold text-slate-400 mt-1">
                {totalForecast > 100 ? '⚠️ High flood risk' : 'Normal conditions'}
              </div>
            </div>
          </div>

          {/* Daily Breakdown Pills */}
          <div className="grid grid-cols-3 gap-2">
            {dayGroups.slice(0, 3).map((dg, i) => {
              const sum = dg.hours.reduce((s, h) => s + h.precip, 0);
              const isSelected = selectedDayIdx === i;
              return (
                <button
                  key={dg.dateKey}
                  type="button"
                  onClick={() => setSelectedDayIdx(i)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    isSelected
                      ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm ring-1 ring-sky-400'
                      : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-400">{['Today', 'Tomorrow', 'Day 3'][i]}</div>
                  <div className="text-base sm:text-lg font-black text-sky-300 mt-0.5">{uP(sum, units)} {uPL(units)}</div>
                </button>
              );
            })}
          </div>

          {/* View Toggle Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${viewMode === 'chart' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                📊 Hourly Chart
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${viewMode === 'list' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                📋 Big Text List
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              {['Today', 'Tomo', 'Day 3', 'All 72h'].map((name, idx) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedDayIdx(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    selectedDayIdx === idx ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Large Inspector Readout when a bar is clicked/inspected */}
          {inspectedHour && (
            <div className="rounded-xl border border-sky-500/50 bg-sky-950/40 p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-sky-400" />
                <span className="text-sm font-extrabold text-white">
                  {new Date(inspectedHour.time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {String(inspectedHour.hour).padStart(2, '0')}:00 ICT:
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-black text-sky-300">
                  {uP(inspectedHour.precip, units)} {uPL(units)} ({precipLevel(inspectedHour.precip)})
                </span>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30">
                  {inspectedHour.prob}% probability
                </span>
              </div>
            </div>
          )}

          {/* MODE 1: Large SVG Chart (Locked physical width, never squished) */}
          {viewMode === 'chart' && (
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2 text-xs font-bold text-slate-300">
                <span>Touch or click any column to inspect</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#38bdf8]" /> Light &lt;2.5</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#3b82f6]" /> Mod 2.5-7.5</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#a855f7]" /> Heavy &gt;7.5</span>
                </div>
              </div>

              <div className="overflow-x-auto pb-2">
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  style={{ width: `${W}px`, height: `${H}px` }}
                  className="select-none"
                >
                  {/* Y-Axis Grid Lines & Numbers */}
                  {Array.from({ length: 5 }, (_, i) => {
                    const val = i * tickStep;
                    const y = yForVal(val);
                    return (
                      <g key={i}>
                        <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
                        <text x={padL - 10} y={y + 5} textAnchor="end" className="fill-slate-300 font-bold" style={{ fontSize: 13 }}>
                          {val}
                        </text>
                      </g>
                    );
                  })}
                  <text x={18} y={padT + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padT + plotH / 2})`} className="fill-slate-400 font-bold" style={{ fontSize: 13 }}>
                    {uPL(units)}
                  </text>

                  {/* Hourly Columns */}
                  {displayedHours.map((h, i) => {
                    const barH = h.precip > 0 ? Math.max(3, (h.precip / yMax) * plotH) : 0;
                    const bw = Math.max(8, barSlot * 0.7);
                    const bx = padL + i * barSlot + (barSlot - bw) / 2;
                    const by = padT + plotH - barH;
                    const isInspected = inspectedHour?.time === h.time;
                    const isPeak = i === peakIdx && h.precip > 0.1;

                    return (
                      <g
                        key={i}
                        className="cursor-pointer"
                        onClick={() => setInspectedHour(h)}
                      >
                        {/* Invisible full-height tap target */}
                        <rect x={padL + i * barSlot} y={padT} width={barSlot} height={plotH} fill="transparent" />

                        {/* Highlight column if tapped */}
                        {isInspected && (
                          <rect x={padL + i * barSlot} y={padT} width={barSlot} height={plotH} fill="rgba(56, 189, 248, 0.15)" />
                        )}

                        {/* Rain Bar */}
                        <rect
                          x={bx}
                          y={by}
                          width={bw}
                          height={barH}
                          rx={3}
                          fill={precipBarColor(h.precip)}
                          opacity={h.isPast ? 0.4 : 0.95}
                          stroke={isInspected ? '#38bdf8' : isPeak ? '#fbbf24' : undefined}
                          strokeWidth={isInspected ? 2.5 : isPeak ? 2 : 0}
                        />

                        {/* Rain Probability Badge or Peak */}
                        {isPeak ? (
                          <text x={padL + i * barSlot + barSlot / 2} y={by - 8} textAnchor="middle" fill="#fbbf24" style={{ fontSize: 13, fontWeight: 900 }}>
                            ★ {h.precip.toFixed(1)}
                          </text>
                        ) : h.precip > 0.5 && h.prob > 20 ? (
                          <text x={padL + i * barSlot + barSlot / 2} y={by - 6} textAnchor="middle" fill="#94a3b8" style={{ fontSize: 11, fontWeight: 800 }}>
                            {h.prob}%
                          </text>
                        ) : null}

                        {/* Time labels every 3 or 6 hours */}
                        {(selectedDayIdx < 3 ? h.hour % 3 === 0 : h.hour % 6 === 0) && (
                          <text
                            x={padL + i * barSlot + barSlot / 2}
                            y={H - 12}
                            textAnchor="middle"
                            className="fill-slate-300 font-bold"
                            style={{ fontSize: 13 }}
                          >
                            {String(h.hour).padStart(2, '0')}:00
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* MODE 2: Big Text List View (Maximum readability for eyesight comfort) */}
          {viewMode === 'list' && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                Showing {displayedHours.length} hours &bull; High Contrast Readout
              </div>
              <div className="divide-y divide-slate-800 rounded-2xl border border-slate-700 bg-slate-900/90 overflow-hidden">
                {displayedHours.map((h, i) => {
                  const d = new Date(h.time);
                  const hasRain = h.precip > 0.1;
                  return (
                    <div
                      key={i}
                      onClick={() => setInspectedHour(h)}
                      className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer transition ${
                        inspectedHour?.time === h.time ? 'bg-sky-950/40' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-base sm:text-lg font-black text-white w-14">
                          {String(h.hour).padStart(2, '0')}:00
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-300">
                            {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-xs font-semibold text-slate-400">
                            {h.prob}% rain probability
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-lg sm:text-xl font-black ${hasRain ? 'text-sky-300' : 'text-slate-500'}`}>
                          {uP(h.precip, units)} {uPL(units)}
                        </div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          {precipLevel(h.precip)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="text-xs text-slate-400 font-medium px-1 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            Live Open-Meteo precipitation &bull; hourly resolution &bull; 3-day forecast
          </div>
        </>
      )}
    </div>
  );
}

type SatBand = 'trm' | 'b13'; // trm = True Color (Daylight), b13 = Infrared Clean Window (24/7 Day & Night)
type SatRegion = 'se1' | 'fd_'; // se1 = Southeast Asia (Thailand focus), fd_ = Full Earth Disk

interface SatFrame {
  url: string;
  utcDate: Date;
  labelIct: string;
  minutesAgo: number;
}

function buildHimawariFrames(region: SatRegion, band: SatBand): SatFrame[] {
  // 5 frames going forward in time: 60m ago -> 50m -> 40m -> 30m -> 20m ago
  const intervals = [60, 50, 40, 30, 20];
  return intervals.map((minutesAgo) => {
    const d = new Date(Date.now() - minutesAgo * 60_000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(Math.floor(d.getUTCMinutes() / 10) * 10).padStart(2, '0');
    const url = `https://www.data.jma.go.jp/mscweb/data/himawari/img/${region}/${region}_${band}_${hh}${mm}.jpg`;
    const labelIct = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    return { url, utcDate: d, labelIct, minutesAgo };
  });
}

function proxySource(sat: string): () => Promise<string> {
  return async () => {
    // Built-in proxy first (same-origin, always deployed with the app)…
    try {
      const res = await fetch(`/api/public/satellite?sat=${sat}`);
      if (res.ok) return URL.createObjectURL(await res.blob());
      throw new Error(`satellite proxy: HTTP ${res.status}`);
    } catch {
      // …then fall back to the external Supabase edge function if present.
      const res = await fetch(`${supabaseUrl}/functions/v1/himawari-proxy?sat=${sat}`, {
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
      });
      if (!res.ok) throw new FunctionHttpError('himawari-proxy', res.status);
      return URL.createObjectURL(await res.blob());
    }
  };
}

// Load NOAA imagery straight from its public CDN (no proxy needed for <img>), cache-busted every 10 min.
function directSource(url: string): () => Promise<string> {
  return () =>
    new Promise((resolve, reject) => {
      const src = `${url}?t=${Math.floor(Date.now() / 600_000)}`;
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => reject(new Error(`Direct image failed: ${url}`));
      img.src = src;
    });
}

// Geostationary projection helper: calculates location coordinates across regional and full-disk satellites
function getSatLocationPos(
  satId: string,
  region: SatRegion,
  lat: number,
  lon: number
): { top: string; left: string } | null {
  // 1. Regional crop: Himawari-9 SE Asia (Thailand focus)
  if (satId === 'himawari' && region === 'se1') {
    if (lat >= -8 && lat <= 32 && lon >= 88 && lon <= 118) {
      const top = ((32.1 - lat) / 40.1) * 100;
      const left = ((lon - 85.0) / 28.3) * 100;
      return {
        top: `${Math.max(5, Math.min(95, top)).toFixed(1)}%`,
        left: `${Math.max(5, Math.min(95, left)).toFixed(1)}%`,
      };
    }
    return null;
  }

  // 2. Full-disk geostationary projections (sub-satellite longitudes)
  let subLon: number | null = null;
  if (satId === 'himawari' || satId === 'jma-full') subLon = 140.7;
  else if (satId === 'goes-east') subLon = -75.2;
  else if (satId === 'goes-west') subLon = -137.2;
  else if (satId === 'meteosat') subLon = 0.0;

  if (subLon !== null) {
    const rad = Math.PI / 180;
    const dLon = (lon - subLon) * rad;
    const phi = lat * rad;
    const cosC = Math.cos(phi) * Math.cos(dLon);
    if (cosC > 0.12) {
      const H = 6.61;
      const k = (H - 1) / (H - cosC);
      const x = k * Math.cos(phi) * Math.sin(dLon);
      const y = -k * Math.sin(phi);
      const diskRadius = 45.0; // Disk radius occupies ~45% of image width/height
      return {
        top: `${Math.max(5, Math.min(95, 50 + y * diskRadius)).toFixed(1)}%`,
        left: `${Math.max(5, Math.min(95, 50 + x * diskRadius)).toFixed(1)}%`,
      };
    }
  }
  return null;
}

const SATS_DEF = [
  { id: 'himawari', name: 'Himawari-9 (SE Asia)', subLon: 140.7, mapUrl: 'https://zoom.earth/#view=13.54,99.82,6z/map=satellite', sources: [] },
  { id: 'jma-full', name: 'Japan JMA (Asia Full Disk)', subLon: 140.7, mapUrl: 'https://zoom.earth/#view=36,138,5z/map=satellite', sources: [] },
  { id: 'goes-east', name: 'GOES East (Americas)', subLon: -75.2, mapUrl: 'https://zoom.earth/#view=0,-75,3z/map=satellite', sources: [directSource('https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg'), proxySource('goes-east')] },
  { id: 'goes-west', name: 'GOES West (Pacific)', subLon: -137.2, mapUrl: 'https://zoom.earth/#view=0,-150,3z/map=satellite', sources: [directSource('https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg'), proxySource('goes-west')] },
  {
    id: 'meteosat',
    name: 'Meteosat (Europe / Africa)',
    subLon: 0.0,
    mapUrl: 'https://view.eumetsat.int/productviewer?v=default',
    sources: [],
    unavailable: 'Meteosat direct stream unavailable. Please view via the official EUMETSAT viewer.',
  },
];

function SatelliteTracker({ location }: { location?: GeoLocation | null }) {
  const satLat = location?.latitude ?? 13.54;
  const satLon = location?.longitude ?? 99.82;
  const locName = location?.name ?? 'Ratchaburi';

  const [activeSat, setActiveSat] = useState(0); // default Himawari (index 0)
  const [pendingSat, setPendingSat] = useState<number | null>(null);
  const [band, setBand] = useState<SatBand>('trm'); // True Color vs IR
  const [region, setRegion] = useState<SatRegion>('se1'); // SE Asia vs Full Disk
  const [frameIdx, setFrameIdx] = useState(4); // default latest frame
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Location marker is hidden until clicked
  const [showReticle, setShowReticle] = useState(false);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const currentSat = SATS_DEF[activeSat] ?? SATS_DEF[0]!;
  const isDirectHimawari = activeSat === 0 || activeSat === 1;
  const activeRegion: SatRegion = activeSat === 1 ? 'fd_' : region;

  // Compute location position on current satellite feed
  const locPos = getSatLocationPos(currentSat.id, activeRegion, satLat, satLon);

  // Check coverage dynamically based on coordinates
  const isCovered = locPos !== null;

  // Build animated frames for Himawari
  const frames = buildHimawariFrames(activeRegion, band);
  const activeFrame = frames[frameIdx] ?? frames[frames.length - 1]!;

  // 10-minute auto refresh timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying || !isDirectHimawari) return;
    const interval = setInterval(() => {
      setFrameIdx((curr) => (curr + 1) % frames.length);
    }, 900);
    return () => clearInterval(interval);
  }, [isPlaying, isDirectHimawari, frames.length]);

  // Load external proxy image if non-Himawari satellite is chosen
  useEffect(() => {
    if (isDirectHimawari) {
      setProxyUrl(null);
      setLoadError(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    setImageLoaded(false);
    setLoadError(null);

    const src = currentSat.sources[0];
    if (!src) {
      if (currentSat.unavailable) setLoadError(currentSat.unavailable);
      return;
    }

    src()
      .then((u) => {
        if (!alive) return;
        if (u.startsWith('blob:')) made = u;
        setProxyUrl(u);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setLoadError(e.message);
      });

    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [activeSat, tick, isDirectHimawari, currentSat]);

  const selectSat = (i: number) => {
    const sat = SATS_DEF[i]!;
    const testPos = getSatLocationPos(sat.id, 'fd_', satLat, satLon);
    if (!testPos && sat.id !== 'himawari') {
      setPendingSat(i);
      return;
    }
    setPendingSat(null);
    setActiveSat(i);
    setShowReticle(false); // Reset to hidden on satellite change
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsPlaying(false);
  };

  const handleZoom = (delta: number) => {
    setZoom((z) => {
      const next = Math.max(1, Math.min(2.5, +(z + delta).toFixed(1)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const startDrag = (clientX: number, clientY: number) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  };

  const onDrag = (clientX: number, clientY: number) => {
    if (!isDragging || zoom <= 1) return;
    setPan({
      x: Math.max(-150 * (zoom - 1), Math.min(150 * (zoom - 1), clientX - dragStart.x)),
      y: Math.max(-150 * (zoom - 1), Math.min(150 * (zoom - 1), clientY - dragStart.y)),
    });
  };

  const stopDrag = () => setIsDragging(false);

  return (
    <div className="space-y-3 select-none">
      {/* Satellite Selector Pills */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-800">
        {SATS_DEF.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectSat(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
              activeSat === i && pendingSat === null
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20 ring-1 ring-sky-300'
                : 'bg-slate-800/80 text-slate-300 border border-slate-700/80 hover:bg-slate-700'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Out of Coverage Warning */}
      {pendingSat !== null && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <Info size={16} className="text-amber-300 shrink-0" />
            <span><strong>{SATS_DEF[pendingSat]!.name}</strong> is out of coverage for {locName}.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => selectSat(0)}
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-bold hover:bg-sky-400"
            >
              Switch to Himawari
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSat(pendingSat);
                setPendingSat(null);
                setShowReticle(false);
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs font-semibold hover:bg-slate-600"
            >
              Load anyway
            </button>
          </div>
        </div>
      )}

      {/* Controls Bar: Band, Region, Zoom, and Click-to-Reveal Location */}
      <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-sm">
        {/* Himawari specific toggles */}
        {isDirectHimawari ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* True Color vs IR Band Toggle */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80">
              <button
                type="button"
                onClick={() => setBand('trm')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  band === 'trm' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                ☀️ True Color (Day)
              </button>
              <button
                type="button"
                onClick={() => setBand('b13')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  band === 'b13' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                🌙 Infrared IR (24/7)
              </button>
            </div>

            {/* Area Focus Toggle */}
            {activeSat === 0 && (
              <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80">
                <button
                  type="button"
                  onClick={() => {
                    setRegion('se1');
                    setShowReticle(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    region === 'se1' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🇹🇭 SE Asia Zoom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegion('fd_');
                    setShowReticle(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    region === 'fd_' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🌏 Full Earth Disk
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-300 font-semibold px-1">
            {currentSat.name}
          </div>
        )}

        {/* Universal Zoom and Click-to-Reveal Location Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Location toggle button: hidden by default until clicked */}
          {locPos && (
            <button
              type="button"
              onClick={() => setShowReticle((v) => !v)}
              title={showReticle ? `Hide ${locName} location pin` : `Show ${locName} location pin`}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                showReticle
                  ? 'bg-rose-500/25 text-rose-200 border-rose-400 ring-1 ring-rose-400/50 shadow-sm'
                  : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:text-white hover:border-slate-500'
              }`}
            >
              <span>📍</span>
              <span>{showReticle ? `Hide ${locName}` : `Show ${locName}`}</span>
            </button>
          )}

          {/* Zoom In/Out/Reset */}
          <div className="flex items-center gap-1 bg-slate-900/90 px-1.5 py-1 rounded-xl border border-slate-700/80 text-xs text-slate-300">
            <button
              type="button"
              onClick={() => handleZoom(0.25)}
              disabled={zoom >= 2.5}
              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 font-bold disabled:opacity-40"
            >
              +
            </button>
            <span className="w-10 text-center font-bold text-sky-300">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => handleZoom(-0.25)}
              disabled={zoom <= 1}
              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 font-bold disabled:opacity-40"
            >
              −
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="ml-1 text-[11px] text-amber-300 underline font-semibold"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Satellite Viewport */}
      <div
        className="relative bg-black rounded-2xl overflow-hidden border border-slate-700/80 aspect-[4/3] sm:aspect-video min-h-[380px] sm:min-h-[460px] flex items-center justify-center cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
        onMouseMove={(e) => onDrag(e.clientX, e.clientY)}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={(e) => {
          if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) onDrag(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={stopDrag}
      >
        {/* Loading Spinner */}
        {!imageLoaded && !loadError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xs text-slate-300">
            <Loader2 size={36} className="animate-spin mb-3 text-sky-400" />
            <span className="text-sm font-semibold tracking-wide">Acquiring high-resolution satellite imagery...</span>
            <span className="text-xs text-slate-400 mt-1">Connecting to meteorological satellite feed</span>
          </div>
        )}

        {/* Error Fallback */}
        {loadError ? (
          <div className="p-8 text-center text-slate-300 z-10 max-w-md">
            <Satellite size={44} className="mx-auto mb-3 text-sky-400" />
            <p className="text-base font-bold text-white">Satellite Feed Unavailable</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">{loadError}</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  setLoadError(null);
                  setImageLoaded(false);
                  setTick((t) => t + 1);
                }}
                className="px-4 py-2 rounded-xl bg-slate-700 text-white text-xs font-bold hover:bg-slate-600"
              >
                Retry Feed
              </button>
              <a
                href={currentSat.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-sky-500"
              >
                Open Official Map <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : (
          /* Satellite Image Canvas */
          <div
            className="w-full h-full relative flex items-center justify-center transition-transform duration-75"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'center center',
            }}
          >
            <img
              key={isDirectHimawari ? activeFrame.url : (proxyUrl ?? '')}
              src={isDirectHimawari ? activeFrame.url : (proxyUrl ?? '')}
              alt={`${currentSat.name} Satellite`}
              className={`max-w-full max-h-full object-contain pointer-events-none transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                if (isDirectHimawari && frameIdx > 0) {
                  // If latest frame is not yet generated upstream, step back 1 frame
                  setFrameIdx((idx) => idx - 1);
                } else {
                  setLoadError(`${currentSat.name} stream is temporarily unreachable.`);
                }
              }}
            />

            {/* Target Reticle for active city — rendered only when clicked */}
            {showReticle && imageLoaded && locPos && (
              <div
                className="absolute pointer-events-none z-10 flex flex-col items-center"
                style={{ top: locPos.top, left: locPos.left, transform: 'translate(-50%, -50%)' }}
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border-2 border-rose-500 animate-ping opacity-60 absolute" />
                  <div className="w-5 h-5 rounded-full border-2 border-rose-400 bg-rose-500/20 flex items-center justify-center shadow-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 rounded-md bg-slate-900/90 border border-rose-500/60 text-[10px] font-black text-rose-300 whitespace-nowrap shadow-md">
                  {locName} ({satLat.toFixed(1)}°, {satLon.toFixed(1)}°)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating Capture Timestamp HUD */}
        {imageLoaded && isDirectHimawari && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500" />
            <div className="text-left">
              <div className="text-xs font-black text-white leading-tight">
                {activeFrame.labelIct} ICT
                {frameIdx === frames.length - 1 && (
                  <span className="ml-1.5 text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded border border-emerald-500/30">
                    Latest
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-medium leading-tight">
                Himawari-9 &bull; captured {activeFrame.minutesAgo}m ago
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Animation Player & Frame Scrubber (Himawari Only) */}
      {isDirectHimawari && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
          {/* Play / Step Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-sky-500 text-white hover:bg-sky-400 shadow-md shadow-sky-500/20'
              }`}
            >
              {isPlaying ? '⏸ Pause Loop' : '▶ Play Cloud Loop'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setFrameIdx((idx) => (idx - 1 + frames.length) % frames.length);
              }}
              title="Previous 10m Frame"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700"
            >
              ◀ 10m
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setFrameIdx((idx) => (idx + 1) % frames.length);
              }}
              title="Next 10m Frame"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700"
            >
              10m ▶
            </button>
          </div>

          {/* Time Scrubber Slider */}
          <div className="flex items-center gap-2 w-full sm:max-w-xs">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">{frames[0]?.labelIct}</span>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={frameIdx}
              onChange={(e) => {
                setIsPlaying(false);
                setFrameIdx(Number(e.target.value));
              }}
              className="w-full accent-sky-400 cursor-pointer h-2 bg-slate-700 rounded-lg"
            />
            <span className="text-[11px] font-bold text-emerald-400 shrink-0">{frames[frames.length - 1]?.labelIct}</span>
          </div>
        </div>
      )}

      {/* Footer Info & Quick Radar Cross-Links */}
      <div className="pt-1 flex items-center justify-between gap-2 flex-wrap text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Refreshes every 10 min &bull; JMA Himawari meteorological geostationary feed</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <a
            href="https://weather.tmd.go.th/"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-600/30"
          >
            📡 TMD Doppler Radar (Central) <ExternalLink size={11} />
          </a>
          <a
            href={currentSat.mapUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-sky-500 shadow-sm"
          >
            Open Satellite Map <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}

function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtICT(d: Date): string {
  return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
}

const TILE = 256;
function worldPx(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

function quakeColor(mag: number) {
  if (mag >= 6.0) return { bg: 'bg-red-500', text: 'text-red-300', border: 'border-red-500', ring: 'ring-red-400', label: 'STRONG' };
  if (mag >= 5.0) return { bg: 'bg-orange-500', text: 'text-orange-300', border: 'border-orange-500', ring: 'ring-orange-400', label: 'MODERATE' };
  if (mag >= 4.0) return { bg: 'bg-amber-500', text: 'text-amber-300', border: 'border-amber-500', ring: 'ring-amber-400', label: 'LIGHT' };
  return { bg: 'bg-sky-500', text: 'text-sky-300', border: 'border-sky-500', ring: 'ring-sky-400', label: 'MINOR' };
}

/** Interactive OpenStreetMap tile map with zoom & pin inspector. */
function OsmMiniMap({
  center,
  home,
  radiusKm,
  pins,
  selectedId,
  onPin,
  zoom,
  onZoomChange,
  height = 340,
  showHomeAndRadius = true,
  homeLabel = 'Home',
}: {
  center: { lat: number; lon: number };
  home: { lat: number; lon: number };
  radiusKm: number;
  pins: { id: string; lat: number; lon: number; mag: number; place?: string | undefined }[];
  selectedId: string | null;
  onPin: (id: string) => void;
  zoom: number;
  onZoomChange: (newZoom: number) => void;
  height?: number;
  showHomeAndRadius?: boolean;
  homeLabel?: string;
}) {
  const c = worldPx(center.lat, center.lon, zoom);
  const n = 2 ** zoom;
  const tx0 = Math.floor(c.x / TILE);
  const ty0 = Math.floor(c.y / TILE);
  const tiles: { key: string; x: number; y: number; url: string }[] = [];

  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const ty = ty0 + dy;
      if (ty < 0 || ty >= n) continue;
      const tx = tx0 + dx;
      const wx = ((tx % n) + n) % n;
      tiles.push({
        key: `${tx}-${ty}`,
        x: tx * TILE - c.x,
        y: ty * TILE - c.y,
        url: `https://tile.openstreetmap.org/${zoom}/${wx}/${ty}.png`,
      });
    }
  }

  // Antimeridian-aware projection: wrap longitude into the 360° window
  // centered on the map center so pins near ±180° plot on-screen.
  const pos = (lat: number, lon: number) => {
    const wrappedLon = center.lon + (((lon - center.lon + 540) % 360) - 180);
    const p = worldPx(lat, wrappedLon, zoom);
    return { x: p.x - c.x, y: p.y - c.y };
  };

  const h = pos(home.lat, home.lon);
  const mpp = (156543.03 * Math.cos((home.lat * Math.PI) / 180)) / n;
  const rPx = (radiusKm * 1000) / mpp;
  const at = (p: { x: number; y: number }) => ({ left: `calc(50% + ${p.x}px)`, top: `calc(50% + ${p.y}px)` });

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-md" style={{ height }}>
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{
            ...at(t),
            width: TILE,
            height: TILE,
            filter: 'invert(100%) hue-rotate(190deg) contrast(115%) brightness(78%) saturate(75%)',
          }}
        />
      ))}

      {/* Radius boundary ring (local view only) */}
      {showHomeAndRadius && (
        <div
          className="absolute rounded-full border-2 border-sky-400/80 bg-sky-500/10 pointer-events-none transition-all duration-300"
          style={{ ...at({ x: h.x - rPx, y: h.y - rPx }), width: rPx * 2, height: rPx * 2 }}
        />
      )}

      {/* Home Location Marker (selected city, local view only) */}
      {showHomeAndRadius && (
        <div
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-blue-600 border-2 border-white shadow-lg pointer-events-none z-10"
          style={at(h)}
          title={`${homeLabel} Location`}
        >
          <div className="w-8 h-8 -ml-2 -mt-2 rounded-full bg-blue-500/30 animate-ping pointer-events-none" />
        </div>
      )}

      {/* Earthquake Epicenter Pins */}
      {pins.map((p) => {
        const size = zoom <= 3 ? Math.max(10, Math.min(18, p.mag * 3)) : Math.max(14, Math.min(28, p.mag * 4.5));
        const sel = p.id === selectedId;
        const color = quakeColor(p.mag);

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPin(p.id)}
            title={`M${p.mag} • ${p.place ?? 'Earthquake'}`}
            className={`absolute rounded-full transition-transform cursor-pointer flex items-center justify-center font-black text-[10px] text-white shadow-lg ${
              sel
                ? 'ring-4 ring-white z-20 scale-125 ' + color.bg
                : color.bg + ' border border-white/80 hover:scale-110 z-10'
            }`}
            style={{
              ...at(pos(p.lat, p.lon)),
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
            }}
          >
            {p.mag >= 4.5 ? p.mag.toFixed(1) : ''}
          </button>
        );
      })}

      {/* Map Controls (+ / - / Reset) */}
      <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80 shadow-md">
        <button
          type="button"
          onClick={() => onZoomChange(Math.min(7, zoom + 1))}
          disabled={zoom >= 7}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-base disabled:opacity-40"
          title="Zoom In"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onZoomChange(Math.max(2, zoom - 1))}
          disabled={zoom <= 2}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-base disabled:opacity-40"
          title="Zoom Out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onZoomChange(4)}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px]"
          title="Recenter"
        >
          ⌂
        </button>
      </div>

      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-900/80 text-[9px] text-slate-300">
        &copy; OpenStreetMap contributors
      </div>
    </div>
  );
}

function EarthquakeTracker({ location }: { location: GeoLocation | null }) {
  const [quakes, setQuakes] = useState<EarthquakeFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [qErr, setQErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(1000); // 300km, 1000km, 2000km
  const [minMag, setMinMag] = useState<number>(2.5); // 2.5, 4.0, 5.0
  const [zoom, setZoom] = useState<number>(4);
  const [quakeRegion, setQuakeRegion] = useState<QuakeRegion>('local');

  const lat = location?.latitude ?? 13.9642;
  const lon = location?.longitude ?? 99.9445;
  const locName = location?.name ?? 'Ratchaburi';
  const [center, setCenter] = useState({ lat, lon });
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [qTick, setQTick] = useState(0);

  // 5-minute auto-refresh
  useEffect(() => {
    const t = setInterval(() => setQTick((n) => n + 1), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Recenter map when region, location, or local radius changes
  useEffect(() => {
    if (quakeRegion === 'americas') {
      setCenter({ lat: 22, lon: -95 });
      setZoom(3);
    } else if (quakeRegion === 'global') {
      setCenter({ lat: 15, lon: 10 });
      setZoom(2);
    } else {
      setCenter({ lat, lon });
      if (radiusKm <= 300) setZoom(6);
      else if (radiusKm <= 1000) setZoom(4);
      else setZoom(3);
    }
  }, [lat, lon, radiusKm, quakeRegion]);

  // Fetch earthquakes from USGS API (region-aware)
  useEffect(() => {
    let mounted = true;
    let url: string;
    if (quakeRegion === 'americas') {
      // Bounding box covering North & South America
      url =
        `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
        `&minlatitude=-60&maxlatitude=70&minlongitude=-170&maxlongitude=-30` +
        `&minmagnitude=${Math.max(minMag, 3.5)}&limit=50&orderby=time`;
    } else if (quakeRegion === 'global') {
      // USGS live CDN feed: significant/global quakes, past 24h
      url =
        minMag >= 4.5
          ? 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'
          : 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
    } else {
      url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=${radiusKm}&minmagnitude=${minMag}&limit=30&orderby=time`;
    }

    if (qTick === 0) setLoading(true);
    setQErr(null);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`USGS Seismology: HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!mounted) return;
        setQuakes(d.features || []);
      })
      .catch((e: Error) => {
        if (!mounted) return;
        setQErr(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [lat, lon, radiusKm, minMag, qTick, quakeRegion]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-300">
        <Loader2 size={32} className="animate-spin mb-3 text-sky-400" />
        <span className="text-base font-semibold">Scanning USGS seismic network around {locName}...</span>
      </div>
    );
  }

  // Calculate distances & assess feelable threat to Ratchaburi
  const quakesWithDist = quakes.map((f) => {
    const qLat = f.geometry.coordinates[1];
    const qLon = f.geometry.coordinates[0];
    const depthKm = f.geometry.coordinates[2];
    const dist = Math.round(haversineKm(lat, lon, qLat, qLon));
    const mag = f.properties.mag ?? 0;
    const tsunami = (f.properties as { tsunami?: number }).tsunami === 1;

    // Estimate shaking intensity: close moderate quakes or strong regional quakes
    const isFelt = (mag >= 5.0 && dist <= 500) || (mag >= 6.0 && dist <= 1200) || (mag >= 4.0 && dist <= 150);

    return {
      ...f,
      dist,
      depthKm,
      mag,
      tsunami,
      isFelt,
    };
  });

  const selectedQuake = quakesWithDist.find((q) => q.id === selected);
  const tsunamiEvent = quakesWithDist.find((q) => q.tsunami);
  const highestFelt = quakesWithDist.find((q) => q.isFelt);
  const strongest = [...quakesWithDist].sort((a, b) => b.mag - a.mag)[0];

  const pins = quakesWithDist.map((f) => ({
    id: f.id,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    mag: f.mag,
    place: f.properties.place,
  }));

  const handleSelectPin = (id: string) => {
    setSelected(id);
    const target = quakesWithDist.find((q) => q.id === id);
    if (target) {
      setCenter({ lat: target.geometry.coordinates[1], lon: target.geometry.coordinates[0] });
    }
    rowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="space-y-3.5 select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500" />
          <span className="text-sm text-white font-bold tracking-wide">
            SEISMIC &amp; TSUNAMI MONITOR &bull; {locName.toUpperCase()}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          USGS Live Feed &bull; Auto-refreshes 5m
        </span>
      </div>

      {/* Error Banner */}
      {qErr && (
        <ProxyErrorBanner
          message={qErr}
          mapUrl="https://earthquake.usgs.gov/earthquakes/map/"
          mapLabel="Open USGS Global Map"
        />
      )}

      {/* "Did We Feel It?" Threat Status Hero Banner */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md ${
          tsunamiEvent
            ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
            : highestFelt
            ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
            : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
        }`}
      >
        <div>
          <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1.5 border border-current/30">
            {quakeRegion === 'americas'
              ? '🌎 AMERICAS SEISMIC FEED'
              : quakeRegion === 'global'
              ? '🌍 GLOBAL RING OF FIRE'
              : tsunamiEvent
              ? '🌊 TSUNAMI ADVISORY'
              : highestFelt
              ? '⚠️ NOTICED IN CENTRAL THAILAND'
              : '✅ SEISMICALLY CALM'}
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-white leading-snug">
            {quakeRegion !== 'local'
              ? strongest
                ? `Strongest: M${strongest.mag} ${strongest.properties.place}`
                : 'No significant quakes in the past 24h'
              : tsunamiEvent
              ? `Tsunami Bulletin: M${tsunamiEvent.mag} ${tsunamiEvent.properties.place}`
              : highestFelt
              ? `M${highestFelt.mag} ${highestFelt.properties.place} (${highestFelt.dist} km)`
              : `No Noticeable Earthquakes in ${locName}`}
          </h2>
          <p className="text-sm font-medium text-slate-200/90 mt-0.5">
            {quakeRegion === 'americas'
              ? 'Live USGS feed across North & South America. Tap any pin for the full bulletin.'
              : quakeRegion === 'global'
              ? 'All M2.5+ earthquakes worldwide in the past 24 hours from the USGS global network.'
              : highestFelt
              ? `Tremor may have caused high-rise swaying in Central Thailand. Epicenter ${highestFelt.dist} km away.`
              : strongest
              ? `Nearest recent activity: M${strongest.mag} near ${strongest.properties.place} (${strongest.dist} km away, safe).`
              : `Atmospheric and crustal activity within ${radiusKm} km is completely stable.`}
          </p>
        </div>

        <div className="shrink-0 bg-slate-900/70 rounded-xl px-4 py-2.5 border border-slate-700/60 text-right">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">Detected Events</span>
          <span className={`text-2xl font-black ${quakesWithDist.length > 0 ? 'text-sky-300' : 'text-emerald-400'}`}>
            {quakesWithDist.length}
          </span>
        </div>
      </div>

      {/* Region Tabs */}
      <div className="flex gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 w-fit">
        {([
          { id: 'local' as QuakeRegion, label: `Local ${locName}` },
          { id: 'americas' as QuakeRegion, label: 'Americas (N & S)' },
          { id: 'global' as QuakeRegion, label: 'Global Overview' },
        ]).map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setQuakeRegion(r.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              quakeRegion === r.id ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Scope & Magnitude Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800 shadow-sm">
        {/* Radius Pills (local view only) */}
        {quakeRegion === 'local' && (
          <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
            <span className="text-xs font-bold text-slate-400 px-2">Scope:</span>
            {[
              { id: 300, label: 'Local (300 km)' },
              { id: 1000, label: 'Regional (1,000 km)' },
              { id: 2000, label: 'Wide (2,000 km)' },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRadiusKm(r.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  radiusKm === r.id ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Magnitude Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
          <span className="text-xs font-bold text-slate-400 px-2">Min Mag:</span>
          {[
            { mag: 2.5, label: 'All M2.5+' },
            { mag: 4.0, label: 'M4.0+' },
            { mag: 5.0, label: 'Strong M5.0+' },
          ].map((m) => (
            <button
              key={m.mag}
              type="button"
              onClick={() => setMinMag(m.mag)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                minMag === m.mag ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Map */}
      <OsmMiniMap
        center={center}
        home={{ lat, lon }}
        radiusKm={radiusKm}
        pins={pins}
        selectedId={selected}
        onPin={handleSelectPin}
        zoom={zoom}
        onZoomChange={setZoom}
        showHomeAndRadius={quakeRegion === 'local'}
        homeLabel={locName}
      />

      {/* Selected Quake Inspector Card */}
      {selectedQuake && (
        <div className="rounded-2xl border border-sky-500/50 bg-sky-950/40 p-3.5 flex items-center justify-between flex-wrap gap-2 shadow-md">
          <div className="flex items-center gap-3">
            <div className={`px-2.5 py-1.5 rounded-xl font-black text-sm text-white ${quakeColor(selectedQuake.mag).bg}`}>
              M {selectedQuake.mag.toFixed(1)}
            </div>
            <div>
              <div className="text-sm font-extrabold text-white">{selectedQuake.properties.place}</div>
              <div className="text-xs text-sky-200 font-medium">
                {selectedQuake.dist.toLocaleString()} km from {locName} &bull; {selectedQuake.depthKm} km deep &bull; {fmtAgo(selectedQuake.properties.time ?? 0)}
              </div>
            </div>
          </div>
          <a
            href={`https://earthquake.usgs.gov/earthquakes/eventpage/${selectedQuake.id}`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5"
          >
            Inspect USGS Bulletin <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Empty State */}
      {!qErr && quakesWithDist.length === 0 && (
        <div className="text-center text-slate-400 text-sm py-12 rounded-2xl border border-slate-800 bg-slate-900/60">
          <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-2" />
          <p className="font-bold text-white text-base">No earthquakes detected</p>
          <p className="text-xs text-slate-400 mt-1">
            Zero earthquakes &ge; M{minMag} recorded within {radiusKm.toLocaleString()} km of {locName} in the USGS catalog.
          </p>
        </div>
      )}

      {/* Large-Print Earthquake List */}
      {quakesWithDist.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Recent Seismic Events ({quakesWithDist.length}) &bull; Tap any event to pan map
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {quakesWithDist.map((f) => {
              const sel = selected === f.id;
              const color = quakeColor(f.mag);
              const isShallow = f.depthKm <= 30;

              return (
                <div
                  key={f.id}
                  ref={(el) => {
                    rowRefs.current[f.id] = el;
                  }}
                  onClick={() => handleSelectPin(f.id)}
                  className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between gap-3 shadow-sm ${
                    sel
                      ? 'bg-sky-950/40 border-sky-400'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-black text-white shrink-0 shadow ${color.bg}`}
                    >
                      <span className="text-base leading-none">{f.mag.toFixed(1)}</span>
                      <span className="text-[9px] uppercase tracking-tighter opacity-90">{color.label}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="text-white font-extrabold text-sm sm:text-base truncate">
                        {f.properties.place}
                      </div>
                      <div className="text-slate-400 text-xs font-medium flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-slate-300 font-semibold">{f.dist.toLocaleString()} km from {locName}</span>
                        <span>&bull;</span>
                        <span className={isShallow ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                          {f.depthKm} km depth {isShallow && '(shallow)'}
                        </span>
                        <span>&bull;</span>
                        <span>{fmtAgo(f.properties.time ?? 0)}</span>
                        {f.tsunami && (
                          <span className="text-rose-400 font-bold bg-rose-500/20 px-1.5 py-0.2 rounded border border-rose-500/30 text-[10px]">
                            🌊 Tsunami Watch
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <a
                    href={`https://earthquake.usgs.gov/earthquakes/eventpage/${f.id}`}
                    onClick={(e) => e.stopPropagation()}
                    target="_blank"
                    rel="noreferrer"
                    title="View USGS Bulletin"
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Info & Official TMD Seismology Cross-Bridge */}
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>USGS Global Seismographic Network &bull; Covers Kanchanaburi, Myanmar &amp; Andaman</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <a
            href="https://earthquake.tmd.go.th/"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:text-emerald-300 underline font-semibold"
          >
            TMD Earthquake Division &rarr;
          </a>
          <a
            href="https://earthquake.usgs.gov/earthquakes/map/"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:text-sky-300 underline font-semibold"
          >
            USGS Global Map &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}

type QuakeRegion = 'local' | 'americas' | 'global';

type HurricaneFilter = 'thailand' | 'asia' | 'all';

function getCompassBearing(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  brng = (brng + 360) % 360;
  const dirs = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  return dirs[Math.round(brng / 45) % 8] ?? 'East';
}

function getStormCategoryBadge(category: string, intensityKts: number): { label: string; bg: string; text: string; border: string } {
  const catNum = parseInt(category, 10);
  if (!isNaN(catNum) && catNum >= 4) {
    return { label: `SUPER TYPHOON (CAT ${catNum})`, bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/50' };
  }
  if (!isNaN(catNum) && catNum >= 3) {
    return { label: `MAJOR TYPHOON (CAT ${catNum})`, bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/50' };
  }
  if (!isNaN(catNum) && catNum >= 1) {
    return { label: `TYPHOON (CAT ${catNum})`, bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/50' };
  }
  if (intensityKts >= 34) {
    return { label: 'TROPICAL STORM', bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/50' };
  }
  return { label: 'TROPICAL DEPRESSION', bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/50' };
}

function HurricaneTracker({ location }: { location: GeoLocation | null }) {
  const [storms, setStorms] = useState<TropicalStorm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<HurricaneFilter>('thailand');
  const [, setNowTick] = useState(0);

  const lat = location?.latitude ?? 13.54;
  const lon = location?.longitude ?? 99.82;
  const locName = location?.name ?? 'Ratchaburi';

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const load = () => {
      setError(null);
      fetchTropicalStorms()
        .then((data) => {
          if (mounted) {
            setStorms(data);
            setFetchedAt(Date.now());
          }
        })
        .catch((e: Error) => {
          if (mounted) {
            setError(e.message);
            setStorms([]);
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };
    load();
    const t = setInterval(() => setNowTick((n) => n + 1), 30000);
    const r = setInterval(load, 5 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(t);
      clearInterval(r);
    };
  }, []);

  const stormsWithDistance = storms
    .map((s) => ({
      ...s,
      distanceKm: haversineKm(lat, lon, s.latitude, s.longitude),
      bearing: getCompassBearing(lat, lon, s.latitude, s.longitude),
      speedKmh: Math.round(s.intensityMph * 1.60934),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  // Storm classification relative to Thailand
  const nearestStorm = stormsWithDistance[0];
  const stormsUnder1500km = stormsWithDistance.filter((s) => s.distanceKm <= 1500);
  const stormsUnder2500km = stormsWithDistance.filter((s) => s.distanceKm <= 2500);

  const filteredStorms =
    filter === 'thailand'
      ? stormsUnder2500km
      : filter === 'asia'
      ? stormsWithDistance.filter((s) => s.basin === 'Western Pacific' || s.basin === 'Indian Ocean')
      : stormsWithDistance;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-400 animate-pulse shadow-sm shadow-sky-500" />
          <span className="text-sm text-white font-bold tracking-wide">
            HURRICANE &amp; TYPHOON RADAR &bull; {locName}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          {loading ? 'Refreshing...' : `${storms.length} active globally${fetchedAt ? ` • Updated ${fmtAgo(fetchedAt)}` : ''}`}
        </span>
      </div>

      {/* Error Banner */}
      {error && !loading && (
        <ProxyErrorBanner message={error} mapUrl="https://zoom.earth/storms/" mapLabel="Open Live Storm Map" />
      )}

      {/* Status Hero Banner */}
      {!loading && !error && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md ${
            stormsUnder1500km.length > 0
              ? 'bg-red-500/15 border-red-500/50 text-red-200'
              : stormsUnder2500km.length > 0
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <div>
            <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1.5 border border-current/30">
              {stormsUnder1500km.length > 0
                ? '⚠️ DIRECT MONSOON THREAT'
                : stormsUnder2500km.length > 0
                ? '⚡ REGIONAL ADVISORY'
                : '✅ ALL CLEAR — THAILAND'}
            </div>
            <h2 className="text-lg sm:text-2xl font-black text-white leading-snug">
              {stormsUnder1500km.length > 0
                ? `Active System: ${stormsUnder1500km[0]?.name} (${Math.round(stormsUnder1500km[0]?.distanceKm ?? 0).toLocaleString()} km)`
                : stormsUnder2500km.length > 0
                ? `Tropical System Developing in ${stormsUnder2500km[0]?.basin}`
                : `No Tropical Cyclones Threatening Thailand`}
            </h2>
            <p className="text-sm font-medium text-slate-200/90 mt-0.5">
              {nearestStorm
                ? `Nearest system is ${nearestStorm.name} (${Math.round(nearestStorm.distanceKm).toLocaleString()} km ${nearestStorm.bearing} of ${locName} in ${nearestStorm.basin}).`
                : `Atmospheric circulation over the Gulf of Thailand and Andaman Sea is calm with zero active storms.`}
            </p>
          </div>

          <div className="shrink-0 bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-700/60 text-right">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">Nearest Storm</span>
            <span className={`text-2xl font-black ${stormsUnder2500km.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {nearestStorm ? `${Math.round(nearestStorm.distanceKm).toLocaleString()} km` : 'None'}
            </span>
          </div>
        </div>
      )}

      {/* Basin & Distance Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80">
          <button
            type="button"
            onClick={() => setFilter('thailand')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filter === 'thailand'
                ? 'bg-sky-500 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🇹🇭 Thailand Watch ({stormsUnder2500km.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('asia')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filter === 'asia'
                ? 'bg-sky-500 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🌏 Western Pacific &amp; Asia
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filter === 'all'
                ? 'bg-sky-500 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🌐 All Global ({storms.length})
          </button>
        </div>

        <span className="text-xs text-slate-400">
          Showing <strong className="text-white">{filteredStorms.length}</strong> storm{filteredStorms.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Loading Spinner */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
          <Loader2 size={32} className="animate-spin mb-3 text-sky-400" />
          <span className="text-base font-semibold">Tracking global tropical storms &amp; typhoons...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredStorms.length === 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-850/60 p-8 text-center space-y-2">
          <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
          <h3 className="text-lg font-bold text-white">No Active Storms in this Basin</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {filter === 'thailand'
              ? `No tropical depressions or typhoons detected within 2,500 km of ${locName}. Try selecting "Western Pacific & Asia" or "All Global".`
              : 'Zero active tropical cyclones reported by the National Hurricane Center and Joint Typhoon Warning Center.'}
          </p>
        </div>
      )}

      {/* Storm Cards List */}
      {!loading && !error && filteredStorms.length > 0 && (
        <div className="space-y-3">
          {filteredStorms.map((s) => (
            <StormCard key={s.id} storm={s} locName={locName} />
          ))}
        </div>
      )}

      {/* Atlantic & Pacific Outlook Collapsible (NHC Satellite Products) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <details className="rounded-xl overflow-hidden border border-slate-700 bg-slate-800/60">
          <summary className="p-3 bg-slate-800 text-xs text-slate-200 font-bold cursor-pointer hover:bg-slate-750 flex items-center justify-between">
            <span>Atlantic Basin &bull; 7-Day NHC Outlook</span>
            <span className="text-[11px] text-slate-400 font-normal">Out of coverage for Thailand</span>
          </summary>
          <img
            src="https://www.nhc.noaa.gov/xgtwo/two_atl_0d0.png"
            alt="Atlantic Tropical Outlook"
            loading="lazy"
            className="w-full h-[220px] object-contain bg-slate-900"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </details>

        <details className="rounded-xl overflow-hidden border border-slate-700 bg-slate-800/60">
          <summary className="p-3 bg-slate-800 text-xs text-slate-200 font-bold cursor-pointer hover:bg-slate-750 flex items-center justify-between">
            <span>East Pacific Basin &bull; 7-Day NHC Outlook</span>
            <span className="text-[11px] text-slate-400 font-normal">Out of coverage for Thailand</span>
          </summary>
          <img
            src="https://www.nhc.noaa.gov/xgtwo/two_pac_0d0.png"
            alt="Pacific Tropical Outlook"
            loading="lazy"
            className="w-full h-[220px] object-contain bg-slate-900"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </details>
      </div>

      {/* Footer Info & Official Early Warning Links */}
      <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live data via NOAA ATCF &amp; JTWC &bull; storm positions refresh every 5 min</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <a
            href="https://www.metoc.navy.mil/jtwc/jtwc.html"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:text-sky-300 underline font-semibold flex items-center gap-1"
          >
            JTWC Advisories <ExternalLink size={11} />
          </a>
          <span className="text-slate-600">&bull;</span>
          <a
            href={`https://www.windy.com/?hurricaneTracker,${lat},${lon},5`}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:text-sky-300 underline font-semibold flex items-center gap-1"
          >
            Open Windy Cyclone Map <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}

function StormCard({
  storm,
  locName,
}: {
  storm: TropicalStorm & { distanceKm: number; bearing: string; speedKmh: number };
  locName: string;
}) {
  const { units } = useSettings();
  const badge = getStormCategoryBadge(storm.category, storm.intensityKts);
  const isClose = storm.distanceKm <= 2000;

  return (
    <div
      className={`rounded-2xl border p-4 transition shadow-sm ${
        isClose
          ? 'bg-slate-800/90 border-amber-500/40 hover:border-amber-400/60'
          : 'bg-slate-800/70 border-slate-700 hover:border-slate-600'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Storm Name and Category */}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0 text-sky-400 shadow-sm mt-0.5">
            <Wind size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg sm:text-xl font-black text-white">{storm.name}</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${badge.bg} ${badge.text} ${badge.border}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Basin: <strong className="text-slate-200">{storm.basin}</strong> &bull; System: <span className="text-slate-300">{storm.type}</span> &bull; Coordinates: {storm.latitude.toFixed(1)}°N, {storm.longitude.toFixed(1)}°E
            </p>
          </div>
        </div>

        {/* Right: Wind Speed in km/h */}
        <div className="sm:text-right bg-slate-900/60 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border border-slate-700/40 sm:border-0 flex sm:flex-col justify-between items-center sm:items-end">
          <div>
            <div className="text-2xl sm:text-3xl font-black text-white leading-tight">
              {uW(storm.speedKmh, units)} <span className="text-sm font-semibold text-sky-400">{uWL(units)}</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              {storm.intensityKts} knots &bull; {storm.intensityMph} mph
            </div>
          </div>
        </div>
      </div>

      {/* Info Pill Badges: Distance from Ratchaburi, Pressure, Movement */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700/60 text-xs">
        <div className="rounded-xl bg-slate-900/80 border border-slate-700/80 p-2.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Distance from {locName}</span>
          <span className={`text-sm font-extrabold ${isClose ? 'text-amber-300' : 'text-white'}`}>
            {uD(storm.distanceKm, units)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">{storm.bearing}</span>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-700/80 p-2.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Central Pressure</span>
          <span className="text-sm font-extrabold text-white">
            {storm.pressureMb > 0 ? (units === 'us' ? `${hpaToInhg(storm.pressureMb).toFixed(2)} inHg` : `${storm.pressureMb} hPa`) : 'Unknown'}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {storm.pressureMb > 0 && storm.pressureMb < 960 ? 'Deep Low (Intense)' : 'Barometric MSLP'}
          </span>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl bg-slate-900/80 border border-slate-700/80 p-2.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Track &amp; Movement</span>
          <span className="text-sm font-extrabold text-white">
            {storm.movement ? storm.movement : 'Stationary'}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {storm.speedMph > 0 ? `Speed: ${units === 'us' ? Math.round(storm.speedMph) : Math.round(storm.speedMph * 1.60934)} ${uWL(units)}` : 'Slow drift'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LIGHTNING TRACKER (Live Blitzortung Stream + OpenStreetMap Real Land & Roads)
// ============================================================================

interface RawStrike {
  lat: number;
  lon: number;
  time: number;
}

type LightningRegionId = 'nearby' | 'asia' | 'europe' | 'americas' | 'global';

interface RegionConfig {
  id: LightningRegionId;
  label: string;
  center: { lat: number; lon: number };
  zoom: number;
  bbox?: { minLon: number; maxLon: number; minLat: number; maxLat: number };
}

const LIGHTNING_REGIONS: RegionConfig[] = [
  { id: 'nearby', label: 'Nearby (50 km)', center: { lat: 13.54, lon: 99.82 }, zoom: 10 },
  { id: 'asia', label: 'Southeast Asia', center: { lat: 13.5, lon: 104.0 }, zoom: 5, bbox: { minLon: 90, maxLon: 125, minLat: -10, maxLat: 25 } },
  { id: 'europe', label: 'Europe', center: { lat: 50.0, lon: 12.0 }, zoom: 4, bbox: { minLon: -15, maxLon: 40, minLat: 35, maxLat: 70 } },
  { id: 'americas', label: 'Americas', center: { lat: 15.0, lon: -80.0 }, zoom: 3, bbox: { minLon: -130, maxLon: -30, minLat: -55, maxLat: 55 } },
  { id: 'global', label: 'Global', center: { lat: 20.0, lon: 0.0 }, zoom: 2, bbox: { minLon: -180, maxLon: 180, minLat: -80, maxLat: 80 } },
];

function decodeBlitzPayload(text: string): string {
  const d = Array.from(text);
  if (d.length === 0) return '';
  const e = new Map<number, string>();
  let c: string = d[0]!;
  let f: string = c;
  const g: string[] = [c];
  let h = 256;
  let o = h;
  for (let i = 1; i < d.length; i++) {
    const ch = d[i]!;
    const code = ch.charCodeAt(0);
    const a: string = code < h ? ch : (e.has(code) ? e.get(code)! : f + c);
    g.push(a);
    c = a.charAt(0);
    e.set(o, f + c);
    o++;
    f = a;
  }
  return g.join('');
}

function LightningTracker({ userLat, userLon, locName = 'Here' }: { userLat: number; userLon: number; locName?: string }) {
  const [region, setRegion] = useState<LightningRegionId>('nearby');
  const [strikes, setStrikes] = useState<RawStrike[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const strikesBufferRef = useRef<RawStrike[]>([]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isMounted = true;
    const servers = ['wss://ws1.blitzortung.org', 'wss://ws7.blitzortung.org', 'wss://ws8.blitzortung.org'];
    let srvIdx = 0;

    function connect() {
      if (!isMounted) return;
      try {
        const srvUrl = servers[srvIdx % servers.length]!;
        ws = new WebSocket(srvUrl);
        ws.onopen = () => {
          if (!isMounted) return;
          setConnected(true);
          try { ws?.send(JSON.stringify({ a: 111 })); } catch {}
        };
        ws.onmessage = (evt) => {
          if (!isMounted) return;
          try {
            const raw = typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data);
            const decoded = decodeBlitzPayload(raw);
            const data = JSON.parse(decoded);
            if (typeof data.lat === 'number' && typeof data.lon === 'number') {
              const strikeTime = typeof data.time === 'number'
                ? (data.time > 10_000_000_000 ? Math.floor(data.time / 1_000_000) : data.time)
                : Date.now();
              const strike: RawStrike = { lat: data.lat, lon: data.lon, time: strikeTime };
              const cutoff = Date.now() - 15 * 60 * 1000;
              strikesBufferRef.current = [strike, ...strikesBufferRef.current.filter((s) => s.time > cutoff)].slice(0, 1500);
              setLastUpdated(new Date());
            }
          } catch {}
        };
        ws.onerror = () => { setConnected(false); };
        ws.onclose = () => {
          setConnected(false);
          srvIdx++;
          if (isMounted) reconnectTimer = setTimeout(connect, 4000);
        };
      } catch {
        setConnected(false);
        srvIdx++;
        if (isMounted) reconnectTimer = setTimeout(connect, 5000);
      }
    }

    connect();
    const flushInterval = setInterval(() => {
      if (!isMounted) return;
      setStrikes([...strikesBufferRef.current]);
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(flushInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch {}
    };
  }, []);

  const activeConfig = useMemo(() => {
    const found = LIGHTNING_REGIONS.find((r) => r.id === region);
    if (found && region === 'nearby') {
      return { ...found, center: { lat: userLat, lon: userLon } };
    }
    return (found ?? LIGHTNING_REGIONS[0]) as NonNullable<typeof found>;
  }, [region, userLat, userLon]);

  const regionalStrikes = useMemo(() => {
    const now = Date.now();
    if (region === 'nearby') {
      return strikes
        .map((s) => {
          const dist = haversineKm(userLat, userLon, s.lat, s.lon);
          const ageSec = Math.max(0, Math.round((now - s.time) / 1000));
          return { ...s, dist, ageSec };
        })
        .filter((s) => s.dist <= 55)
        .sort((a, b) => a.dist - b.dist);
    }
    const bbox = activeConfig.bbox;
    if (!bbox) return [];
    return strikes
      .filter((s) => s.lon >= bbox.minLon && s.lon <= bbox.maxLon && s.lat >= bbox.minLat && s.lat <= bbox.maxLat)
      .map((s) => {
        const dist = haversineKm(userLat, userLon, s.lat, s.lon);
        const ageSec = Math.max(0, Math.round((now - s.time) / 1000));
        return { ...s, dist, ageSec };
      });
  }, [strikes, region, activeConfig, userLat, userLon]);

  const closestStrike = useMemo(() => {
    if (region === 'nearby') return regionalStrikes[0] || null;
    const sorted = [...regionalStrikes].sort((a, b) => a.dist - b.dist);
    return sorted[0] || null;
  }, [regionalStrikes, region]);

  const isDanger = region === 'nearby' && closestStrike && closestStrike.dist <= 15;
  const isWarning = region === 'nearby' && closestStrike && closestStrike.dist > 15 && closestStrike.dist <= 35;

  // OpenStreetMap Tile Calculation (reusing global TILE and worldPx)
  const zoom = activeConfig.zoom;
  const n = 2 ** zoom;
  const centerPx = worldPx(activeConfig.center.lat, activeConfig.center.lon, zoom);
  const tx0 = Math.floor(centerPx.x / TILE);
  const ty0 = Math.floor(centerPx.y / TILE);
  const tiles: { key: string; x: number; y: number; url: string }[] = [];

  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const ty = ty0 + dy;
      if (ty < 0 || ty >= n) continue;
      const tx = tx0 + dx;
      const wx = ((tx % n) + n) % n;
      tiles.push({
        key: `${tx}-${ty}`,
        x: tx * TILE - centerPx.x,
        y: ty * TILE - centerPx.y,
        url: `https://tile.openstreetmap.org/${zoom}/${wx}/${ty}.png`,
      });
    }
  }

  // Antimeridian-aware projection: wrap longitude into the 360° window
  // centered on the active region so strikes near ±180° plot on-screen.
  const strikePos = (lat: number, lon: number) => {
    const cLon = activeConfig.center.lon;
    const wrappedLon = cLon + (((lon - cLon + 540) % 360) - 180);
    const p = worldPx(lat, wrappedLon, zoom);
    return { x: p.x - centerPx.x, y: p.y - centerPx.y };
  };
  const isBroadView = zoom <= 3;

  const userPoint = strikePos(userLat, userLon);
  const mpp = (156543.03 * Math.cos((userLat * Math.PI) / 180)) / n;
const REGION_DOTS: Record<string, {name:string; lat:number; lon:number}[]> = {
americas: [{name:'Great Plains',lat:38,lon:-98},{name:'Gulf',lat:25,lon:-90},{name:'Amazon',lat:-5,lon:-62},{name:'Andes',lat:-20,lon:-68}],
global: [{name:'Congo',lat:0,lon:22},{name:'Amazon',lat:-5,lon:-62},{name:'Java Sea',lat:-5,lon:112}],
};
  return (
    <div className="space-y-4">
      {region === 'nearby' ? (
        isDanger ? (
          <div className="p-4 rounded-xl border border-red-500/40 bg-red-950/40 backdrop-blur">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-base font-extrabold text-red-300 uppercase tracking-wider">
                Immediate Lightning Threat — Seek Shelter!
              </span>
            </div>
            <p className="text-sm font-semibold text-red-100">
              Strike detected <span className="font-extrabold text-white text-base">{closestStrike!.dist.toFixed(1)} km</span> away ({Math.round(closestStrike!.ageSec / 60)}m ago). Thunder delay is ~{Math.round(closestStrike!.dist * 3)}s. Stay indoors!
            </p>
          </div>
        ) : isWarning ? (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-950/30 backdrop-blur">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
              <span className="text-base font-extrabold text-amber-300 uppercase tracking-wider">
                Thunderstorm Approaching
              </span>
            </div>
            <p className="text-sm text-amber-100">
              Lightning detected {closestStrike!.dist.toFixed(1)} km away. Thunderstorms are in the 30 km watch zone.
            </p>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              <div>
                <span className="text-sm font-bold text-emerald-300 uppercase tracking-wide block">
                  All Clear — Zero Local Strikes
                </span>
                <span className="text-xs text-slate-400">
                  Atmosphere is electrically stable within 50 km of {locName}. Radar is actively monitoring.
                </span>
              </div>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-200 border border-emerald-700/40 shrink-0">
              Safe Outdoors
            </span>
          </div>
        )
      ) : (
        <div className="p-3.5 rounded-xl border border-slate-700 bg-slate-900/60 backdrop-blur flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-white uppercase tracking-wide block">
              {activeConfig.label} {region === 'americas' ? '• Tornado Alley / ITCZ' : region === 'global' ? '• Congo / Amazon / Asia Chimneys' : 'Storm Activity'}
            </span>
            <span className="text-xs text-slate-400">
              {`${regionalStrikes.length} strikes/15m in ${activeConfig.label}`}
            </span>
            <span className="text-[11px] text-slate-400 block mt-1">
{region === 'americas'
? `N.Am ${regionalStrikes.filter(s=>s.lat>=23.5).length} • Tropics ${regionalStrikes.filter(s=>s.lat>-23.5&&s.lat<23.5).length} • S.Am ${regionalStrikes.filter(s=>s.lat<=-23.5).length}`
: `Am ${regionalStrikes.filter(s=>s.lon>=-130&&s.lon<=-30).length} • EU/AF ${regionalStrikes.filter(s=>s.lon>-30&&s.lon<=60).length} • AP ${regionalStrikes.filter(s=>s.lon>60||s.lon<-130).length}`}
</span>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-sky-950 text-sky-300 border border-sky-800 shrink-0 font-bold">
            {regionalStrikes.length} strikes
          </span>
        </div>
      )}          
      {/* Region Selector Pills & LIVE Status */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
        <div className="flex gap-1">
          {LIGHTNING_REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                region === r.id
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 shrink-0 px-2 py-1 rounded bg-slate-900/60 border border-slate-800">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
          {connected ? 'LIVE Stream' : 'Connecting...'}
        </span>
      </div>

      {/* Real OpenStreetMap Viewport */}
      <div className="relative w-full h-[360px] sm:h-[420px] rounded-2xl overflow-hidden border border-slate-700 bg-slate-900 shadow-inner">
        {/* OpenStreetMap Tiles */}
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            className="absolute max-w-none select-none"
            style={{
              left: `calc(50% + ${t.x}px)`,
              top: `calc(50% + ${t.y}px)`,
              width: TILE,
              height: TILE,
              filter: 'invert(100%) hue-rotate(190deg) contrast(115%) brightness(78%) saturate(75%)',
            }}
          />
        ))}

        {/* Nearby Safety Range Rings on OpenStreetMap */}
        {region === 'nearby' && (
          <>
            {[
              { km: 5, color: 'border-red-500 bg-red-500/10', label: '5 km Danger' },
              { km: 15, color: 'border-amber-400 bg-amber-400/10', label: '15 km Warning' },
              { km: 30, color: 'border-sky-400 bg-sky-400/5', label: '30 km Watch' },
              { km: 50, color: 'border-slate-500/60 bg-slate-500/5', label: '50 km Range' },
            ].map((ring) => {
              const rPx = (ring.km * 1000) / mpp;
              return (
                <div
                  key={ring.km}
                  className={`absolute rounded-full border-2 pointer-events-none transition-all ${ring.color}`}
                  style={{
                    left: `calc(50% + ${userPoint.x - rPx}px)`,
                    top: `calc(50% + ${userPoint.y - rPx}px)`,
                    width: rPx * 2,
                    height: rPx * 2,
                  }}
                >
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-900/80 text-white shadow">
                    {ring.label}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {/* User Pin (local & Asia views only) */}
        {(region === 'nearby' || region === 'asia') && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-blue-600 border-2 border-white shadow-xl pointer-events-none z-20 flex items-center justify-center"
            style={{
              left: `calc(50% + ${userPoint.x}px)`,
              top: `calc(50% + ${userPoint.y}px)`,
            }}
            title={`${locName} (Center)`}
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/30 animate-ping pointer-events-none" />
            <span className="absolute left-6 whitespace-nowrap text-xs font-black px-1.5 py-0.5 rounded bg-blue-950/90 text-blue-200 border border-blue-500/50 shadow">
              {locName}
            </span>
          </div>
        )}
        {(REGION_DOTS[region]||[]).map(d=>{const pt=strikePos(d.lat,d.lon);return <div key={d.name} className="absolute z-10 pointer-events-none px-1.5 py-0.5 rounded bg-slate-900/85 border border-slate-600 text-[10px] font-bold text-slate-200" style={{left:`calc(50% + ${pt.x}px)`,top:`calc(50% + ${pt.y}px)`,transform:'translate(-50%,-130%)'}}>{d.name}</div>})}
        {/* Live Strike Flashes over Map */}
        {regionalStrikes.map((s, idx) => {
          const pt = strikePos(s.lat, s.lon);
          let bgCol = 'bg-purple-500 border-purple-200';
          // Zoom-scaled dots: smaller on broad Americas/Global views
          let size = isBroadView ? 'w-1.5 h-1.5 -ml-0.75 -mt-0.75' : 'w-3 h-3 -ml-1.5 -mt-1.5';
          if (s.ageSec < 60) {
            bgCol = 'bg-white border-yellow-300 ring-4 ring-yellow-400/60 animate-pulse';
            size = isBroadView ? 'w-2.5 h-2.5 -ml-1.25 -mt-1.25' : 'w-4 h-4 -ml-2 -mt-2';
          } else if (s.ageSec < 300) {
            bgCol = 'bg-amber-400 border-amber-100 ring-2 ring-amber-400/40';
            size = isBroadView ? 'w-2 h-2 -ml-1 -mt-1' : 'w-3.5 h-3.5 -ml-1.75 -mt-1.75';
          } else if (s.ageSec < 600) {
            bgCol = 'bg-orange-500 border-orange-200';
          }

          return (
            <div
              key={`${s.lat}-${s.lon}-${s.time}-${idx}`}
              className={`absolute rounded-full border shadow-lg z-10 transition-transform ${bgCol} ${size}`}
              style={{
                left: `calc(50% + ${pt.x}px)`,
                top: `calc(50% + ${pt.y}px)`,
              }}
              title={`Strike: ${s.dist.toFixed(1)} km away (${s.ageSec < 60 ? `${s.ageSec}s ago` : `${Math.round(s.ageSec / 60)}m ago`})`}
            />
          );
        })}

        {/* Legend Overlay Bar */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-700 text-[11px] text-slate-200 z-30 shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-yellow-300"></span> &lt;1m
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span> 1–5m
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500"></span> 5–10m
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500"></span> &gt;10m
            </span>
          </div>
          <span className="text-slate-400 text-[10px]">OpenStreetMap • {fmtICT(lastUpdated)}</span>
        </div>
      </div>

      {/* Safety Guideline & External Bridges */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
        <span>30-30 Rule: If thunder sounds &lt;30s after flash, seek shelter immediately.</span>
        <div className="flex items-center gap-3">
          <a
            href="https://www.lightningmaps.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:underline flex items-center gap-1"
          >
            LightningMaps.org <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://weather.tmd.go.th/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:underline flex items-center gap-1"
          >
            TMD Doppler Radar <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MODAL WRAPPER & TAB COMMAND CENTER
// ==========================================

type MainTabId = 'storm' | 'satellite' | 'emergency';
type StormSubTab = 'precip' | 'lightning';
type EmergencySubTab = 'warnings' | 'hurricane' | 'earthquake';

export function LiveTrackersModal({
  open,
  onClose,
  location,
  hourly,
}: {
  open: boolean;
  onClose: () => void;
  location: GeoLocation | null;
  hourly: HourlyForecast | null;
}) {
  const [mainTab, setMainTab] = useState<MainTabId>('storm');
  const [stormSub, setStormSub] = useState<StormSubTab>('precip');
  const [emergencySub, setEmergencySub] = useState<EmergencySubTab>('warnings');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h2 className="text-white font-black text-sm tracking-wide">
                Live Trackers &amp; Threat Center
              </h2>
              <p className="text-[11px] text-slate-400">
                {location?.name ?? 'Ratchaburi'} &bull; {(location?.latitude ?? 13.54).toFixed(2)}°N, {(location?.longitude ?? 99.82).toFixed(2)}°E
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. Primary 3-Tab Command Bar */}
        <div className="grid grid-cols-3 gap-1.5 p-2 sm:px-6 sm:py-3 bg-slate-950/40 border-b border-slate-800 shrink-0">
          <button
            onClick={() => setMainTab('storm')}
            className={`py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
              mainTab === 'storm'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25 border border-sky-400'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
            }`}
          >
            <span>🌧️</span>
            <span className="truncate">Storm &amp; Rain</span>
          </button>

          <button
            onClick={() => setMainTab('satellite')}
            className={`py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
              mainTab === 'satellite'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25 border border-sky-400'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
            }`}
          >
            <span>🛰️</span>
            <span className="truncate">Satellite</span>
          </button>

          <button
            onClick={() => setMainTab('emergency')}
            className={`py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
              mainTab === 'emergency'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 border border-amber-400'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
            }`}
          >
            <span>🚨</span>
            <span className="truncate">Hazards &amp; Threats</span>
          </button>
        </div>

        {/* 2. Context Sub-Pills Bar */}
        {mainTab === 'storm' && (
          <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-slate-900 border-b border-slate-800/80 shrink-0 overflow-x-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
              View:
            </span>
            <div className="flex gap-1.5 whitespace-nowrap">
              <button
                onClick={() => setStormSub('precip')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  stormSub === 'precip'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                📊 Rain Forecast (72h)
              </button>
              <button
                onClick={() => setStormSub('lightning')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  stormSub === 'lightning'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚡ Live Lightning Radar
              </button>
            </div>
          </div>
        )}

        {mainTab === 'emergency' && (
          <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-slate-900 border-b border-slate-800/80 shrink-0 overflow-x-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
              Hazards:
            </span>
            <div className="flex gap-1.5 whitespace-nowrap">
              <button
                onClick={() => setEmergencySub('warnings')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  emergencySub === 'warnings'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚠️ Severe Warnings
              </button>
              <button
                onClick={() => setEmergencySub('hurricane')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  emergencySub === 'hurricane'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🌀 Typhoons &amp; Storms
              </button>
              <button
                onClick={() => setEmergencySub('earthquake')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  emergencySub === 'earthquake'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🌍 Earthquakes (USGS)
              </button>
            </div>
          </div>
        )}

        {/* 3. Modal Content Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/20">
          {mainTab === 'storm' && (
            <>
              {stormSub === 'precip' && <PrecipitationTracker location={location} />}
              {stormSub === 'lightning' && (
                <LightningTracker
                  userLat={location?.latitude ?? 13.54}
                  userLon={location?.longitude ?? 99.82}
                  locName={location?.name ?? 'Ratchaburi'}
                />
              )}
            </>
          )}

          {mainTab === 'satellite' && <SatelliteTracker location={location} />}

          {mainTab === 'emergency' && (
            <>
              {emergencySub === 'warnings' && <WarningsTracker location={location} />}
              {emergencySub === 'hurricane' && <HurricaneTracker location={location} />}
              {emergencySub === 'earthquake' && <EarthquakeTracker location={location} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
