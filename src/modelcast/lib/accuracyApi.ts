// @ts-nocheck -- imported Bolt code, written for a looser TS config
import type { AccuracyMetric, ModelAccuracy } from './types';
import { MODEL_IDS, WEATHER_MODELS } from './weatherModels';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const HISTORICAL_FORECAST_URL = 'https://historical-forecast-api.open-meteo.com/v1/forecast';

const PAST_DAYS = 3;

function computeRMSE(actual: number[], predicted: number[]): AccuracyMetric {
  let sumSq = 0;
  let sumDiff = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === null || predicted[i] === null) continue;
    if (isNaN(actual[i]) || isNaN(predicted[i])) continue;
    const diff = predicted[i] - actual[i];
    sumSq += diff * diff;
    sumDiff += diff;
    count++;
  }
  if (count === 0) return { rmse: NaN, bias: NaN, count: 0 };
  return {
    rmse: Math.sqrt(sumSq / count),
    bias: sumDiff / count,
    count,
  };
}

export async function testModelAccuracy(
  lat: number,
  lon: number,
): Promise<ModelAccuracy[]> {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (PAST_DAYS - 1));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [actualsRes, forecastRes] = await Promise.all([
    fetch(
      `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m` +
        `&start_date=${fmt(startDate)}&end_date=${fmt(endDate)}&timezone=auto`,
    ),
    fetch(
      `${HISTORICAL_FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m` +
        `&models=${MODEL_IDS.join(',')}` +
        `&past_days=${PAST_DAYS + 1}&forecast_days=0&timezone=auto`,
    ),
  ]);

  if (!actualsRes.ok) throw new Error(`Actuals fetch failed (${actualsRes.status})`);
  if (!forecastRes.ok) throw new Error(`Historical forecast fetch failed (${forecastRes.status})`);

  const actualsData = await actualsRes.json();
  const forecastData = await forecastRes.json();

  const actualTimes: string[] = actualsData.hourly?.time ?? [];
  const actualTemp: (number | null)[] = actualsData.hourly?.temperature_2m ?? [];
  const actualHumidity: (number | null)[] = actualsData.hourly?.relative_humidity_2m ?? [];
  const actualWind: (number | null)[] = actualsData.hourly?.wind_speed_10m ?? [];

  const forecastTimes: string[] = forecastData.hourly?.time ?? [];

  const timeToIndex = new Map<string, number>();
  for (let i = 0; i < actualTimes.length; i++) {
    timeToIndex.set(actualTimes[i], i);
  }

  const results: ModelAccuracy[] = [];

  for (const model of WEATHER_MODELS) {
    const fTemp: (number | null)[] = forecastData.hourly?.[`temperature_2m_${model.id}`] ?? [];
    const fHumidity: (number | null)[] = forecastData.hourly?.[`relative_humidity_2m_${model.id}`] ?? [];
    const fWind: (number | null)[] = forecastData.hourly?.[`wind_speed_10m_${model.id}`] ?? [];

    const matchedTemp: number[] = [];
    const predictedTemp: number[] = [];
    const matchedHumidity: number[] = [];
    const predictedHumidity: number[] = [];
    const matchedWind: number[] = [];
    const predictedWind: number[] = [];

    for (let i = 0; i < forecastTimes.length; i++) {
      const actualIdx = timeToIndex.get(forecastTimes[i]);
      if (actualIdx === undefined) continue;

      const aTemp = actualTemp[actualIdx];
      const pTemp = fTemp[i];
      if (aTemp !== null && aTemp !== undefined && pTemp !== null && pTemp !== undefined && !isNaN(aTemp) && !isNaN(pTemp)) {
        matchedTemp.push(aTemp);
        predictedTemp.push(pTemp);
      }

      const aHum = actualHumidity[actualIdx];
      const pHum = fHumidity[i];
      if (aHum !== null && aHum !== undefined && pHum !== null && pHum !== undefined && !isNaN(aHum) && !isNaN(pHum)) {
        matchedHumidity.push(aHum);
        predictedHumidity.push(pHum);
      }

      const aWind = actualWind[actualIdx];
      const pWind = fWind[i];
      if (aWind !== null && aWind !== undefined && pWind !== null && pWind !== undefined && !isNaN(aWind) && !isNaN(pWind)) {
        matchedWind.push(aWind);
        predictedWind.push(pWind);
      }
    }

    const tempMetric = computeRMSE(matchedTemp, predictedTemp);
    const humidityMetric = computeRMSE(matchedHumidity, predictedHumidity);
    const windMetric = computeRMSE(matchedWind, predictedWind);

    const hasData = tempMetric.count > 0 || humidityMetric.count > 0 || windMetric.count > 0;

    let overallScore = 0;
    if (hasData) {
      const tempScore = isNaN(tempMetric.rmse) ? 0 : Math.max(0, 100 - tempMetric.rmse * 10);
      const humScore = isNaN(humidityMetric.rmse) ? 0 : Math.max(0, 100 - humidityMetric.rmse * 2);
      const windScore = isNaN(windMetric.rmse) ? 0 : Math.max(0, 100 - windMetric.rmse * 5);
      const components = [tempScore, humScore, windScore].filter((s) => s > 0);
      overallScore = components.length > 0
        ? components.reduce((a, b) => a + b, 0) / components.length
        : 0;
    }

    results.push({
      modelId: model.id,
      modelName: model.name,
      shortName: model.shortName,
      color: model.color,
      temperature: tempMetric,
      humidity: humidityMetric,
      windSpeed: windMetric,
      overallScore,
      rank: 0,
      hasData,
    });
  }

  const withData = results.filter((r) => r.hasData);
  const withoutData = results.filter((r) => !r.hasData);

  withData.sort((a, b) => b.overallScore - a.overallScore);
  withData.forEach((r, i) => {
    r.rank = i + 1;
  });
  withoutData.forEach((r) => {
    r.rank = withData.length + 1;
  });

  return [...withData, ...withoutData];
}
