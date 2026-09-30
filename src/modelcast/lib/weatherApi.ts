// @ts-nocheck -- imported Bolt code, written for a looser TS config
import type { CurrentWeather, DailyForecast, GeoLocation, HourlyForecast } from './types';
import { MODEL_IDS } from './weatherModels';

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_MS = 30 * 60 * 1000;

// Shares one in-flight request between the hourly and daily loaders
const inFlightMultimodel = new Map<string, Promise<MultimodelResponse>>();

const CORE_FALLBACK_MODELS = [
  'ecmwf_ifs04',
  'gfs_seamless',
  'icon_seamless',
  'meteofrance_seamless',
  'ukmo_seamless',
];

function getCached<T>(key: string): T | null {
  const c = cache.get(key);
  if (c && Date.now() - c.ts < CACHE_MS) return c.data as T;
  return null;
}

function setCached(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = 2, delayMs = 1000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;

      if ([429, 502, 503, 504].includes(res.status) && attempt < retries) {
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      throw new Error(`Request failed with status ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await sleep(delayMs * (attempt + 1));
      }
    }
  }
  throw lastError ?? new Error('Network request failed');
}


export async function fetchCurrentWeather(lat: number, lon: number, forceRefresh = false): Promise<CurrentWeather> {
  const key = `current_${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = forceRefresh ? null : getCached<CurrentWeather>(key);
  if (cached) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,pressure_msl` +
    `&timezone=auto`;

  const res = await fetchWithRetry(url, 2, 800);

  const data = await res.json();
  const c = data.current;
  if (!c) throw new Error('No current weather data in response');

  const result: CurrentWeather = {
    temperature: c.temperature_2m,
    apparentTemperature: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    precipitation: c.precipitation,
    weatherCode: c.weather_code,
    windSpeed: c.wind_speed_10m,
    pressure: c.pressure_msl,
    time: c.time,
  };

  setCached(key, result);
  return result;
}

interface MultimodelResponse {
  hourly?: Record<string, (number | null)[] | string[]>;
  daily?: Record<string, (number | null)[] | string[]>;
}

async function executeMultimodelQuery(lat: number, lon: number, models: string[]): Promise<MultimodelResponse> {
  const modelParam = models.join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max` +
    `&models=${modelParam}` +
    `&timezone=auto&forecast_days=7`;

  const res = await fetchWithRetry(url, 2, 1000);
  return res.json();
}

async function fetchMultimodel(lat: number, lon: number, forceRefresh = false): Promise<MultimodelResponse> {
  const key = `raw_multimodel_${lat.toFixed(2)},${lon.toFixed(2)}`;

  if (!forceRefresh) {
    const cached = getCached<MultimodelResponse>(key);
    if (cached) return cached;
  }

  if (inFlightMultimodel.has(key)) {
    return inFlightMultimodel.get(key)!;
  }

  const queryPromise = (async () => {
    try {
      const data = await executeMultimodelQuery(lat, lon, MODEL_IDS);
      setCached(key, data);
      return data;
    } catch (primaryErr) {
      console.warn('Multimodel query with all models failed, falling back to core models:', primaryErr);
      const fallbackData = await executeMultimodelQuery(lat, lon, CORE_FALLBACK_MODELS);
      setCached(key, fallbackData);
      return fallbackData;
    } finally {
      inFlightMultimodel.delete(key);
    }
  })();

  inFlightMultimodel.set(key, queryPromise);
  return queryPromise;
}


export async function fetchHourlyForecast(lat: number, lon: number, forceRefresh = false): Promise<HourlyForecast> {
  const key = `hourly_${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = forceRefresh ? null : getCached<HourlyForecast>(key);
  if (cached) return cached;

  const data = await fetchMultimodel(lat, lon, forceRefresh);

  const hourly = data.hourly ?? {};

  const time = (hourly['time'] as string[]) ?? [];
  const models: HourlyForecast['models'] = {};

  for (const modelId of MODEL_IDS) {
    const temperature = (hourly[`temperature_2m_${modelId}`] as (number | null)[]) ?? [];
    const precipitation = (hourly[`precipitation_${modelId}`] as (number | null)[]) ?? [];
    const weatherCode = (hourly[`weather_code_${modelId}`] as (number | null)[]) ?? [];
    const windSpeed = (hourly[`wind_speed_10m_${modelId}`] as (number | null)[]) ?? [];
    const humidity = (hourly[`relative_humidity_2m_${modelId}`] as (number | null)[]) ?? [];

    if (temperature.length === 0 && precipitation.length === 0) continue;

    models[modelId] = { temperature, precipitation, weatherCode, windSpeed, humidity };
  }

  let precipitationProbability: (number | null)[] = [];
  for (const modelId of MODEL_IDS) {
    const prob = (hourly[`precipitation_probability_${modelId}`] as (number | null)[]) ?? [];
    if (prob.length > 0) {
      precipitationProbability = prob;
      break;
    }
  }
  if (precipitationProbability.length === 0) {
    precipitationProbability = new Array(time.length).fill(null);
  }

  const result: HourlyForecast = { time, precipitationProbability, models };
  setCached(key, result);
  return result;
}

export async function fetchDailyForecast(lat: number, lon: number, forceRefresh = false): Promise<DailyForecast> {
  const key = `daily_${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = forceRefresh ? null : getCached<DailyForecast>(key);
  if (cached) return cached;

  const data = await fetchMultimodel(lat, lon, forceRefresh);
  const daily = data.daily ?? {};

  const time = (daily['time'] as string[]) ?? [];
  const models: DailyForecast['models'] = {};

  for (const modelId of MODEL_IDS) {
    const tempMax = (daily[`temperature_2m_max_${modelId}`] as (number | null)[]) ?? [];
    const tempMin = (daily[`temperature_2m_min_${modelId}`] as (number | null)[]) ?? [];
    const precipitationSum = (daily[`precipitation_sum_${modelId}`] as (number | null)[]) ?? [];
    const weatherCode = (daily[`weather_code_${modelId}`] as (number | null)[]) ?? [];
    const windSpeedMax = (daily[`wind_speed_10m_max_${modelId}`] as (number | null)[]) ?? [];

    if (tempMax.length === 0 && tempMin.length === 0) continue;

    models[modelId] = { tempMax, tempMin, precipitationSum, weatherCode, windSpeedMax };
  }

  const result: DailyForecast = { time, models };
  setCached(key, result);
  return result;
}

export async function searchLocations(query: string, language = 'en'): Promise<GeoLocation[]> {
  if (query.trim().length < 2) return [];

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=8&language=${language}&format=json`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const results: Array<{
    id: number; name: string; latitude: number; longitude: number;
    country?: string; admin1?: string; timezone?: string; country_code?: string;
  }> = data.results ?? [];

  return results.map((r): GeoLocation => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country ?? '',
    admin1: r.admin1,
    timezone: r.timezone ?? '',
    country_code: r.country_code ?? '',
  }));
}
