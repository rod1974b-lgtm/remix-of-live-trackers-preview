import { useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Sun,
  Droplets,
  Wind,
  Gauge,
  Thermometer,
  HelpCircle,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CurrentWeather } from '@/modelcast/lib/types';
import { getWeatherCodeInfo } from '@/modelcast/lib/weatherCodes';
import { useSettings } from '@/modelcast/lib/settings';
import {
  formatTemp,
  formatTempWithUnit,
  formatWind,
  formatPrecip,
  formatPressure,
} from '@/modelcast/lib/units';

const ICON_MAP: Record<string, LucideIcon> = {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudLightning,
  CloudOff,
};

function WeatherIcon({ code, size = 64, className }: { code: number; size?: number; className?: string }) {
  const info = getWeatherCodeInfo(code);
  const Icon = ICON_MAP[info.icon] ?? Cloud;
  return <Icon size={size} className={className} />;
}

// Plain-English meteorological explanations for weather codes, dynamically scaled to active units
function getWeatherCodeExplanation(code: number, units: 'metric' | 'us' = 'metric'): { title: string; cues: string; advice: string } {
  const isUs = units === 'us';

  if (code === 0 || code === 1) {
    return {
      title: 'Clear / Mainly Clear Sky',
      cues: 'Minimal to zero clouds. Sunlight and shadows are strong and sharp.',
      advice: 'High UV exposure. Wear sunglasses and stay hydrated under midday sun.',
    };
  }
  if (code === 2) {
    return {
      title: 'Partly Cloudy',
      cues: 'Scattered puffy clouds covering 25% to 50% of the sky with plenty of sunshine.',
      advice: 'Pleasant outdoor conditions with occasional cloud cover offering shade.',
    };
  }
  if (code === 3) {
    return {
      title: 'Overcast Sky',
      cues: 'A continuous thick sheet of grey or white clouds hiding the sun completely.',
      advice: 'No direct sunburn risk, but warm air and humidity can feel trapped.',
    };
  }
  if (code === 45 || code === 48) {
    return {
      title: 'Fog / Mist',
      cues: `Suspended water droplets close to the ground cutting visibility to under ${isUs ? '0.6 miles' : '1 km'}.`,
      advice: 'Use low-beam headlights or fog lamps. Watch for damp, slick roads.',
    };
  }
  if (code >= 51 && code <= 57) {
    return {
      title: 'Drizzle (Misty Rain)',
      cues: 'Very fine, light droplets that float in the air. Dampens pavement without pooling.',
      advice: `Rain rate is under ${isUs ? '0.04 in/h' : '1 mm/h'}. Intermittent wipers are sufficient; no heavy puddles.`,
    };
  }
  if (code === 61 || code === 80) {
    return {
      title: 'Light Rain / Light Showers',
      cues: 'Individual drops clearly felt and seen. Puddles form very slowly on the pavement.',
      advice: `Rain rate is ~${isUs ? '0.04 to 0.10 in/h' : '1 to 2.5 mm/h'}. Intermittent wipers; roads become slick with oil residue.`,
    };
  }
  if (code === 63 || code === 81) {
    return {
      title: 'Moderate Rain',
      cues: 'Steady, continuous downpour. Small puddles form quickly, hum of rain is loud on roofs.',
      advice: `Rain rate is ${isUs ? '0.10 to 0.40 in/h' : '2.5 to 10 mm/h'}. Normal wipers on continuous speed; shoes will get soaked.`,
    };
  }
  if (code === 65 || code === 82 || code === 67) {
    return {
      title: 'Heavy / Torrential Rain',
      cues: `Rain cascades in thick sheets. Visibility drops below ${isUs ? '0.6 miles' : '1 km'}; curbs and gutters overflow.`,
      advice:
        `Rain rate exceeds ${isUs ? '0.60–1.00 in/h' : '15–25 mm/h'}. Tipping rain gauges frequently undercount downpours due to splash-out and wind. High risk of flash flooding on low-lying roads within 15 minutes.`,
    };
  }
  if (code >= 95) {
    return {
      title: 'Thunderstorm / Lightning Squall',
      cues: 'Rumbles of thunder, cloud-to-ground lightning flashes, sudden sharp gusts of wind.',
      advice:
        'Dangerous lightning risk. Seek shelter immediately inside an enclosed building or vehicle. Stay away from open fields and tall metal structures.',
    };
  }
  return {
    title: 'Current Weather Condition',
    cues: 'Observed atmospheric state from local radar and ground sensors.',
    advice: 'Keep checking live radar if conditions change quickly.',
  };
}

