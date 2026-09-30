import { dateLocale, type Locale } from "@/i18n/config";

export function formatDate(value: Date | string | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(dateLocale(locale), options ?? { day: "numeric", month: "short", year: "numeric" });
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return value.toLocaleString(dateLocale(locale), options);
}

export function monthLabelKey(monthIndex: number): string {
  return `common.monthNames.${monthIndex + 1}`;
}
