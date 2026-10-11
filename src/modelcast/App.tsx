// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchTopModelForecast,
  fetchForecastWithSnapshots,
  type CurrentWeather,
  type HourlyForecast,
  type DailyForecast,
} from '@/modelcast/lib/weatherApi';
import { runAccuracyTests, type ModelAccuracy } from '@/modelcast/lib/accuracyApi';
import { supabase } from '@/modelcast/lib/supabase';
import { SettingsProvider, useSettings } from '@/modelcast/lib/settings';
import { useFavorites } from '@/modelcast/lib/useFavorites';
import type { GeoLocation, VoteAggregate } from '@/modelcast/lib/types';

import { SearchBar } from '@/modelcast/components/SearchBar';
import { CurrentWeatherCard } from '@/modelcast/components/CurrentWeatherCard';
import { DayNightSummary } from '@/modelcast/components/DayNightSummary';
import { HourlyChart } from '@/modelcast/components/HourlyChart';
import { TopModelForecast } from '@/modelcast/components/TopModelForecast';
import { FavoritePlaces } from '@/modelcast/components/FavoritePlaces';
import { SettingsBar } from '@/modelcast/components/SettingsBar';
import { WeatherModelsLiveModal } from '@/modelcast/components/WeatherModelsLiveModal';
import { LiveTrackersModal } from '@/modelcast/components/LiveTrackersModal';
import { WeatherLogs } from '@/modelcast/components/WeatherLogs';
import { WeatherTickers } from '@/modelcast/components/WeatherTickers';
import { HeaderMenu } from '@/modelcast/components/HeaderMenu';

import { Navigation, CloudRain, AlertTriangle, RefreshCw, Check, Upload, FileText, X } from 'lucide-react';

const LAST_LOCATION_KEY = 'modelcast:last-location';

function getLocationFromUrl(): GeoLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get('lat');
    const lon = params.get('lon');
    const city = params.get('city');
    if (lat && lon && city) {
      return {
        id: Number(params.get('cid')) || Date.now(),
        name: city,
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        country: params.get('country') || '',
        country_code: params.get('cc') || '',
        timezone: params.get('tz') || 'UTC',
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function syncLocationToUrl(loc: GeoLocation) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('city', loc.name);
    url.searchParams.set('lat', loc.latitude.toFixed(4));
    url.searchParams.set('lon', loc.longitude.toFixed(4));
    url.searchParams.set('cid', String(loc.id));
    if (loc.country) url.searchParams.set('country', loc.country);
    if ((loc as { country_code?: string }).country_code) {
      url.searchParams.set('cc', (loc as { country_code?: string }).country_code!);
    }
    if (loc.timezone) url.searchParams.set('tz', loc.timezone);
    window.history.replaceState(null, '', url.toString());
  } catch {
    // ignore
  }
}

