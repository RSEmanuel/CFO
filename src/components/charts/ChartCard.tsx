"use client";

import { FavoriteStar } from "@/components/favorites/favorite-star";
import { InsightText } from "@/components/insight-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

export function ChartCard({
  id,
  title,
  insightText,
  heightClass = "h-80",
  children,
}: {
  id: string;
  title: string;
  /** Qué mide la gráfica, en lenguaje de negocio. Bajo el título. */
  insightText?: string;
  heightClass?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <InsightText text={insightText} />
        </div>
        <FavoriteStar kind="chart" id={id} label={title} />
      </CardHeader>
      <CardContent className={heightClass}>{children}</CardContent>
    </Card>
  );
}
