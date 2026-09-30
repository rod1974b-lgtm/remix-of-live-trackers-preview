import { Star, X, MapPin } from 'lucide-react';
import type { GeoLocation } from '@/modelcast/lib/types';

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
  const canAdd = currentLocation && !isFavorite(currentLocation.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
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
        return (
          <div
            key={fav.id}
            className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <button
              onClick={() => onSelect(fav)}
              className="flex items-center gap-1.5"
            >
              <MapPin size={12} className={active ? 'text-sky-400' : 'text-slate-400'} />
              <span className="max-w-[140px] truncate">{fav.name}</span>
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
