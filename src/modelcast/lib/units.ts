export type UnitSystem = 'metric' | 'us';

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function mmToInches(mm: number): number {
  return mm * 0.0393701;
}

export function hpaToInhg(hpa: number): number {
  return hpa * 0.02953;
}

export function formatTemp(c: number | null, units: UnitSystem, decimals = 0): string {
  if (c === null || c === undefined) return '—';
  if (units === 'us') return (cToF(c)).toFixed(decimals);
  return c.toFixed(decimals);
}

export function formatTempWithUnit(c: number | null, units: UnitSystem, decimals = 0): string {
  const symbol = units === 'us' ? '°F' : '°C';
  return `${formatTemp(c, units, decimals)}${symbol}`;
}

export function formatWind(kmh: number | null, units: UnitSystem, decimals = 0): string {
  if (kmh === null || kmh === undefined) return '—';
  if (units === 'us') return `${kmhToMph(kmh).toFixed(decimals)} mph`;
  return `${kmh.toFixed(decimals)} km/h`;
}

export function formatPrecip(mm: number | null, units: UnitSystem, decimals = 1): string {
  if (mm === null || mm === undefined) return '—';
  if (units === 'us') return `${mmToInches(mm).toFixed(decimals + 1)} in`;
  return `${mm.toFixed(decimals)} mm`;
}

export function formatPressure(hpa: number | null, units: UnitSystem): string {
  if (hpa === null || hpa === undefined) return '—';
  if (units === 'us') return `${hpaToInhg(hpa).toFixed(2)} inHg`;
  return `${Math.round(hpa)} hPa`;
}

export function tempUnitLabel(units: UnitSystem): string {
  return units === 'us' ? '°F' : '°C';
}

export function windUnitLabel(units: UnitSystem): string {
  return units === 'us' ? 'mph' : 'km/h';
}

export function precipUnitLabel(units: UnitSystem): string {
  return units === 'us' ? 'in' : 'mm';
}
