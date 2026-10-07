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
