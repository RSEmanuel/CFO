"use client";

import { usePathname } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, screenLocale, type Locale } from "@/i18n/config";
import { formatDate as formatDateValue, formatNumber as formatNumberValue } from "@/i18n/format";
import { MESSAGES, createT, type TranslateFn } from "@/i18n/translate";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [storedLocale, setStoredLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);
  const locale = screenLocale(pathname, storedLocale);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) {
      setStoredLocale(stored);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    document.documentElement.lang = locale;
    // En /login no se guarda el idioma: la pantalla es fija en español y la preferencia del portal se queda.
    if (pathname !== "/login") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, storedLocale);
    }
  }, [hydrated, locale, pathname, storedLocale]);

  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
  }, []);

  const t = useMemo(() => createT(locale), [locale]);
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      formatDate: (input, options) => formatDateValue(input, locale, options),
      formatNumber: (input, options) => formatNumberValue(input, locale, options),
    }),
    [locale, setLocale, t],
  );

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </NextIntlClientProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
