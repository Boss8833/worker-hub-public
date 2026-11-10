import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, ar } from './dict';

export type Lang = 'ar' | 'en';
type Ctx = { lang: Lang; dir: 'rtl' | 'ltr'; setLang: (l: Lang) => void; t: (k: string) => string };
const I18n = createContext<Ctx>(null as unknown as Ctx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('wh_lang') as Lang) || 'ar');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = dir; }, [lang, dir]);
  const value = useMemo<Ctx>(() => ({
    lang, dir,
    setLang: (l) => { localStorage.setItem('wh_lang', l); setLangState(l); },
    t: (k) => (lang === 'ar' ? ar[k] : en[k]) ?? en[k] ?? k,
  }), [lang, dir]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
