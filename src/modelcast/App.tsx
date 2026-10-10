// @ts-nocheck -- imported Bolt code, written for a looser TS config
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { CloudSun, Loader2, AlertTriangle, Globe2, Navigation, Check, RefreshCw } from 'lucide-react';
import { SearchBar } from '@/modelcast/components/SearchBar';
import { CurrentWeatherCard } from '@/modelcast/components/CurrentWeatherCard';
import { TopModelForecast } from '@/modelcast/components/TopModelForecast';
import { WeatherModelsLiveModal } from '@/modelcast/components/WeatherModelsLiveModal';
import { LiveTrackersModal } from '@/modelcast/components/LiveTrackersModal';
import { WeatherLogs } from '@/modelcast/components/WeatherLogs';
import { SettingsBar } from '@/modelcast/components/SettingsBar';
import { HeaderMenu } from '@/modelcast/components/HeaderMenu';
import { SettingsProvider, useSettings } from '@/modelcast/lib/settings';
import { DayNightSummary } from '@/modelcast/components/DayNightSummary';
import { WeatherTickers } from '@/modelcast/components/WeatherTickers';
import type {
  CurrentWeather,
  DailyForecast,
  GeoLocation,
  HourlyForecast,
  ModelAccuracy,
  VoteAggregate,
  WeatherModel,
} from '@/modelcast/lib/types';
import {
  fetchCurrentWeather,
  fetchDailyForecast,
  fetchHourlyForecast,
} from '@/modelcast/lib/weatherApi';
import { supabase } from '@/modelcast/lib/supabase';
import { WEATHER_MODELS } from '@/modelcast/lib/weatherModels';
import { testModelAccuracy } from '@/modelcast/lib/accuracyApi';
import { useFavorites } from '@/modelcast/lib/useFavorites';
import { FavoritePlaces } from '@/modelcast/components/FavoritePlaces';

const LAST_LOCATION_KEY = 'modelcast:last-location';

function getLocationFromUrl(): GeoLocation | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const lat = Number(p.get('lat'));
    const lon = Number(p.get('lon'));
    const city = p.get('city');
    if (!city || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      id: Number(p.get('cid')) || Math.round(Math.abs(lat * 1000 + lon * 10)),
      name: city,
      latitude: lat,
      longitude: lon,
      country: p.get('country') ?? '',
      country_code: p.get('cc') ?? '',
      timezone: p.get('tz') ?? 'auto',
    } as GeoLocation;
  } catch {
    return null;
  }
}

function syncLocationToUrl(loc: GeoLocation) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('city', loc.name ?? '');
    url.searchParams.set('lat', String(loc.latitude));
    url.searchParams.set('lon', String(loc.longitude));
    url.searchParams.set('cid', String(loc.id));
    if (loc.country) url.searchParams.set('country', loc.country);
    if ((loc as { country_code?: string }).country_code)
      url.searchParams.set('cc', (loc as { country_code?: string }).country_code!);
    if (loc.timezone) url.searchParams.set('tz', loc.timezone);
    window.history.replaceState(null, '', url.toString());
  } catch {
    // ignore
  }
}

