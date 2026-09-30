import { useCallback, useEffect, useState } from 'react';
import type { GeoLocation } from '@/modelcast/lib/types';

const STORAGE_KEY = 'modelcast:favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<GeoLocation[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setFavorites(JSON.parse(raw) as GeoLocation[]);
    } catch {
      // ignore
    }
  }, []);

  const persist = (next: GeoLocation[]) => {
    setFavorites(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const addFavorite = useCallback(
    (loc: GeoLocation) => {
      setFavorites((prev) => {
        if (prev.some((f) => f.id === loc.id)) return prev;
        persist([...prev, loc]);
        return [...prev, loc];
      });
    },
    [],
  );

  const removeFavorite = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: number) => favorites.some((f) => f.id === id),
    [favorites],
  );

  return { favorites, addFavorite, removeFavorite, isFavorite };
}
