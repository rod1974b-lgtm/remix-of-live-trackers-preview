const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GeneratedAlert {
  id: string;
  area: string;
  alertType: string;
  severity: string;
  certainty: string;
  onset: string;
  expires: string;
  description: string;
  instruction: string;
  source: string;
}

interface OpenMeteoDaily {
  time: string[];
  precipitation_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
  wind_gusts_10m_max: number[];
  temperature_2m_max: number[];
  weather_code: number[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
  current?: {
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    temperature_2m: number;
    precipitation: number;
  };
}

const WMO_CODE_DESC: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

function isThunderstorm(code: number): boolean {
  return code >= 95;
}

function isHeavyRain(code: number): boolean {
  return code === 65 || code === 82 || code === 67;
}

async function fetchTMDWarning(): Promise<{ title: string; description: string } | null> {
  try {
    const res = await fetch("https://www.tmd.go.th/en/", {
      headers: {
        "User-Agent": "ModelCast/1.0 (https://bolt.new)",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // TMD publishes warnings in a banner/alert section. Try to extract warning text.
    const warningMatch = html.match(/class="[^"]*warning[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (warningMatch) {
      const text = warningMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 20) return { title: "Thai Meteorological Department Warning", description: text };
    }

    // Also try announcement section
    const announceMatch = html.match(/class="[^"]*announcement[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (announceMatch) {
      const text = announceMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 20) return { title: "TMD Announcement", description: text };
    }

    return null;
  } catch {
    return null;
  }
}

async function generateAlertsFromForecast(lat: number, lon: number): Promise<GeneratedAlert[]> {
  const alerts: GeneratedAlert[] = [];

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,temperature_2m_max,weather_code` +
    `&current=weather_code,wind_speed_10m,wind_gusts_10m,temperature_2m,precipitation` +
    `&timezone=auto&forecast_days=3`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ModelCast/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return alerts;

  const data: OpenMeteoResponse = await res.json();
  const daily = data.daily;
  if (!daily || !daily.time) return alerts;

  const now = new Date().toISOString();

  // Check each forecast day for severe conditions
  for (let i = 0; i < daily.time.length; i++) {
    const day = daily.time[i];
    const precip = daily.precipitation_sum?.[i] ?? 0;
    const precipProb = daily.precipitation_probability_max?.[i] ?? 0;
    const windMax = daily.wind_speed_10m_max?.[i] ?? 0;
    const gustMax = daily.wind_gusts_10m_max?.[i] ?? 0;
    const tempMax = daily.temperature_2m_max?.[i] ?? 0;
    const weatherCode = daily.weather_code?.[i] ?? 0;
    const dayLabel = i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(day + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

    // Heavy rain alert: >20mm precipitation or weather code indicates heavy rain
    if (precip >= 20 || isHeavyRain(weatherCode)) {
      const isExtreme = precip >= 50;
      const severity = isExtreme ? "extreme" : precip >= 35 ? "severe" : "moderate";
      alerts.push({
        id: `rain-${day}`,
        area: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        alertType: `Heavy Rain Warning`,
        severity,
        certainty: "Likely",
        onset: `${day}T00:00:00Z`,
        expires: `${day}T23:59:59Z`,
        description: `${dayLabel}: Expected precipitation of ${precip.toFixed(1)} mm with ${precipProb}% probability of rain. ${WMO_CODE_DESC[weatherCode] ?? "Heavy rainfall expected"}. This may cause flash flooding in low-lying areas and near waterways.`,
        instruction: "People in the affected areas should beware of heavy to very heavy rains and accumulation that may cause flash floods, overflows, and landslides. Avoid crossing flooded roads and stay away from waterways during heavy rainfall.",
        source: "Generated from Open-Meteo forecast data",
      });
    }

    // Thunderstorm alert
    if (isThunderstorm(weatherCode)) {
      alerts.push({
        id: `storm-${day}`,
        area: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        alertType: "Thunderstorm Warning",
        severity: "severe",
        certainty: "Likely",
        onset: `${day}T00:00:00Z`,
        expires: `${day}T23:59:59Z`,
        description: `${dayLabel}: Thunderstorms expected with possible hail and strong winds. Weather code: ${WMO_CODE_DESC[weatherCode] ?? "Thunderstorm"}. Wind gusts may reach ${gustMax.toFixed(0)} km/h.`,
        instruction: "Stay indoors during thunderstorms. Avoid open areas, tall trees, and metal objects. Unplug sensitive electronics.",
        source: "Generated from Open-Meteo forecast data",
      });
    }

    // Strong wind alert: gusts > 60 km/h
    if (gustMax >= 60) {
      alerts.push({
        id: `wind-${day}`,
        area: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        alertType: "Strong Wind Warning",
        severity: gustMax >= 90 ? "severe" : "moderate",
        certainty: "Likely",
        onset: `${day}T00:00:00Z`,
        expires: `${day}T23:59:59Z`,
        description: `${dayLabel}: Wind gusts up to ${gustMax.toFixed(0)} km/h expected. Sustained winds may reach ${windMax.toFixed(0)} km/h.`,
        instruction: "Secure loose objects outdoors. Avoid outdoor activities that could be dangerous in high winds. Small craft should remain in port.",
        source: "Generated from Open-Meteo forecast data",
      });
    }

    // Extreme heat alert: max temp > 40°C
    if (tempMax >= 40) {
      alerts.push({
        id: `heat-${day}`,
        area: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        alertType: "Extreme Heat Warning",
        severity: tempMax >= 43 ? "extreme" : "severe",
        certainty: "Likely",
        onset: `${day}T00:00:00Z`,
        expires: `${day}T23:59:59Z`,
        description: `${dayLabel}: Maximum temperature of ${tempMax.toFixed(0)}°C expected. Extreme heat can be dangerous.`,
        instruction: "Stay hydrated, avoid outdoor activities during peak heat hours (11:00-15:00), wear light clothing, and check on vulnerable individuals.",
        source: "Generated from Open-Meteo forecast data",
      });
    }
  }

  // Check current conditions for immediate alerts
  if (data.current) {
    const cur = data.current;
    if (isThunderstorm(cur.weather_code)) {
      alerts.unshift({
        id: "storm-now",
        area: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        alertType: "Thunderstorm Warning",
        severity: "severe",
        certainty: "Observed",
        onset: now,
        expires: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
        description: `Active thunderstorm detected at current time. Conditions: ${WMO_CODE_DESC[cur.weather_code] ?? "Thunderstorm"}. Wind: ${cur.wind_speed_10m?.toFixed(0) ?? 0} km/h, gusts: ${cur.wind_gusts_10m?.toFixed(0) ?? 0} km/h.`,
        instruction: "Stay indoors. Avoid open areas and tall objects. Unplug sensitive electronics.",
        source: "Generated from Open-Meteo current conditions",
      });
    }
  }

  return alerts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");

    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: "Missing lat or lon parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    // Determine if location is in Thailand (rough bounding box)
    const inThailand = latNum >= 5 && latNum <= 21 && lonNum >= 97 && lonNum <= 106;

    // Run both fetches in parallel
    const [forecastAlerts, tmdWarning] = await Promise.all([
      generateAlertsFromForecast(latNum, lonNum),
      inThailand ? fetchTMDWarning() : Promise.resolve(null),
    ]);

    const alerts: GeneratedAlert[] = [...forecastAlerts];

    // If we got a TMD warning, add it as the first alert
    if (tmdWarning) {
      alerts.unshift({
        id: "tmd-official",
        area: "Thailand",
        alertType: tmdWarning.title,
        severity: "severe",
        certainty: "Observed",
        onset: new Date().toISOString(),
        expires: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        description: tmdWarning.description,
        instruction: "People in the affected areas should beware of heavy rains and accumulation that may cause flash floods. Follow updates from the Thai Meteorological Department.",
        source: "Thai Meteorological Department (tmd.go.th)",
      });
    }

    return new Response(
      JSON.stringify({ alerts, count: alerts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, alerts: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
