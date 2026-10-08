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

function scoreTemperatureMatch(observedTemp: number, predictedTemp: number | null | undefined): number {
  if (predictedTemp === null || predictedTemp === undefined || isNaN(predictedTemp)) return 50;
  const diff = Math.abs(predictedTemp - observedTemp);
  // Diff 0°C -> 100, 1°C -> 87, 2°C -> 74, 3°C -> 61, 5°C -> 35
  return Math.max(0, Math.min(100, 100 - diff * 13));
}

function scoreConditionMatch(conditionId: string | undefined, wmoCode: number | null | undefined): number {
  if (!conditionId || wmoCode === null || wmoCode === undefined || isNaN(wmoCode)) return 70;

  const isRainObserved = ['drizzle', 'light_rain', 'moderate_rain', 'heavy_rain', 'thunderstorm'].includes(conditionId);
  const isRainForecast = (wmoCode >= 51 && wmoCode <= 67) || (wmoCode >= 80 && wmoCode <= 82) || (wmoCode >= 95 && wmoCode <= 99);

  // Exact or close category matches
  if (conditionId === 'sunny' && (wmoCode === 0 || wmoCode === 1)) return 100;
  if (conditionId === 'sunny' && wmoCode === 2) return 75;
  if (conditionId === 'partly_cloudy' && wmoCode === 2) return 100;
  if (conditionId === 'partly_cloudy' && (wmoCode === 0 || wmoCode === 1 || wmoCode === 3)) return 75;
  if (conditionId === 'overcast' && wmoCode === 3) return 100;
  if (conditionId === 'overcast' && (wmoCode === 2 || (wmoCode >= 51 && wmoCode <= 55))) return 65;
  if (conditionId === 'foggy' && (wmoCode === 45 || wmoCode === 48)) return 100;

  // Rain severity matching
  if (conditionId === 'drizzle' && (wmoCode >= 51 && wmoCode <= 57)) return 100;
  if (conditionId === 'drizzle' && (wmoCode === 61 || wmoCode === 80)) return 80;
  if (conditionId === 'light_rain' && (wmoCode === 61 || wmoCode === 80)) return 100;
  if (conditionId === 'light_rain' && (wmoCode === 63 || wmoCode === 81 || (wmoCode >= 51 && wmoCode <= 55))) return 80;
  if (conditionId === 'moderate_rain' && (wmoCode === 63 || wmoCode === 81)) return 100;
  if (conditionId === 'moderate_rain' && (wmoCode === 61 || wmoCode === 65 || wmoCode === 80 || wmoCode === 82)) return 80;
  if (conditionId === 'heavy_rain' && (wmoCode === 65 || wmoCode === 82 || (wmoCode >= 95 && wmoCode <= 99))) return 100;
  if (conditionId === 'heavy_rain' && (wmoCode === 63 || wmoCode === 81)) return 75;
  if (conditionId === 'thunderstorm' && (wmoCode >= 95 && wmoCode <= 99)) return 100;
  if (conditionId === 'thunderstorm' && (wmoCode === 65 || wmoCode === 82)) return 75;

  // General dry vs wet match
  if (isRainObserved && isRainForecast) return 70;
  if (!isRainObserved && !isRainForecast) return 70;

  return 20;
}

function getStoredLogs(locationName?: string) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('weather_logs_safe');
    if (!raw) return [];
    const logs = JSON.parse(raw);
    if (!Array.isArray(logs)) return [];

    let targetName = (locationName ?? '').trim().toLowerCase();
    if (!targetName) {
      try {
        const lastRaw = localStorage.getItem('modelcast:last-location');
        if (lastRaw) {
          const parsed = JSON.parse(lastRaw);
          if (parsed?.name) targetName = parsed.name.trim().toLowerCase();
        }
      } catch {}
    }

    return logs.filter((log: any) => {
      if (!log || typeof log !== 'object') return false;
      const hasTemp = typeof log.temperature === 'number' && !isNaN(log.temperature);
      const hasCond = typeof log.condition === 'string' && log.condition.length > 0;
      if (!hasTemp && !hasCond) return false;

      if (targetName && log.location_name) {
        const loc = String(log.location_name).trim().toLowerCase();
        if (loc && !loc.includes(targetName) && !targetName.includes(loc)) {
          return false;
        }
      }
      return true;
    });
  } catch {
    return [];
  }
}

