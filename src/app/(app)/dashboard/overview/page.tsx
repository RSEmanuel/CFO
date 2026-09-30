"use client";

import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { DataEmptyState } from "@/components/data-empty-state";
import { ResultadosPage } from "@/components/resultados/resultados-page";
import { useLocale } from "@/context/LocaleContext";

export default function OverviewPage() {
  const { t } = useLocale();
  return (
    <ChartErrorBoundary
      fallback={
        <DataEmptyState title={t("resultados.loadError")} message={t("resultados.sankeyError")} />
      }
    >
      <ResultadosPage />
    </ChartErrorBoundary>
  );
}
