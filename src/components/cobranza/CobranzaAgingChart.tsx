"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { ExpandableShell } from "@/components/charts/ExpandableChartCard";
import { HeroBarChart } from "@/components/charts/HeroBarChart";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { useCobranza } from "@/hooks/use-cobranza";
import { CHART } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { formatAxisTick, formatMxn } from "@/services/money";
import { useRef } from "react";

/**
 * Aging de cartera: mismos rangos y mismo criterio (días desde el vencimiento)
 * que Antigüedad de saldos y Clientes que no te pagan. Auto-fetch con
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

  const antiguedad = data?.antiguedadCxc ?? null;
  const asOf = data?.asOf ?? null;
  if (!antiguedad || !asOf) {
    return null;
  }

  const empresa =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  return (
    <ExpandableShell className="p-5">
      {(toggle, expanded) => (
      <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-sans text-lg font-medium text-foreground">{t("cobranza.aging")}</h2>
        <div className="flex items-center gap-1">
          <FavoriteStarButton widgetId="chart-cobranza-aging" label={t("cobranza.aging")} />
          <ChartDownloadButton
            targetRef={agingRef}
            empresa={empresa}
            modulo="cobranza"
            titulo={t("cobranza.aging")}
            periodo={asOf}
          />
          {toggle}
        </div>
      </div>
      <div ref={agingRef} className={cn("mt-4 w-full min-w-0", expanded ? "min-h-0 flex-1" : "h-[280px]")}>
        <HeroBarChart
          data={antiguedad.buckets.map((bucket) => ({
            name: t(`cobranza.agingBuckets.${bucket.key}`),
            saldo: bucket.saldo,
          }))}
          xKey="name"
          yTickFormatter={(value) => formatAxisTick(value, "m")}
          tooltipFormatter={(value, name) => [formatMxn(Number(value)), name]}
          legendFormatter={() => t("cobranza.balance")}
          series={[{ dataKey: "saldo", name: t("cobranza.balance"), fill: CHART.clay }]}
        />
      </div>
      </>
      )}
    </ExpandableShell>
  );
}