export async function testModelAccuracy(
  lat: number,
  lon: number,
  locationName?: string,
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
        `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&models=${MODEL_IDS.join(',')}` +
        `&past_days=${PAST_DAYS + 1}&forecast_days=1&timezone=auto`,
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
  const utcOffsetSeconds = Number(forecastData.utc_offset_seconds ?? 0);

  // Compute UTC timestamp for each forecast hour
  const forecastEpochs: number[] = forecastTimes.map((ft: string) => {
    const [dPart, tPart] = ft.split('T');
    if (!dPart || !tPart) return NaN;
    const [y, m, d] = dPart.split('-').map(Number);
    const [h, min] = tPart.split(':').map(Number);
    return Date.UTC(y, m - 1, d, h, min || 0) - utcOffsetSeconds * 1000;
  });

  const timeToIndex = new Map<string, number>();
  for (let i = 0; i < actualTimes.length; i++) {
    timeToIndex.set(actualTimes[i], i);
  }

  // Match stored observations to historical forecast timeline
  const userLogs = getStoredLogs(locationName);
  const matchedLogIndices: { log: any; forecastIdx: number }[] = [];

  for (const log of userLogs) {
    let logEpoch = NaN;
    if (log.logged_at) {
      logEpoch = new Date(log.logged_at).getTime();
    }
    if (isNaN(logEpoch) && typeof log.id === 'string' && log.id.startsWith('obs_')) {
      const stamp = Number(log.id.replace('obs_', ''));
      if (!isNaN(stamp)) logEpoch = stamp;
    }
    if (isNaN(logEpoch)) continue;

    let closestIdx = -1;
    let minDiff = Infinity;
    for (let i = 0; i < forecastEpochs.length; i++) {
      const diff = Math.abs(forecastEpochs[i] - logEpoch);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    // Must be within 90 minutes of the hourly forecast interval
    if (closestIdx >= 0 && minDiff <= 90 * 60 * 1000) {
      matchedLogIndices.push({ log, forecastIdx: closestIdx });
    }
  }

  const results: ModelAccuracy[] = [];

  for (const model of WEATHER_MODELS) {
    const fTemp: (number | null)[] = forecastData.hourly?.[`temperature_2m_${model.id}`] ?? [];
    const fHumidity: (number | null)[] = forecastData.hourly?.[`relative_humidity_2m_${model.id}`] ?? [];
    const fWind: (number | null)[] = forecastData.hourly?.[`wind_speed_10m_${model.id}`] ?? [];
    const fCode: (number | null)[] = forecastData.hourly?.[`weather_code_${model.id}`] ?? [];

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

    let hasData = tempMetric.count > 0 || humidityMetric.count > 0 || windMetric.count > 0;

    let backtestScore = 0;
    if (hasData) {
      const tempScore = isNaN(tempMetric.rmse) ? 0 : Math.max(0, 100 - tempMetric.rmse * 10);
      const humScore = isNaN(humidityMetric.rmse) ? 0 : Math.max(0, 100 - humidityMetric.rmse * 2);
      const windScore = isNaN(windMetric.rmse) ? 0 : Math.max(0, 100 - windMetric.rmse * 5);
      const components = [tempScore, humScore, windScore].filter((s) => s > 0);
      backtestScore = components.length > 0
        ? components.reduce((a, b) => a + b, 0) / components.length
        : 0;
    }

    // Evaluate personal user observation logs for this model
    let userLogScore: number | null = null;
    let userLogCount = 0;

    if (matchedLogIndices.length > 0) {
      let totalObsScore = 0;
      let validCount = 0;

      for (const { log, forecastIdx } of matchedLogIndices) {
        const predT = fTemp[forecastIdx];
        const predC = fCode[forecastIdx];

        const hasObsTemp = typeof log.temperature === 'number' && !isNaN(log.temperature);
        const hasPredTemp = predT !== null && predT !== undefined && !isNaN(predT);

        if (!hasObsTemp && !hasPredTemp && predC === null) continue;

        let itemScore = 0;
        if (hasObsTemp && hasPredTemp) {
          const tScore = scoreTemperatureMatch(log.temperature, predT);
          const cScore = scoreConditionMatch(log.condition, predC);
          itemScore = log.condition ? (tScore * 0.7 + cScore * 0.3) : tScore;
        } else if (log.condition) {
          itemScore = scoreConditionMatch(log.condition, predC);
        } else {
          continue;
        }

        totalObsScore += itemScore;
        validCount++;
      }

      if (validCount > 0) {
        userLogScore = totalObsScore / validCount;
        userLogCount = validCount;
      }
    }

    // Blend automated station backtest with user's real-world ground truth
    let overallScore = backtestScore;
    if (userLogCount > 0 && userLogScore !== null) {
      const logWeight = userLogCount >= 3 ? 0.5 : userLogCount === 2 ? 0.4 : 0.3;
      if (hasData) {
        overallScore = backtestScore * (1 - logWeight) + userLogScore * logWeight;
      } else {
        overallScore = userLogScore;
        hasData = true;
      }
    }

    results.push({
      modelId: model.id,
      modelName: model.name,
      shortName: model.shortName,
      color: model.color,
      temperature: tempMetric,
      humidity: humidityMetric,
      windSpeed: windMetric,
      overallScore: Number(overallScore.toFixed(1)),
      rank: 0,
      hasData,
      userLogScore: userLogScore !== null ? Number(userLogScore.toFixed(1)) : null,
      userLogCount,
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
