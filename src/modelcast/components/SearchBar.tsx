// @ts-nocheck -- imported Bolt code, written for a looser TS config
import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, Loader2, X } from 'lucide-react';
import type { GeoLocation } from '@/modelcast/lib/types';
import { searchLocations } from '@/modelcast/lib/weatherApi';
import { useSettings } from '@/modelcast/lib/settings';

interface SearchBarProps {
  onSelect: (location: GeoLocation) => void;
  currentLocation?: GeoLocation | null;
}

export function SearchBar({ onSelect, currentLocation }: SearchBarProps) {
  const { t, language } = useSettings();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const locations = await searchLocations(query, language);
        setResults(locations);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [query, language]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (loc: GeoLocation) => {
    onSelect(loc);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          size={20}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-2xl border border-slate-700/60 bg-slate-800/60 py-3.5 pl-12 pr-10 text-base text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-sky-500/60 focus:bg-slate-800 focus:ring-2 focus:ring-sky-500/20"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-200"
          >
            <X size={18} />
          </button>
        )}
        {loading && (
          <Loader2
            className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-sky-400"
            size={18}
          />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800 shadow-2xl shadow-black/40">
          {results.map((loc, i) => (
            <button
              key={loc.id}
              onClick={() => handleSelect(loc)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                i === activeIndex ? 'bg-sky-500/15' : 'hover:bg-slate-700/40'
              }`}
            >
              <MapPin size={16} className="shrink-0 text-sky-400" />
              <div className="min-w-0">
                <span className="block truncate font-medium text-slate-100">
                  {loc.name}
                  {loc.admin1 ? `, ${loc.admin1}` : ''}
                </span>
                <span className="block truncate text-sm text-slate-400">
                  {loc.country}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {currentLocation && !open && (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
          <MapPin size={14} className="text-sky-400" />
          <span className="font-medium text-slate-300">
            {currentLocation.name}
            {currentLocation.admin1 ? `, ${currentLocation.admin1}` : ''}
          </span>
          <span>· {currentLocation.country}</span>
        </div>
      )}
    </div>
  );
}
