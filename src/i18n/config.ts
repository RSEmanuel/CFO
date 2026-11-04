export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_STORAGE_KEY = "cfo.locale";

export function isLocale(value: unknown): value is Locale {
  return value === "es" || value === "en";
}

/** El acceso siempre se muestra en español, aunque el portal haya quedado en inglés. */
export function screenLocale(pathname: string | null, stored: Locale): Locale {
  return pathname === "/login" ? "es" : stored;
}

export function dateLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "es-MX";
}
