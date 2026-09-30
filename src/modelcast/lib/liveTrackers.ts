import { callFunction } from '@/modelcast/lib/supabase';

export interface Earthquake {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  url: string;
  latitude: number;
  longitude: number;
  depth: number;
  alert: string | null;
}

export interface PrecipitationData {
  timeline: string[];
  precipitation: (number | null)[];
  probability: (number | null)[];
  currentPrecip: number;
  currentProbability: number;
  nextRainTime: string | null;
  nextRainAmount: number;
}

export interface WeatherAlert {
  id: string;
  area: string;
  alertType: string;
  severity: string;
  certainty: string;
  onset: string;
  expires: string;
  description: string;
}

export interface TropicalStorm {
  id: string;
  name: string;
  type: string;
  category: string;
  latitude: number;
  longitude: number;
  intensityMph: number;
  intensityKts: number;
  pressureMb: number;
  movement: string;
  speedMph: number;
  updateTime: string;
  basin: string;
}

const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const MET_ALERTS_URL = 'https://api.met.no/weatherapi/metalerts/2.0/current.json';

interface GeoJsonFeature {
  id: string | number;
  properties: {
    mag?: number;
    place?: string;
    time?: number;
    url?: string;
    alert?: string | null;
  } | null;
  geometry: {
    coordinates?: [number, number, number];
  } | null;
}

interface AlertFeature {
  id: string;
  properties: {
    area?: string;
    event?: string;
    severity?: string;
    certainty?: string;
    onset?: string;
    expires?: string;
    description?: string;
  } | null;
}

export async function fetchNearbyEarthquakes(
  lat: number,
  lon: number,
  radiusKm = 500,
  minMagnitude = 2,
): Promise<Earthquake[]> {
  const url =
    `${USGS_URL}?format=geojson&latitude=${lat}&longitude=${lon}` +
    `&maxradiuskm=${radiusKm}&minmagnitude=${minMagnitude}` +
    `&limit=20&orderby=time`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Earthquake API error: ${res.status}`);
  const data = await res.json();

  return (data.features ?? []).map((f: GeoJsonFeature) => ({
    id: String(f.id),
    magnitude: f.properties?.mag ?? 0,
    place: f.properties?.place ?? 'Unknown',
    time: f.properties?.time ?? 0,
    url: f.properties?.url ?? '#',
    latitude: f.geometry?.coordinates?.[1] ?? 0,
    longitude: f.geometry?.coordinates?.[0] ?? 0,
    depth: f.geometry?.coordinates?.[2] ?? 0,
    alert: f.properties?.alert ?? null,
  }));
}

export async function fetchPrecipitationNearby(
  lat: number,
  lon: number,
): Promise<PrecipitationData> {
  const url =
    `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}` +
    `&current=precipitation,precipitation_probability` +
    `&hourly=precipitation,precipitation_probability` +
    `&past_days=0&forecast_days=3&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Precipitation API error: ${res.status}`);
  const data = await res.json();

  const m = data.hourly ?? {};
  const times: string[] = m.time ?? [];
  const precip: (number | null)[] = m.precipitation ?? [];
  const prob: (number | null)[] = m.precipitation_probability ?? [];

  let nextRainTime: string | null = null;
  let nextRainAmount = 0;
  for (let i = 0; i < precip.length; i++) {
    if (precip[i] !== null && precip[i]! > 0.1) {
      nextRainTime = times[i] ?? null;
      nextRainAmount = precip[i]!;
      break;
    }
  }

  return {
    timeline: times,
    precipitation: precip,
    probability: prob,
    currentPrecip: data.current?.precipitation ?? 0,
    currentProbability: data.current?.precipitation_probability ?? 0,
    nextRainTime,
    nextRainAmount,
  };
}

export async function fetchWeatherAlerts(
  lat: number,
  lon: number,
): Promise<WeatherAlert[]> {
  const url = `${MET_ALERTS_URL}?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ModelCast/1.0' } });
  if (!res.ok) throw new Error(`Alerts API error: ${res.status}`);
  const data = await res.json();

  return (data.features ?? []).map((f: AlertFeature) => {
    const p = f.properties ?? {};
    return {
      id: f.id ?? Math.random().toString(36),
      area: p.area ?? 'Unknown',
      alertType: p.event ?? 'Weather Alert',
      severity: p.severity ?? 'Unknown',
      certainty: p.certainty ?? 'Unknown',
      onset: p.onset ?? '',
      expires: p.expires ?? '',
      description: p.description ?? '',
    };
  });
}

export async function fetchTropicalStorms(): Promise<TropicalStorm[]> {
  const data = await callFunction<{ storms?: TropicalStorm[] }>('hurricane-tracker');
  return data.storms ?? [];
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
