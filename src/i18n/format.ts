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

/** Meses abreviados que cambian del español al inglés (Feb, Mar, May… se escriben igual). */
const MES_CORTO_EN: Record<string, string> = { ene: "Jan", abr: "Apr", ago: "Aug", dic: "Dec" };

/**
 * Etiqueta de periodo para pantalla. Los servicios arman «Ago-25», «Ene-26» en
 * español (también sirven de llave en las gráficas); en inglés solo se cambia
 * lo que se muestra: «Aug-25», «Jan-26». Respeta mayúsculas («AGO-25» → «AUG-25»).
 */
export function etiquetaPeriodo(label: string, locale: Locale): string {
  if (locale !== "en" || !label) return label;
  return label.replace(/\b(ene|abr|ago|dic)(?=[-–\s]?'?\d{2}\b)/gi, (mes) => {
    const en = MES_CORTO_EN[mes.toLowerCase()] ?? mes;
    return mes === mes.toUpperCase() ? en.toUpperCase() : en;
  });
}

/** Frases de comparación que arman los servicios de resultados → clave de traducción. */
const CONTEXTO_KEY: Record<string, string> = {
  "vs mismo periodo del año anterior": "resultados.context.samePeriodLastYear",
  "vs año anterior": "resultados.context.priorYear",
  "vs trimestre anterior": "resultados.context.priorQuarter",
  "vs mes anterior": "resultados.context.priorMonth",
};

/** «vs año anterior» en el idioma activo; una frase desconocida pasa tal cual. */
export function contextoComparacion(label: string | null, t: (key: string) => string): string | null {
  if (!label) return label;
  const key = CONTEXTO_KEY[label];
  return key ? t(key) : label;
}
