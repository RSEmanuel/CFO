"use client";

import { OpexCentersChart, WaterfallPnlChart } from "@/components/charts/chart-registry";
import { MetricCard } from "@/components/metric-card";
import { fmtMoney, fmtPct } from "@/components/dashboard/safe";
import type { ModulePack } from "@/services/metricsTypes";

export function ModulePnl({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const mix = pack?.pnl?.mixCostos;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard favoriteId="metric:pnl:costos-fijos" title="Costos fijos" value={fmtPct(mix?.fijoPct)} loading={loading} hint={fmtMoney(mix?.fijo?.amount, mix?.fijo?.amountFormatted)} />
        <MetricCard favoriteId="metric:pnl:costos-variables" title="Costos variables" value={fmtPct(mix?.variablePct)} loading={loading} hint={fmtMoney(mix?.variable?.amount, mix?.variable?.amountFormatted)} />
        <MetricCard favoriteId="metric:pnl:egresos-totales" title="Egresos totales" value={fmtMoney(mix?.totalEgresos?.amount, mix?.totalEgresos?.amountFormatted)} loading={loading} />
      </div>

      <WaterfallPnlChart pack={pack} loading={loading} />
      <OpexCentersChart pack={pack} loading={loading} />
    </div>
  );
}
