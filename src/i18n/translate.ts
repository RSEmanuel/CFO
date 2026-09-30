import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

export const MESSAGES: Record<Locale, typeof es> = {
  es,
  en: en as typeof es,
};

export type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

export function createT(locale: Locale = DEFAULT_LOCALE): TranslateFn {
  const t = createTranslator({ locale, messages: MESSAGES[locale] });
  return (key, values) => {
    try {
      return t(key, values);
    } catch {
      return key;
    }
  };
}

export function collectKeys(value: unknown, prefix = ""): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}
