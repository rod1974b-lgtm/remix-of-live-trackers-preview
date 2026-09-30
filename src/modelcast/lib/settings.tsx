import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Language, TFunc } from './translations';
import { translate } from './translations';
import type { UnitSystem } from './units';

interface SettingsContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
  t: TFunc;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const LANG_KEY = 'modelcast:language';
const UNITS_KEY = 'modelcast:units';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && ['en', 'es', 'fr', 'de', 'ja', 'zh'].includes(saved)) return saved as Language;
    } catch {}
    return 'en';
  });

  const [units, setUnitsState] = useState<UnitSystem>(() => {
    try {
      const saved = localStorage.getItem(UNITS_KEY);
      if (saved === 'metric' || saved === 'us') return saved;
    } catch {}
    return 'metric';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  };

  const setUnits = (u: UnitSystem) => {
    setUnitsState(u);
    try { localStorage.setItem(UNITS_KEY, u); } catch {}
  };

  const t = (key: string, params?: Record<string, string | number>) =>
    translate(language, key, params);

  return (
    <SettingsContext.Provider value={{ language, setLanguage, units, setUnits, t }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
