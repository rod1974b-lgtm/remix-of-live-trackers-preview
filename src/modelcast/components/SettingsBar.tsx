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
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* Units Switcher: Compact '°C / °F' on phones, full 'Metric / Imperial' on PC */}
      <div className="flex rounded-lg border border-slate-700/60 bg-slate-800/60 p-0.5">
        <button
          onClick={() => setUnits('metric')}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-all sm:px-3 sm:py-1.5 sm:text-sm ${
            units === 'metric'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Metric (°C, km/h, mm)"
        >
          <Thermometer size={14} className="hidden sm:inline" />
          <span className="sm:hidden font-bold">°C</span>
          <span className="hidden sm:inline">{t('metric')}</span>
        </button>
        <button
          onClick={() => setUnits('us')}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-all sm:px-3 sm:py-1.5 sm:text-sm ${
            units === 'us'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Imperial (°F, mph, in)"
        >
          <span className="sm:hidden font-bold">°F</span>
          <span className="hidden sm:inline">{t('imperial')}</span>
        </button>
      </div>

      {/* Language Dropdown: Compact flag on mobile, full button on desktop */}
      <div ref={langRef} className="relative">
        <button
          onClick={() => setLangOpen(!langOpen)}
          className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
          title="Change language"
        >
          <Globe size={13} className="hidden sm:inline" />
          <span className="font-medium text-xs sm:text-sm">{currentLang?.flag}</span>
          <ChevronDown size={13} className={`transition-transform duration-200 ${langOpen ? 'rotate-180' : ''}`} />
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
                    ? 'bg-sky-500/15 text-sky-300 font-semibold'
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
