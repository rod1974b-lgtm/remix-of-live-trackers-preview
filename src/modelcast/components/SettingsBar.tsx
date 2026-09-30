import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Thermometer } from 'lucide-react';
import { useSettings } from '@/modelcast/lib/settings';
import { LANGUAGES, type Language } from '@/modelcast/lib/translations';

export function SettingsBar() {
  const { language, setLanguage, units, setUnits, t } = useSettings();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentLang = LANGUAGES.find((l) => l.code === language);

  return (
    <div className="flex items-center gap-2">
      {}
      <div className="flex rounded-lg border border-slate-700/60 bg-slate-800/60 p-0.5">
        <button
          onClick={() => setUnits('metric')}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all sm:px-3 sm:py-1.5 sm:text-sm ${
            units === 'metric'
              ? 'bg-sky-500 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Thermometer size={14} />
          {t('metric')}
        </button>
        <button
          onClick={() => setUnits('us')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all sm:px-3 sm:py-1.5 sm:text-sm ${
            units === 'us'
              ? 'bg-sky-500 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('imperial')}
        </button>
      </div>

      {}
      <div ref={langRef} className="relative">
        <button
          onClick={() => setLangOpen(!langOpen)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 sm:px-3 sm:text-sm"
        >
          <Globe size={14} />
          <span className="font-medium">{currentLang?.flag}</span>
          <ChevronDown size={14} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
        </button>

        {langOpen && (
          <div className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800 shadow-2xl shadow-black/40">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code as Language);
                  setLangOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  language === lang.code
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'text-slate-300 hover:bg-slate-700/40'
                }`}
              >
                <span className="w-6 text-xs font-bold">{lang.flag}</span>
                {lang.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
