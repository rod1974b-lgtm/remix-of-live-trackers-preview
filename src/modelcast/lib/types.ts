export interface GeoLocation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  timezone: string;
  country_code: string;
}

export interface WeatherModel {
  id: string;
  name: string;
  shortName: string;
  organization: string;
  region: string;
  color: string;
  resolution: string;
}

export interface HourlyForecast {
  time: string[];
  precipitationProbability: (number | null)[];
  models: {
    [modelId: string]: {
      temperature: (number | null)[];
      precipitation: (number | null)[];
      weatherCode: (number | null)[];
      windSpeed: (number | null)[];
      humidity: (number | null)[];
    };
  };
}

export interface DailyForecast {
  time: string[];
  models: {
    [modelId: string]: {
      tempMax: (number | null)[];
      tempMin: (number | null)[];
      precipitationSum: (number | null)[];
      weatherCode: (number | null)[];
      windSpeedMax: (number | null)[];
    };
  };
}

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  pressure: number;
  time: string;
}

export interface ModelVote {
  id: string;
  model_id: string;
  model_name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  country: string | null;
  rating: number;
  created_at: string;
}

export interface VoteAggregate {
  model_id: string;
  model_name: string;
  avg_rating: number;
  vote_count: number;
}

export interface AccuracyMetric {
  rmse: number;
  bias: number;
  count: number;
}

export interface ModelAccuracy {
  modelId: string;
  modelName: string;
  shortName: string;
  color: string;
  temperature: AccuracyMetric;
  humidity: AccuracyMetric;
  windSpeed: AccuracyMetric;
  overallScore: number;
  rank: number;
  hasData: boolean;
}
