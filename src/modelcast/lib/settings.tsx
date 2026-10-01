import { createContext, useContext, useState, type ReactNode } from 'react';
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

// Keep a single context instance across hot reloads so provider and consumers always match.
const g = globalThis as unknown as { __modelcastSettingsCtx?: React.Context<SettingsContextValue | null> };
const SettingsContext =
  g.__modelcastSettingsCtx ?? (g.__modelcastSettingsCtx = createContext<SettingsContextValue | null>(null));

const LANG_KEY = 'modelcast:language';
const UNITS_KEY = 'modelcast:units';
const VALID_LANGS = ['en', 'es', 'fr', 'de', 'ja', 'zh'];

function updateUrlParam(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.history.replaceState(null, '', url.toString());
  } catch {
    // ignore
  }
}

function getInitialLanguage(): Language {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlLang = params.get('lang');
      if (urlLang && VALID_LANGS.includes(urlLang)) return urlLang as Language;
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && VALID_LANGS.includes(saved)) return saved as Language;
    } catch {
      // ignore
    }
  }
  return 'en';
}

function getInitialUnits(): UnitSystem {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlUnits = params.get('units');
      if (urlUnits === 'metric' || urlUnits === 'us') return urlUnits;
      const saved = localStorage.getItem(UNITS_KEY);
      if (saved === 'metric' || saved === 'us') return saved;
    } catch {
      // ignore
    }
  }
  return 'metric';
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const [units, setUnitsState] = useState<UnitSystem>(getInitialUnits);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore
    }
    updateUrlParam('lang', lang);
  };

  const setUnits = (u: UnitSystem) => {
    setUnitsState(u);
    try {
      localStorage.setItem(UNITS_KEY, u);
    } catch {
      // ignore
    }
    updateUrlParam('units', u);
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
