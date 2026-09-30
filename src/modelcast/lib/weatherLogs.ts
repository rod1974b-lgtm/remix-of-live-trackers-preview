import { supabase } from '@/modelcast/lib/supabase';

export type WeatherLogType =
  | 'Dry'
  | 'Drizzle'
  | 'Light Rain'
  | 'Showers'
  | 'Heavy Rain'
  | 'Thunderstorm'
  | 'Overcast'
  | 'Clear'
  | 'Mist'
  | 'Fog'
  | 'Hail'
  | 'Windy';

export interface WeatherLog {
  id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  country: string | null;
  observed_at: string;
  weather_type: WeatherLogType;
  temperature: number;
  precipitation: number;
  wind_speed: number;
  notes: string;
  created_at: string;
}

export interface NewWeatherLog {
  location_name: string;
  latitude: number;
  longitude: number;
  country: string;
  observed_at: string;
  weather_type: WeatherLogType;
  temperature: number;
  precipitation: number;
  wind_speed: number;
  notes: string;
}

export async function fetchWeatherLogs(locationName: string, country: string): Promise<WeatherLog[]> {
  const { data, error } = await supabase
    .from('weather_logs')
    .select('id, location_name, latitude, longitude, country, observed_at, weather_type, temperature, precipitation, wind_speed, notes, created_at')
    .eq('location_name', locationName)
    .eq('country', country)
    .order('observed_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as WeatherLog[];
}

export async function createWeatherLog(entry: NewWeatherLog): Promise<WeatherLog> {
  const { data, error } = await supabase
    .from('weather_logs')
    .insert(entry)
    .select('id, location_name, latitude, longitude, country, observed_at, weather_type, temperature, precipitation, wind_speed, notes, created_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('The weather log was not saved');
  return data as WeatherLog;
}

export async function deleteWeatherLog(id: string): Promise<void> {
  const { error } = await supabase.from('weather_logs').delete().eq('id', id);
  if (error) throw error;
}