function AppContent() {
  const { t } = useSettings();
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [hourly, setHourly] = useState<HourlyForecast | null>(null);
  const [daily, setDaily] = useState<DailyForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModels, setShowModels] = useState(false);
  const [showTrackers, setShowTrackers] = useState(false);
  const [localVotes, setLocalVotes] = useState<VoteAggregate[]>([]);
  const [globalVotes, setGlobalVotes] = useState<VoteAggregate[]>([]);
  const [accuracyResults, setAccuracyResults] = useState<ModelAccuracy[]>([]);
  const [activeView, setActiveView] = useState<'forecast' | 'logs'>('forecast');
  const [refreshing, setRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const {
    favorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    exportBackup,
    importBackup,
    shareUrl,
  } = useFavorites();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restored, setRestored] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Restore last selected location on initial load (URL wins, then localStorage, then default)
  useEffect(() => {
    const fromUrl = getLocationFromUrl();
    if (fromUrl) {
      setLocation(fromUrl);
      setRestored(true);
      return;
    }
    try {
      const saved = localStorage.getItem(LAST_LOCATION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as GeoLocation;
        if (parsed && typeof parsed.latitude === 'number') {
          setLocation(parsed);
          syncLocationToUrl(parsed);
          setRestored(true);
          return;
        }
      }
    } catch {
      // ignore
    }
    // Default fallback to Ratchaburi
    const defaultLoc: GeoLocation = {
      id: 1150965,
      name: 'Ratchaburi',
      latitude: 13.54,
      longitude: 99.82,
      country: 'Thailand',
      country_code: 'TH',
      timezone: 'Asia/Bangkok',
    };
    setLocation(defaultLoc);
    syncLocationToUrl(defaultLoc);
    setRestored(true);
  }, []);

  const loadLocalVotes = useCallback(async (loc: GeoLocation) => {
    try {
      const { data } = await supabase
        .from('model_votes')
        .select('model_id, rating')
        .gte('latitude', loc.latitude - 0.5)
        .lte('latitude', loc.latitude + 0.5)
        .gte('longitude', loc.longitude - 0.5)
        .lte('longitude', loc.longitude + 0.5);

      if (!data) return;

      const grouped = data.reduce((acc, row) => {
        if (!acc[row.model_id]) {
          acc[row.model_id] = { total: 0, count: 0 };
        }
        acc[row.model_id].total += row.rating;
        acc[row.model_id].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      const aggs: VoteAggregate[] = Object.entries(grouped).map(([model_id, val]) => ({
        model_id,
        average_rating: val.total / val.count,
        vote_count: val.count,
      }));

      setLocalVotes(aggs);
    } catch (e) {
      console.error('Failed to load local votes:', e);
    }
  }, []);

  const loadGlobalVotes = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('model_votes')
        .select('model_id, rating');

      if (!data) return;

      const grouped = data.reduce((acc, row) => {
        if (!acc[row.model_id]) {
          acc[row.model_id] = { total: 0, count: 0 };
        }
        acc[row.model_id].total += row.rating;
        acc[row.model_id].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      const aggs: VoteAggregate[] = Object.entries(grouped).map(([model_id, val]) => ({
        model_id,
        average_rating: val.total / val.count,
        vote_count: val.count,
      }));

      setGlobalVotes(aggs);
    } catch (e) {
      console.error('Failed to load global votes:', e);
    }
  }, []);

  const loadWeatherData = useCallback(async (loc: GeoLocation, isManualRefresh = false) => {
    if (!isManualRefresh) {
      setLoading(true);
    }
    setError(null);
    try {
      const [cur, hr, dy] = await Promise.all([
        fetchCurrentWeather(loc.latitude, loc.longitude, loc.timezone),
        fetchHourlyForecast(loc.latitude, loc.longitude, loc.timezone),
        fetchDailyForecast(loc.latitude, loc.longitude, loc.timezone),
      ]);
      setCurrent(cur);
      setHourly(hr);
      setDaily(dy);
      setLastUpdated(new Date());

      if (isManualRefresh) {
        setShowRefreshToast(true);
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          setShowRefreshToast(false);
        }, 3200);
      }

      // Test accuracy across models in parallel with weather load
      testModelAccuracy(loc.latitude, loc.longitude, loc.timezone)
        .then((acc) => setAccuracyResults(acc))
        .catch((err) => console.error('Accuracy test failed:', err));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSelect = useCallback(
    (loc: GeoLocation) => {
      setLocation(loc);
      try {
        localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
      } catch {
        // ignore
      }
      syncLocationToUrl(loc);
      loadWeatherData(loc, false);
      loadLocalVotes(loc);
    },
    [loadWeatherData, loadLocalVotes]
  );

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const res = await fetch(
            `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1`
          );
          const data = await res.json();
          const place = data?.results?.[0];
          const newLoc: GeoLocation = {
            id: place?.id ?? Math.round(Math.abs(lat * 1000 + lon * 10)),
            name: place?.name ?? 'My Location',
            latitude: lat,
            longitude: lon,
            country: place?.country ?? '',
            country_code: place?.country_code ?? '',
            timezone: place?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'auto',
          };
          handleSelect(newLoc);
        } catch {
          const fallbackLoc: GeoLocation = {
            id: Math.round(Math.abs(lat * 1000 + lon * 10)),
            name: 'My Location',
            latitude: lat,
            longitude: lon,
            country: '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'auto',
          };
          handleSelect(fallbackLoc);
        }
      },
      (err) => {
        setLoading(false);
        alert(`Could not get your location: ${err.message}`);
      },
      { timeout: 10000 }
    );
  }, [handleSelect]);

  useEffect(() => {
    if (location && restored) {
      loadWeatherData(location, false);
      loadLocalVotes(location);
      loadGlobalVotes();
    }
  }, [location, restored, loadWeatherData, loadLocalVotes, loadGlobalVotes]);

  const topModel: WeatherModel = useMemo(() => {
    if (accuracyResults.length > 0) {
      const sorted = [...accuracyResults].sort((a, b) => b.overallScore - a.overallScore);
      const topAcc = sorted[0];
      const found = WEATHER_MODELS.find((m) => m.id === topAcc.modelId);
      if (found) return found;
    }
    return WEATHER_MODELS[0];
  }, [accuracyResults]);

  const handleRefresh = useCallback(() => {
    if (location && !refreshing) {
      setRefreshing(true);
      loadWeatherData(location, true);
      loadLocalVotes(location);
      loadGlobalVotes();
    }
  }, [location, refreshing, loadWeatherData, loadLocalVotes, loadGlobalVotes]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-500/20">
              <CloudSun size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none text-white sm:text-xl">
                Model Cast
              </h1>
            </div>
            {refreshing && (
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-400 animate-pulse">
                <RefreshCw size={12} className="animate-spin" />
                <span>Refreshing...</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SettingsBar />
            <HeaderMenu
              activeView={activeView}
              onToggleView={() => setActiveView((v) => (v === 'forecast' ? 'logs' : 'forecast'))}
              onOpenTrackers={() => setShowTrackers(true)}
              onOpenModels={() => setShowModels(true)}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              onShare={shareUrl}
              onBackup={exportBackup}
              onRestore={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importBackup(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {t('findBest')}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-400">
            {t('findBestDesc')}
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <SearchBar onSelect={handleSelect} currentLocation={location} />
            <button
              onClick={handleLocateMe}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              title="Use my current location"
            >
              <Navigation size={16} />
              <span className="hidden sm:inline">Locate Me</span>
            </button>
          </div>

          {/* SAVED FAVORITES ROW */}
          {(favorites.length > 0 || (location && !isFavorite(location.id))) && (
            <div className="mt-4 flex justify-center">
              <FavoritePlaces
                favorites={favorites}
                currentLocation={location}
                isFavorite={isFavorite}
                onAdd={addFavorite}
                onRemove={removeFavorite}
                onSelect={handleSelect}
              />
            </div>
          )}

          {/* DUAL TICKERS: Severe Alerts / Threat Center + What To Wear */}
          {location && (
            <WeatherTickers
              location={location}
              current={current}
              onOpenTrackers={() => setShowTrackers(true)}
            />
          )}
        </section>

        {!location && !loading && restored && (
          <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-8 text-center sm:p-12">
            <Globe2 size={48} className="mx-auto mb-4 text-slate-600" />
            <p className="text-lg font-medium text-slate-300">{t('searchToBegin')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('searchHint')}</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={40} className="animate-spin text-sky-400" />
            <p className="mt-4 text-slate-400">{t('fetchingForecasts')}</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <AlertTriangle size={40} className="mb-4 text-amber-400" />
            <p className="text-lg font-medium text-slate-300">{error}</p>
            <p className="mt-1 text-sm text-slate-500">{t('tryAnother')}</p>
          </div>
        )}

        {location && !loading && !error && current && hourly && daily && activeView === 'forecast' && (
          <div className="space-y-6">
            <CurrentWeatherCard
              weather={current}
              locationName={location.name}
              country={location.country}
            />

            {/* Live Timestamp with exact seconds for clear refresh proof */}
            {lastUpdated && (
              <div className="-mt-4 flex items-center justify-end gap-2 text-xs text-slate-400">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  Last updated{' '}
                  <span className="font-mono font-semibold text-slate-200">
                    {lastUpdated.toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                      timeZone: 'Asia/Bangkok',
                    })}
                  </span>{' '}
                  ICT
                </span>
              </div>
            )}

            {/* Day & Night Weather Report Summary (Sun, Moon, Narrative, Pressure, UV) */}
            <DayNightSummary
              location={location}
              current={current}
              hourly={hourly}
              daily={daily}
            />

            <TopModelForecast
              location={location}
              model={topModel}
              current={current}
              hourly={hourly}
              daily={daily}
              votes={localVotes}
              accuracy={accuracyResults}
              onOpenModels={() => setShowModels(true)}
            />
          </div>
        )}

        {location && !loading && !error && current && hourly && daily && activeView === 'logs' && (
          <WeatherLogs
            location={location}
            current={current}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-6">
        <p className="text-center text-sm text-slate-500">{t('footerText')}</p>
      </footer>

      {/* Floating Refresh Proof Toast */}
      {showRefreshToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl shadow-emerald-500/20 backdrop-blur-md">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Check size={14} className="stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white">Weather Data Refreshed</span>
            <span className="text-[11px] text-emerald-400/90">
              Live models updated at{' '}
              {lastUpdated
                ? lastUpdated.toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                    timeZone: 'Asia/Bangkok',
                  })
                : 'now'}{' '}
              ICT
            </span>
          </div>
        </div>
      )}

      {location && hourly && daily && (
        <WeatherModelsLiveModal
          open={showModels}
          onClose={() => setShowModels(false)}
          location={location}
          daily={daily}
          localVotes={localVotes}
          globalVotes={globalVotes}
          accuracy={accuracyResults}
          onVoted={() => {
            loadLocalVotes(location);
            loadGlobalVotes();
          }}
        />
      )}

      <LiveTrackersModal open={showTrackers} onClose={() => setShowTrackers(false)} location={location} hourly={hourly} />
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
