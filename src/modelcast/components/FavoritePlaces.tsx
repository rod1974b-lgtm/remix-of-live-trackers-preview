import { useEffect, useState } from 'react';
import { Star, X, MapPin } from 'lucide-react';
import type { GeoLocation } from '@/modelcast/lib/types';
import { useSettings } from '@/modelcast/lib/settings';
import { formatTempWithUnit } from '@/modelcast/lib/units';

interface FavoritePlacesProps {
  favorites: GeoLocation[];
  currentLocation: GeoLocation | null;
  isFavorite: (id: number) => boolean;
  onAdd: (loc: GeoLocation) => void;
  onRemove: (id: number) => void;
  onSelect: (loc: GeoLocation) => void;
}

export function FavoritePlaces({
  favorites,
  currentLocation,
  isFavorite,
  onAdd,
  onRemove,
  onSelect,
}: FavoritePlacesProps) {
  const { units } = useSettings();
  const [temperatures, setTemperatures] = useState<Record<number, number>>({});
  const canAdd = currentLocation && !isFavorite(currentLocation.id);

  useEffect(() => {
    if (favorites.length === 0) return;
    let cancelled = false;

    async function loadTemps() {
      const updates: Record<number, number> = {};
      await Promise.all(
        favorites.map(async (fav) => {
          try {
            const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${fav.latitude}&longitude=${fav.longitude}&current=temperature_2m`,
            );
            if (!res.ok) return;
            const data = await res.json();
            if (typeof data?.current?.temperature_2m === 'number') {
              updates[fav.id] = data.current.temperature_2m;
            }
          } catch {
            // ignore individual failures
          }
        }),
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setTemperatures((prev) => ({ ...prev, ...updates }));
      }
    }

    void loadTemps();
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {canAdd && (
        <button
          onClick={() => onAdd(currentLocation!)}
          className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/25"
        >
          <Star size={14} className="fill-amber-400 text-amber-400" />
          Save to Favorites
        </button>
      )}

      {favorites.map((fav) => {
        const active = currentLocation?.id === fav.id;
        const temp = temperatures[fav.id];
        return (
          <div
            key={fav.id}
            className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <button onClick={() => onSelect(fav)} className="flex items-center gap-1.5">
              <MapPin size={12} className={active ? 'text-sky-400' : 'text-slate-400'} />
              <span className="max-w-[140px] truncate">{fav.name}</span>
              {temp !== undefined && (
                <span
                  className={`ml-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    active ? 'bg-sky-500/30 text-sky-100' : 'bg-slate-700/80 text-slate-300'
                  }`}
                >
                  {formatTempWithUnit(temp, units)}
                </span>
              )}
            </button>
            <button
              onClick={() => onRemove(fav.id)}
              className="ml-0.5 rounded-full p-0.5 text-slate-500 transition-colors hover:bg-red-500/20 hover:text-red-400"
              aria-label={`Remove ${fav.name} from favorites`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
