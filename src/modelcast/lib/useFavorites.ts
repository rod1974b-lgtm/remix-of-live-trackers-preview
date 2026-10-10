import { useCallback, useEffect, useState } from 'react';
import type { GeoLocation } from '@/modelcast/lib/types';

const STORAGE_KEY = 'modelcast:favorites';

function encodeFavorites(list: GeoLocation[]): string {
  return list
    .map((f) =>
      [
        f.id,
        encodeURIComponent(f.name ?? ''),
        f.latitude,
        f.longitude,
        encodeURIComponent(f.country ?? ''),
        encodeURIComponent(f.timezone ?? ''),
        encodeURIComponent((f as { country_code?: string }).country_code ?? ''),
      ].join(':'),
    )
    .join('|');
}

function decodeFavorites(raw: string): GeoLocation[] {
  const out: GeoLocation[] = [];
  for (const chunk of raw.split('|')) {
    const parts = chunk.split(':');
    if (parts.length < 4) continue;
    const id = Number(parts[0]);
    const latitude = Number(parts[2]);
    const longitude = Number(parts[3]);
    if (!Number.isFinite(id) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    out.push({
      id,
      name: decodeURIComponent(parts[1] ?? ''),
      latitude,
      longitude,
      country: decodeURIComponent(parts[4] ?? ''),
      timezone: decodeURIComponent(parts[5] ?? ''),
      country_code: decodeURIComponent(parts[6] ?? ''),
    } as GeoLocation);
  }
  return out;
}

function syncFavoritesToUrl(list: GeoLocation[]) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (list.length > 0) url.searchParams.set('favs', encodeFavorites(list));
    else url.searchParams.delete('favs');
    window.history.replaceState(null, '', url.toString());
  } catch {
    // ignore
  }
}

function writeStorage(list: GeoLocation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<GeoLocation[]>([]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('favs');
      if (fromUrl) {
        const parsed = decodeFavorites(fromUrl);
        if (parsed.length > 0) {
          setFavorites(parsed);
          writeStorage(parsed);
          return;
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GeoLocation[];
        setFavorites(parsed);
        syncFavoritesToUrl(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const addFavorite = useCallback((loc: GeoLocation) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === loc.id)) return prev;
      const next = [...prev, loc];
      writeStorage(next);
      setTimeout(() => syncFavoritesToUrl(next), 0);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id);
      writeStorage(next);
      setTimeout(() => syncFavoritesToUrl(next), 0);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: number) => favorites.some((f) => f.id === id),
    [favorites],
  );

  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      return true;
    } catch {
      return false;
    }
  }, []);

  const exportBackup = useCallback(async () => {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        favorites,
        settings: {
          units: localStorage.getItem('modelcast:units') ?? 'metric',
          language: localStorage.getItem('modelcast:language') ?? 'en',
          lastLocation: localStorage.getItem('modelcast:last-location'),
          logs: localStorage.getItem('modelcast:logs'),
        },
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const fileName = `modelcast-backup-${new Date().toISOString().slice(0, 10)}.json`;

      // Copy to clipboard as quick safety backup
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(jsonStr);
        }
      } catch {
        // ignore clipboard error
      }

      // 1. Mobile Phone Share Sheet (Compatible with Google Drive "Save to Drive")
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          // Note: using text/plain ensures Android & iOS share sheets display "Google Drive"
          const file = new File([jsonStr], fileName, { type: 'text/plain;charset=utf-8' });
          if (
            typeof navigator.canShare === 'function' &&
            navigator.canShare({ files: [file] })
          ) {
            await navigator.share({
              files: [file],
              title: 'ModelCast Backup',
              text: 'Save ModelCast backup to Google Drive',
            });
            return true;
          }

          // Fallback share with text content directly to Drive
          await navigator.share({
            title: 'ModelCast Backup',
            text: jsonStr,
          });
          return true;
        } catch (err: unknown) {
          if ((err as { name?: string })?.name === 'AbortError') {
            return false;
          }
        }
      }

      // 2. Desktop Save As file picker (lets you pick Google Drive synced folder)
      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          const filePicker = (window as unknown as {
            showSaveFilePicker: (opts: {
              suggestedName: string;
              types: Array<{ description: string; accept: Record<string, string[]> }>;
            }) => Promise<{ createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;
          }).showSaveFilePicker;

          const handle = await filePicker({
            suggestedName: fileName,
            types: [
              {
                description: 'JSON Backup File',
                accept: { 'application/json': ['.json'], 'text/plain': ['.json', '.txt'] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          return true;
        } catch (err: unknown) {
          if ((err as { name?: string })?.name === 'AbortError') {
            return false;
          }
        }
      }

      // 3. Fallback direct download
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }, 2500);
      return true;
    } catch {
      return false;
    }
  }, [favorites]);

  const restoreBackup = useCallback((jsonContent: string) => {
    try {
      const data = JSON.parse(jsonContent);
      const list = Array.isArray(data?.favorites) ? (data.favorites as GeoLocation[]) : null;
      if (!list) return false;
      setFavorites(list);
      writeStorage(list);
      syncFavoritesToUrl(list);
      const s = data.settings ?? {};
      if (s.units === 'metric' || s.units === 'us') localStorage.setItem('modelcast:units', s.units);
      if (typeof s.language === 'string') localStorage.setItem('modelcast:language', s.language);
      if (typeof s.lastLocation === 'string' && s.lastLocation)
        localStorage.setItem('modelcast:last-location', s.lastLocation);
      if (typeof s.logs === 'string' && s.logs) localStorage.setItem('modelcast:logs', s.logs);
      return true;
    } catch {
      return false;
    }
  }, []);

  const importBackup = useCallback(
    async (fileOrText: File | string) => {
      try {
        const text = typeof fileOrText === 'string' ? fileOrText : await fileOrText.text();
        const success = restoreBackup(text);
        if (success) {
          if (typeof window !== 'undefined') {
            window.alert('Backup restored successfully!');
            window.location.reload();
          }
          return true;
        }
        if (typeof window !== 'undefined') {
          window.alert('Invalid backup file. Please check the file and try again.');
        }
        return false;
      } catch {
        if (typeof window !== 'undefined') {
          window.alert('Could not read backup file.');
        }
        return false;
      }
    },
    [restoreBackup],
  );

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    copyShareLink,
    shareUrl: copyShareLink,
    exportBackup,
    restoreBackup,
    importBackup,
  };
}