interface CurrentWeatherCardProps {
  weather: CurrentWeather;
  locationName: string;
  country?: string;
}

export function CurrentWeatherCard({ weather, locationName, country }: CurrentWeatherCardProps) {
  const { t, units } = useSettings();
  const info = getWeatherCodeInfo(weather.weatherCode);

  // Explanation Modal State
  const [explanation, setExplanation] = useState<{
    title: string;
    value?: string;
    cues: string;
    advice: string;
  } | null>(null);

  // Click handler for condition and temperature
  const handleConditionClick = () => {
    const details = getWeatherCodeExplanation(weather.weatherCode, units);
    setExplanation({
      title: `${info.label} (${formatTempWithUnit(weather.temperature, units)})`,
      cues: details.cues,
      advice: details.advice,
    });
  };

  const handleFeelsLikeClick = () => {
    setExplanation({
      title: `Feels Like ${formatTempWithUnit(weather.apparentTemperature, units)}`,
      cues: 'Apparent temperature is calculated by combining air temperature, humidity, and wind speed.',
      advice:
        weather.apparentTemperature > weather.temperature
          ? 'High humidity slows down your body’s sweat evaporation, making the air feel warmer and more stifling than the thermometer reads.'
          : 'Brisk wind evaporates moisture rapidly off your skin, making the air feel cooler than the actual temperature.',
    });
  };

  const handleHumidityClick = () => {
    setExplanation({
      title: `Humidity: ${weather.humidity}%`,
      cues: 'Relative humidity measures how saturated the air is with water vapor compared to the maximum it can hold at this temperature.',
      advice:
        weather.humidity >= 70
          ? 'High moisture in the air. Sweat evaporates slowly, making you feel sticky, sweaty, and heavier.'
          : weather.humidity <= 40
            ? 'Dry air. Sweat evaporates fast, skin and lips may feel dry; stay hydrated.'
            : 'Comfortable balance for outdoor activities.',
    });
  };

  const handleWindClick = () => {
    const speed = weather.windSpeed;
    const isUs = units === 'us';
    const strongThreshold = isUs ? 18.6 : 30;
    const modThreshold = isUs ? 9.3 : 15;

    setExplanation({
      title: `Wind: ${formatWind(speed, units, 1)}`,
      cues:
        speed > strongThreshold
          ? 'Strong breeze / squalls. Tree branches sway continuously, dust and loose paper fly.'
          : speed > modThreshold
            ? 'Moderate breeze. Leaves and small twigs in constant motion, flags extended.'
            : 'Light breeze. Barely felt on your face; smoke drifts gently with the air.',
      advice:
        speed > strongThreshold
          ? 'Umbrellas are difficult to control and may flip. Motorcyclists should beware of sudden side gusts.'
          : 'Safe and comfortable wind conditions.',
    });
  };

  const handlePressureClick = () => {
    const p = weather.pressure;
    const isUs = units === 'us';
    const lowBoundary = isUs ? '29.77 inHg' : '1008 hPa';
    const highBoundary = isUs ? '29.94 inHg' : '1014 hPa';

    setExplanation({
      title: `Barometric Pressure: ${formatPressure(p, units)}`,
      cues: 'Atmospheric pressure is the physical weight of the column of air pressing down on the ground.',
      advice:
        p < 1008
          ? `Low pressure system (< ${lowBoundary}). Rising air often pulls in moisture, clouds, squalls, and tropical storms.`
          : p > 1014
            ? `High pressure system (> ${highBoundary}). Sinking air suppresses storm development, leading to stable, calmer skies.`
            : `Normal sea-level pressure range (${lowBoundary} – ${highBoundary}).`,
    });
  };

  const handlePrecipClick = () => {
    const precip = weather.precipitation;
    const isUs = units === 'us';
    const heavyThreshold = isUs ? '0.6 in/h' : '15 mm/h';
    const modThreshold = isUs ? '0.08 in/h' : '2 mm/h';

    setExplanation({
      title: `Precipitation: ${formatPrecip(precip, units, 1)}`,
      cues:
        precip > 15
          ? `Heavy to extreme rain (> ${heavyThreshold}). Fast sheet runoff on roads, large spray behind tires.`
          : precip > 2
            ? `Moderate rain (> ${modThreshold}). Continuous puddles and wet streets.`
            : precip > 0
              ? 'Light rain or drizzle. Wet pavement with minimal road pooling.'
              : 'Zero measurable rain currently at this station.',
      advice:
        'Why gauges struggle: In heavy tropical storms, rain drops splash out of automated gauges, and high winds blow rain sideways over the gauge opening, often undercounting real rainfall by 15% to 25%.',
    });
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-700/50 bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-sky-900/30 p-6 sm:p-8">
      {/* Background Icon */}
      <div className="pointer-events-none absolute -right-12 -top-12 opacity-10">
        <WeatherIcon code={weather.weatherCode} size={200} />
      </div>

      {/* Tap hint banner */}
      <div className="relative mb-3 flex items-center gap-1.5 text-xs text-sky-400">
        <HelpCircle size={14} />
        <span>Tap any weather stat for a plain English explanation</span>
      </div>

      {/* Main Condition Header (Clickable) */}
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div
          onClick={handleConditionClick}
          className="group -m-2 cursor-pointer rounded-2xl p-2 transition hover:bg-slate-700/30"
          title="Click for condition explanation"
        >
          <p className="text-sm font-medium uppercase tracking-wider text-sky-400">
            {t('currentConditions')}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {locationName}
            {country ? <span className="text-lg font-normal text-slate-400"> · {country}</span> : null}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-slate-300 font-medium group-hover:text-sky-300 transition">{info.label}</p>
            <span className="text-[10px] text-sky-400 opacity-0 group-hover:opacity-100 transition">💡 tap to explain</span>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <span className="text-6xl font-extralight text-white">
              {formatTemp(weather.temperature, units)}
            </span>
            <span className="mb-2 text-2xl font-light text-slate-400">
              {units === 'us' ? '°F' : '°C'}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleFeelsLikeClick();
            }}
            className="mt-1 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-sky-300 transition text-left"
          >
            <span>{t('feelsLike')} {formatTempWithUnit(weather.apparentTemperature, units)}</span>
            <span className="text-xs text-sky-400">ℹ️</span>
          </button>
        </div>

        {/* Big Weather Icon (Clickable) */}
        <div
          onClick={handleConditionClick}
          className="flex shrink-0 cursor-pointer items-center justify-center transition hover:scale-105"
          title="Click for condition explanation"
        >
          <div className="rounded-3xl bg-sky-500/10 p-6 shadow-inner ring-1 ring-sky-400/20">
            <WeatherIcon code={weather.weatherCode} size={72} className="text-sky-300" />
          </div>
        </div>
      </div>

      {/* Interactive Metric Cards */}
      <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={<Droplets size={18} />}
          label={t('humidity')}
          value={`${weather.humidity}%`}
          onClick={handleHumidityClick}
        />
        <Metric
          icon={<Wind size={18} />}
          label={t('wind')}
          value={formatWind(weather.windSpeed, units, 1)}
          onClick={handleWindClick}
        />
        <Metric
          icon={<Gauge size={18} />}
          label={t('pressure')}
          value={formatPressure(weather.pressure, units)}
          onClick={handlePressureClick}
        />
        <Metric
          icon={<Thermometer size={18} />}
          label={t('precip')}
          value={formatPrecip(weather.precipitation, units, 1)}
          onClick={handlePrecipClick}
        />
      </div>

      {/* Explanation Popup Card */}
      {explanation && (
        <div className="relative mt-5 animate-in fade-in slide-in-from-top-2 duration-200 rounded-2xl border border-sky-500/40 bg-slate-900/95 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-700/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">💡</span>
              <h4 className="font-bold text-sky-300 text-sm sm:text-base">{explanation.title}</h4>
            </div>
            <button
              onClick={() => setExplanation(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 space-y-2 text-xs sm:text-sm">
            <p className="text-slate-200">
              <strong className="text-sky-400">👀 What it looks/feels like:</strong> {explanation.cues}
            </p>
            <p className="text-slate-400">
              <strong className="text-amber-400">🚗 Real-world impact:</strong> {explanation.advice}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col text-left rounded-2xl bg-slate-800/60 p-3 transition hover:bg-slate-700/50 hover:ring-1 hover:ring-sky-400/40 cursor-pointer"
      title={`Click for simple explanation of ${label}`}
    >
      <div className="flex items-center justify-between w-full text-slate-400 group-hover:text-sky-300 transition">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <span className="text-[10px] opacity-0 group-hover:opacity-100 transition text-sky-400">?</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-slate-100 group-hover:text-white transition">{value}</p>
    </button>
  );
}
