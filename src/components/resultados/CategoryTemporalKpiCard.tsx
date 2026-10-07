"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { categoryTemporalFavoriteId } from "@/services/favoritesRegistry";
import type { ResultadosCategoryName } from "@/services/financialDataTransformer";
import type { CategoryTemporalCard } from "@/services/resultadosKpis";

const KPI_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2,
});

function formatDelta(deltaPct: number): string {
  const pct = deltaPct * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function deltaIsFavorable(category: ResultadosCategoryName, deltaPct: number): boolean {
  const increaseIsUnfavorable = category === "Costo" || category === "Gasto";
  return increaseIsUnfavorable ? deltaPct <= 0 : deltaPct >= 0;
}

export function CategoryTemporalKpiCard({
  card,
  category,
}: {
  card: CategoryTemporalCard;
  category: ResultadosCategoryName;
}) {
  const { t } = useLocale();
  const title = t(card.titleKey);
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-sans text-base font-bold text-foreground">{title}</p>
        <FavoriteStarButton widgetId={categoryTemporalFavoriteId(category, card.key)} label={title} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{card.periodLabel}</p>
      <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
        {card.value == null ? "N/A" : KPI_FORMATTER.format(card.value)}
      </p>
      {card.deltaPct == null ? null : (
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
            deltaIsFavorable(category, card.deltaPct)
              ? "bg-category-margins text-favorable"
              : "bg-category-solvency text-desfavorable",
          )}
        >
          {formatDelta(card.deltaPct)}
        </span>
      )}
    </article>
  );
}

/** Tarjeta «Acumulado del año»: enero al mes seleccionado, con el mismo rango del año anterior. */
export function YearToDateKpiCard({
  category,
  periodLabel,
  value,
  deltaPct,
  priorLabel,
  missingNote,
}: {
  category: ResultadosCategoryName;
  periodLabel: string;
  value: number | null;
  deltaPct: number | null;
  priorLabel: string;
  missingNote: string | null;
}) {
  const { t } = useLocale();
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
      <p className="font-sans text-base font-bold text-foreground">{t("resultados.yearToDate")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{periodLabel}</p>
      <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
        {value == null ? "N/A" : KPI_FORMATTER.format(value)}
      </p>
      {deltaPct == null ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "financial-nums inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
              deltaIsFavorable(category, deltaPct)
                ? "bg-category-margins text-favorable"
                : "bg-category-solvency text-desfavorable",
            )}
          >
            {formatDelta(deltaPct)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t("resultados.yearToDateVsPrior", { range: priorLabel })}
          </span>
        </div>
      )}
      {missingNote ? <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{missingNote}</p> : null}
    </article>
  );
}
