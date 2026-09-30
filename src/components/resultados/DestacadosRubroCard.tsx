"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { InsightText } from "@/components/insight-text";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import type { DestacadosRubro } from "@/services/financialDataTransformer";
import { formatAxisTick, type DisplayUnits } from "@/services/money";
import { LineChart as LineChartIcon, Receipt, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

const RUBRO_ICONS: Record<DestacadosRubro["key"], LucideIcon> = {
  ingreso: TrendingUp,
  costo: Wallet,
  gasto: Receipt,
  ebitda: LineChartIcon,
};

function isFavorable(rubro: DestacadosRubro): boolean | null {
  if (rubro.deltaPct == null || rubro.deltaPct === 0) {
    return null;
  }
  return rubro.inverted ? rubro.deltaPct < 0 : rubro.deltaPct > 0;
}

function formatDelta(deltaPct: number): string {
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(1)}%`;
}

export function rubroTitleKey(key: DestacadosRubro["key"]): string {
  return `resultados.${key === "ingreso" ? "income" : key === "costo" ? "cost" : key === "gasto" ? "expense" : "ebitda"}`;
}

export function DestacadosRubroCard({
  rubro,
  units,
  contextLabel,
}: {
  rubro: DestacadosRubro;
  units: DisplayUnits;
  contextLabel: string | null;
}) {
  const { t } = useLocale();
  const Icon = RUBRO_ICONS[rubro.key];
  const favorable = isFavorable(rubro);
  const title = t(rubroTitleKey(rubro.key));
  return (
    <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <p className="font-serif text-lg text-foreground">{title}</p>
        <div className="flex items-center gap-1">
          <FavoriteStarButton widgetId={`destacados:${rubro.key}`} label={title} />
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      </div>
      <p className="financial-nums mt-4 text-3xl font-semibold tracking-tight text-foreground">
        {formatAxisTick(rubro.value, units)}
      </p>
      {rubro.key === "ebitda" ? <InsightText text={t("resultados.ebitdaInsight")} /> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {rubro.deltaPct == null ? (
          <span className="text-xs text-muted-foreground">{t("resultados.noComparable")}</span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                favorable === true && "bg-category-margins text-favorable",
                favorable === false && "bg-category-solvency text-desfavorable",
                favorable == null && "bg-muted text-muted-foreground",
              )}
            >
              {formatDelta(rubro.deltaPct)}
            </span>
            {contextLabel ? <span className="text-xs text-muted-foreground">{contextLabel}</span> : null}
          </>
        )}
      </div>
    </article>
  );
}
