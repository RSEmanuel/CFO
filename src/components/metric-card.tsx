"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightText } from "@/components/insight-text";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { FavoriteStar } from "@/components/favorites/favorite-star";

type MetricCardProps = {
  title: string;
  value: string;
  hint?: string;
  /** Qué mide el KPI, en lenguaje de negocio. Bajo el valor. */
  insightText?: string;
  loading?: boolean;
  previousValue?: number | null;
  currentNumeric?: number | null;
  invertTrend?: boolean;
  favoriteId?: string;
};

export function MetricCard({
  title,
  value,
  hint,
  insightText,
  loading,
  previousValue,
  currentNumeric,
  invertTrend = false,
  favoriteId,
}: MetricCardProps) {
  const canCompare =
    typeof currentNumeric === "number" && typeof previousValue === "number" && Math.abs(previousValue) > 0.0001;
  const deltaPct = canCompare ? ((currentNumeric - previousValue) / Math.abs(previousValue)) * 100 : null;
  const improved = deltaPct == null ? null : invertTrend ? deltaPct < 0 : deltaPct > 0;
  const worse = deltaPct == null ? null : invertTrend ? deltaPct > 0 : deltaPct < 0;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="font-serif text-lg font-medium text-foreground">{title}</CardTitle>
        {favoriteId ? <FavoriteStar kind="metric" id={favoriteId} label={title} /> : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-32 animate-pulse rounded-control bg-muted" />
        ) : (
          <p className="financial-nums text-2xl font-semibold tracking-tight">{value}</p>
        )}
        <InsightText text={insightText} />
        <div className="mt-2 flex items-center gap-2 text-xs">
          {deltaPct == null || loading ? (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              <Minus className="h-3 w-3" />
              Sin comparativo
            </span>
          ) : (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
                improved && "bg-category-margins text-favorable",
                worse && "bg-category-solvency text-desfavorable",
                !improved && !worse && "bg-muted text-muted-foreground",
              )}
            >
              {deltaPct > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {deltaPct > 0 ? "+" : ""}
              {deltaPct.toFixed(1)}% vs mes anterior
            </span>
          )}
        </div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
