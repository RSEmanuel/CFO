"use client";

import { ExpandableChartCard } from "@/components/charts/ExpandableChartCard";
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
    <ExpandableChartCard id={id} title={title} insightText={insightText} heightClass={heightClass}>
      {children}
    </ExpandableChartCard>
  );
}