function AppContent() {
  const { t } = useSettings();
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [topModel, setTopModel] = useState<string>('ecmwf_ifs025');
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [hourly, setHourly] = useState<HourlyForecast | null>(null);
  const [daily, setDaily] = useState<DailyForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModels, setShowModels] = useState(false);
  const [showTrackers, setShowTrackers] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
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

  // Restore last selected location on initial load
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

      const aggs: VoteAggregate[] = Object.entries(grouped).map(([modelId, { total, count }]) => ({
        modelId,
        averageRating: total / count,
        totalVotes: count,
      }));

      setLocalVotes(aggs);
    } catch {
      // ignore
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

      const aggs: VoteAggregate[] = Object.entries(grouped).map(([modelId, { total, count }]) => ({
        modelId,
        averageRating: total / count,
        totalVotes: count,
      }));

      setGlobalVotes(aggs);
    } catch {
      // ignore
    }
  }, []);

  const loadWeatherData = useCallback(
    async (loc: GeoLocation) => {
      setLoading(true);
      setError(null);
      try {
        const [weatherData, accuracyData] = await Promise.all([
          fetchForecastWithSnapshots(loc.latitude, loc.longitude, loc.timezone),
          runAccuracyTests(loc),
        ]);
        setTopModel(weatherData.topModel);
        setCurrent(weatherData.current);
        setHourly(weatherData.hourly);
        setDaily(weatherData.daily);
        setAccuracyResults(accuracyData);
        setLastUpdated(new Date());

        // Save last location
        try {
          localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
        } catch {
          // ignore
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to fetch weather data');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleRefresh = useCallback(async () => {
    if (!location || refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        loadWeatherData(location),
        loadLocalVotes(location),
        loadGlobalVotes(),
      ]);
      setShowRefreshToast(true);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        setShowRefreshToast(false);
      }, 4000);
    } finally {
      setRefreshing(false);
    }
  }, [location, refreshing, loadWeatherData, loadLocalVotes, loadGlobalVotes]);

  useEffect(() => {
    if (restored && location) {
      loadWeatherData(location);
      loadLocalVotes(location);
      loadGlobalVotes();
    }
  }, [restored, location, loadWeatherData, loadLocalVotes, loadGlobalVotes]);

  const handleSelect = (loc: GeoLocation) => {
    setLocation(loc);
    syncLocationToUrl(loc);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert(t('geolocationNotSupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: GeoLocation = {
          id: Date.now(),
          name: t('currentLocation'),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          country: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        handleSelect(loc);
      },
      () => {
        alert(t('unableToRetrieveLocation'));
      },
    );
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <CloudRain className="h-6 w-6 text-sky-400" />
              <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
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
              onRestore={() => setShowRestoreModal(true)}
            />
            {/* Unlocked file picker allowing Google Drive files */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json,text/plain,*/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  importBackup(file);
                  setShowRestoreModal(false);
                }
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-3 sm:px-6 py-4 sm:py-8 overflow-x-hidden">
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

        {loading && (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <p className="text-sm text-slate-400">{t('loadingForecast')}</p>
          </div>
        )}

        {error && !loading && (
          <div className="mx-auto max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" />
            <p className="mt-2 font-medium text-rose-300">{error}</p>
            <button
              onClick={() => location && loadWeatherData(location)}
              className="mt-4 rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              {t('tryAgain')}
            </button>
          </div>
        )}

        {location && !loading && !error && current && hourly && daily && activeView === 'forecast' && (
          <div className="space-y-6">
            <CurrentWeatherCard
              weather={current}
              locationName={location.name}
              country={location.country}
              location={location}
              current={current}
              topModel={topModel}
              daily={daily}
              onOpenModels={() => setShowModels(true)}
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

            {/* Day & Night Weather Report Summary */}
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

      {/* Restore Modal for Phone & Google Drive */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload size={18} className="text-sky-400" />
                Restore Backup
              </h3>
              <button
                onClick={() => setShowRestoreModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* Option A: Select from Google Drive or Phone files */}
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-sky-500/40 bg-sky-500/15 p-3 text-left transition hover:bg-sky-500/25 active:scale-95"
              >
                <Upload size={20} className="text-sky-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-sky-200">
                    Open File (Google Drive / Files)
                  </div>
                  <div className="text-xs text-sky-300/80">
                    Tap the ☰ menu in your file picker to select Google Drive
                  </div>
                </div>
              </button>

              <div className="relative py-1 text-center text-xs text-slate-500">
                <span>OR PASTE CODE</span>
              </div>

              {/* Option B: Direct Paste */}
              <div className="space-y-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste your backup JSON text here..."
                  className="w-full h-24 rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!pasteText.trim()}
                  onClick={() => {
                    if (pasteText.trim()) {
                      importBackup(pasteText.trim());
                      setShowRestoreModal(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40"
                >
                  <FileText size={16} />
                  Restore Pasted Code
                </button>
              </div>
            </div>
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

      <LiveTrackersModal
        open={showTrackers}
        onClose={() => setShowTrackers(false)}
        location={location}
        hourly={hourly}
      />
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
