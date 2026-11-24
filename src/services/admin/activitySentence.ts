import { dateLocale, type Locale } from "@/i18n/config";
import type { TranslateFn } from "@/i18n/translate";
import type { ActivityItem } from "@/services/admin/activityFeed";

/** "3 de noviembre"; con año solo si no es el año en curso. */
export function activityDay(iso: string, locale: Locale, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(dateLocale(locale), {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "octubre de 2026" / "October 2026"; null si el archivo no trae periodo. */
function periodLabel(periodo: number | null, anio: number | null, locale: Locale): string | null {
  if (!periodo || !anio || periodo < 1 || periodo > 12) {
    return null;
  }
  return new Date(anio, periodo - 1, 1).toLocaleDateString(dateLocale(locale), { month: "long", year: "numeric" });
}

/** Una frase legible por renglón, sin códigos internos. */
export function describeActivity(item: ActivityItem, t: TranslateFn, locale: Locale, now: Date = new Date()): string {
  const date = activityDay(item.at, locale, now);
  // Altas hechas por un proceso interno (sin correo) se atribuyen a Cifra, nunca al código del proceso.
  const who = (value: string) => (value.includes("@") ? value : t("activity.system"));
  const role = (value: string | null) => (value ? t(`activity.role.${value}`) : t("activity.role.unknown"));

  if (item.kind === "user") {
    return t(`activity.user.${item.action}`, {
      actor: who(item.actor),
      target: who(item.target),
      from: role(item.fromRole),
      to: role(item.toRole),
      date,
    });
  }

  const period = periodLabel(item.periodo, item.anio, locale) ?? t("activity.load.noPeriod");
  return t("activity.load.sentence", {
    actor: who(item.actor),
    file: item.fileName,
    period,
    date,
    result: t(`activity.load.result.${item.state}`),
  });
}
