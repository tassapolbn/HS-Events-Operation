import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Dict } from './en';
import { th } from './th';
import type { Lang } from '../lib/utils';
import type { Department } from '../types';

type DeepKeys<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${DeepKeys<T[K]>}`;
    }[keyof T & string];

export type TKey = DeepKeys<Dict>;

const dictionaries: Record<Lang, Dict> = { en, th };

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey) => string;
  /** Department display name in the active language */
  deptName: (dept: Pick<Department, 'name_en' | 'name_th'> | undefined | null) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'eventops.lang';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'th' ? 'th' : 'en';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = dictionaries[lang];
    const t = (key: TKey): string => {
      const parts = key.split('.');
      let node: unknown = dict;
      for (const part of parts) {
        if (typeof node !== 'object' || node === null) return key;
        node = (node as Record<string, unknown>)[part];
      }
      return typeof node === 'string' ? node : key;
    };
    return {
      lang,
      setLang: setLangState,
      t,
      deptName: (dept) => (dept ? (lang === 'th' ? dept.name_th : dept.name_en) : '')
    };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
