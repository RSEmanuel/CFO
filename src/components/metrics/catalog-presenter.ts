import type { CatalogMetric, MetricCategory } from "@/services/financialEngine";
import type { TranslateFn } from "@/i18n/translate";

export const CATEGORY_META: Record<
  MetricCategory,
  { badgeClass: string; cardClass: string }
> = {
  margenes: {
    badgeClass: "bg-category-marginsFg/15 text-category-marginsFg",
    cardClass: "border-category-marginsFg/20 bg-category-margins",
  },
  retorno: {
    badgeClass: "bg-category-returnFg/15 text-category-returnFg",
    cardClass: "border-category-returnFg/20 bg-category-return",
  },
  eficiencia: {
    badgeClass: "bg-category-efficiencyFg/15 text-category-efficiencyFg",
    cardClass: "border-category-efficiencyFg/20 bg-category-efficiency",
  },
  liquidez: {
    badgeClass: "bg-category-marginsFg/15 text-category-marginsFg",
    cardClass: "border-category-marginsFg/20 bg-category-margins",
  },
  solvencia: {
    badgeClass: "bg-category-solvencyFg/15 text-category-solvencyFg",
    cardClass: "border-category-solvencyFg/20 bg-category-solvency",
  },
  gestion: {
    badgeClass: "bg-category-managementFg/15 text-category-managementFg",
    cardClass: "border-category-managementFg/20 bg-category-management",
  },
};

export const HIGHLIGHT_KEYS = [
  "ebitdaMargin",
  "netMargin",
  "roic",
  "roe",
  "assetTurnover",
  "currentRatio",
  "operatingLeverage",
  "revenueGrowth",
] as const;

const INVERTED_TREND_KEYS = new Set([
  "effectiveTaxRate",
  "nwcOfRevenue",
  "sgaOfRevenue",
  "daOfRevenue",
  "ccc",
  "dso",
  "dio",
  "netDebtToEbitda",
  "liabilityRatio",
  "debtRatio",
  "costOfDebt",
  "debtToRevenue",
  "wacc",
]);

export function isImprovement(metric: CatalogMetric): boolean | null {
  if (metric.deltaPct == null || metric.deltaPct === 0) {
    return null;
  }
  return INVERTED_TREND_KEYS.has(metric.key) ? metric.deltaPct < 0 : metric.deltaPct > 0;
}

export function formatCatalogMetric(metric: CatalogMetric, t: TranslateFn): string {
  if (metric.value == null) {
    return t("common.na");
  }
  if (metric.key === "cashRunwayMonths") {
    return t("common.months", { value: metric.value.toFixed(1) });
  }
  if (metric.unit === "pct") {
    return `${metric.value.toFixed(1)}%`;
  }
  if (metric.unit === "days") {
    return t("common.days", { value: metric.value.toFixed(1) });
  }
  if (metric.unit === "score") {
    return metric.value.toFixed(0);
  }
  return `${metric.value.toFixed(2)}x`;
}
