"use client";

import {
  CATEGORY_META,
  formatCatalogMetric,
  isImprovement,
} from "@/components/metrics/catalog-presenter";
import { FavoriteStar } from "@/components/favorites/favorite-star";
import { InfoDialog } from "@/components/ui/info-dialog";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/LocaleContext";
import type { CatalogMetric } from "@/services/financialEngine";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type CatalogMetricCardProps = {
  metric: CatalogMetric;
  comparable: "mom" | "yoy";
};

export function CatalogMetricCard({ metric, comparable }: CatalogMetricCardProps) {
  const { t } = useLocale();
  const category = CATEGORY_META[metric.category];
  const improved = isImprovement(metric);
  const deltaLabel = t(comparable === "yoy" ? "resultados.vsPreviousYear" : "resultados.vsPreviousMonth");

  return (
    <article
      className={cn(
        "group flex min-h-[238px] flex-col rounded-card border p-5 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5",
        category.cardClass,
      )}
    >
      <div className="flex items-center justify-end gap-3">
        <div className="flex items-center gap-1">
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", category.badgeClass)}>
            {t(`metrics.categories.${metric.category}`)}
          </span>
          <FavoriteStar kind="metric" id={metric.key} label={t(`metrics.${metric.key}.name`)} />
          <MetricInfoDialog metricKey={metric.key} />
        </div>
      </div>

      <h3 className="mt-5 min-h-12 font-sans text-lg font-medium leading-snug text-foreground">
        {t(`metrics.${metric.key}.question`)}
      </h3>

      <div className="mt-auto pt-5">
        <p className="financial-nums text-3xl font-semibold tracking-tight text-foreground">
          {formatCatalogMetric(metric, t)}
        </p>

        <div className="mt-3">
          {metric.nullReason === "negativeCapital" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-desfavorable/10 px-2.5 py-1 text-xs font-medium text-desfavorable">
              <Minus className="h-3.5 w-3.5" />
              {t("metrics.nullReasonNegativeCapital")}
            </span>
          ) : metric.deltaPct == null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/70 px-2.5 py-1 text-xs text-muted-foreground">
              <Minus className="h-3.5 w-3.5" />
              {t("metrics.noComparable")}
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                improved === true && "bg-card/80 text-favorable",
                improved === false && "bg-card/80 text-desfavorable",
                improved == null && "bg-card/70 text-muted-foreground",
              )}
            >
              {metric.deltaPct > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {metric.deltaPct > 0 ? "+" : ""}
              {metric.deltaPct.toFixed(1)}% {deltaLabel}
            </span>
          )}
        </div>

        <p className="mt-3 text-xs font-medium text-muted-foreground">{t(`metrics.${metric.key}.name`)}</p>
      </div>
    </article>
  );
}

function MetricInfoDialog({ metricKey }: { metricKey: string }) {
  const { t } = useLocale();
  const help = t(`metrics.${metricKey}.help`);
  if (help.startsWith("metrics.")) return null;

  return (
    <InfoDialog
      title={t(`metrics.${metricKey}.question`)}
      body={help}
      ariaLabel={t("metrics.infoAriaLabel")}
    />
  );
}
