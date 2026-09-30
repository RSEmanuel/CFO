"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { HeroBarChart } from "@/components/charts/HeroBarChart";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { useCobranza } from "@/hooks/use-cobranza";
import { CHART } from "@/lib/chart-theme";
import { formatAxisTick, formatMxn } from "@/services/money";
import { useRef } from "react";

/**
 * Aging de cartera (buckets de antigüedad de saldos). Auto-fetch con
 * useCobranza: api-cache deduplica la request cuando la página de Cobranza
 * ya pidió el mismo payload.
 */
export function CobranzaAgingChart() {
  const { t } = useLocale();
  const { tenantId, tenants, user } = useSession();
  const { data, loading } = useCobranza();
  const agingRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-card bg-secondary" />;
  }

  const model = data?.model ?? null;
  const asOf = data?.asOf ?? null;
  if (!model || !asOf) {
    return null;
  }

  const empresa =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-serif text-lg font-medium text-foreground">{t("cobranza.aging")}</h2>
        <div className="flex items-center gap-1">
          <FavoriteStarButton widgetId="chart-cobranza-aging" label={t("cobranza.aging")} />
          <ChartDownloadButton
            targetRef={agingRef}
            empresa={empresa}
            modulo="cobranza"
            titulo={t("cobranza.aging")}
            periodo={asOf}
          />
        </div>
      </div>
      <div ref={agingRef} className="mt-4 h-[280px] w-full min-w-0">
        <HeroBarChart
          data={model.aging}
          xKey="name"
          yTickFormatter={(value) => formatAxisTick(value, "m")}
          tooltipFormatter={(value, name) => [formatMxn(Number(value)), name]}
          legendFormatter={() => "Saldo"}
          series={[{ dataKey: "saldo", name: "Saldo", fill: CHART.clay }]}
        />
      </div>
    </section>
  );
}
