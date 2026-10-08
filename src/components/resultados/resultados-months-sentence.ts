import { dateLocale, type Locale } from "@/i18n/config";
import { monthLabelKey } from "@/i18n/format";
import type { PosicionFinancieraPayload } from "@/services/posicionFinanciera";

type Translate = (key: string, values?: Record<string, string | number>) => string;

function monthName(month: number, t: Translate, locale: Locale): string {
  const name = t(monthLabelKey(month - 1));
  return locale === "es" ? name.toLocaleLowerCase(dateLocale(locale)) : name;
}

function joinList(items: string[], t: Translate): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${t("common.and")} ${items.at(-1)}`;
}

function isConsecutive(months: number[]): boolean {
  return months.every((month, index) => index === 0 || month === months[index - 1] + 1);
}

/** «de enero a julio», «solo enero» o «enero, marzo y mayo». */
function monthsPhrase(months: number[], t: Translate, locale: Locale): string {
  if (months.length === 1) {
    return t("posicionFinanciera.resultsMonthOnly", { month: monthName(months[0], t, locale) });
  }
  if (isConsecutive(months)) {
    return t("posicionFinanciera.resultsMonthRange", {
      from: monthName(months[0], t, locale),
      to: monthName(months[months.length - 1], t, locale),
    });
  }
  return joinList(
    months.map((month) => monthName(month, t, locale)),
    t,
  );
}

/**
 * Frase visible del Estado de resultados: qué meses suma cada año y qué años
 * anteriores no tienen alguno de esos meses.
 */
export function resultadosMonthsSentence(
  data: Pick<PosicionFinancieraPayload, "year" | "years" | "resultadosMonthsByYear"> | null | undefined,
  t: Translate,
  locale: Locale,
): string | undefined {
  const selected = data?.resultadosMonthsByYear?.[String(data.year)]?.months ?? [];
  if (!data || selected.length === 0) return undefined;
  const parts = [t("posicionFinanciera.resultsSameMonths", { range: monthsPhrase(selected, t, locale) })];
  for (const year of data.years) {
    if (year === data.year) continue;
    const aligned = data.resultadosMonthsByYear[String(year)];
    if (!aligned || aligned.missing.length === 0) continue;
    parts.push(
      aligned.months.length === 0
        ? t("posicionFinanciera.resultsYearNoData", { year })
        : t("posicionFinanciera.resultsYearMissing", {
            year,
            months: joinList(aligned.missing.map((month) => monthName(month, t, locale)), t),
          }),
    );
  }
  return parts.join(" ");
}
