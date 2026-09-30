// @ts-nocheck -- imported Bolt code, written for a looser TS config
export function formatHour(isoTime: string): string {
  const d = new Date(isoTime);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: true,
  });
}

export function formatDate(isoTime: string): string {
  const d = new Date(isoTime);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDayName(isoTime: string): string {
  const d = new Date(isoTime);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function round(n: number | null, decimals = 0): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(decimals);
}

export function getHourIndex(times: string[]): number {
  const now = new Date();
  let closest = 0;
  let minDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - now.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  }
  return closest;
}

export function isToday(isoTime: string): boolean {
  const d = new Date(isoTime);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
