"use client";

import { CashProjectionChart } from "@/components/charts/chart-registry";
import { MetricCard } from "@/components/metric-card";
import { fmtDays, fmtMoney } from "@/components/dashboard/safe";
import type { ModulePack } from "@/services/metricsTypes";

export function ModuleCashflow({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const flujo = pack?.flujoCaja;
  const d = flujo?.desglose;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard favoriteId="metric:cashflow:saldo-final" title="Saldo final" value={fmtMoney(d?.saldoFinal?.amount, d?.saldoFinal?.amountFormatted)} loading={loading} />
        <MetricCard favoriteId="metric:cashflow:entradas-operativas" title="Entradas operativas" value={fmtMoney(d?.entradasOperativas?.amount, d?.entradasOperativas?.amountFormatted)} loading={loading} />
        <MetricCard favoriteId="metric:cashflow:salidas-operativas" title="Salidas operativas" value={fmtMoney(d?.salidasOperativas?.amount, d?.salidasOperativas?.amountFormatted)} loading={loading} />
        <MetricCard favoriteId="metric:cashflow:capex" title="CapEx" value={fmtMoney(d?.salidasCapex?.amount, d?.salidasCapex?.amountFormatted)} loading={loading} />
        <MetricCard favoriteId="metric:cashflow:servicio-deuda" title="Servicio de deuda" value={fmtMoney(d?.servicioDeuda?.amount, d?.servicioDeuda?.amountFormatted)} loading={loading} />
        <MetricCard favoriteId="metric:cashflow:free-cash-flow" title="Free Cash Flow" value={fmtMoney(d?.freeCashFlow?.amount, d?.freeCashFlow?.amountFormatted)} loading={loading} />
        <MetricCard favoriteId="metric:cashflow:runway-actual" title="Meses de respiro" value={fmtDays(flujo?.cashRunwayDias)} loading={loading} />
        <MetricCard favoriteId="metric:cashflow:runway-proyectado" title="Meses de respiro proyectados" value={fmtDays(flujo?.cashRunwayProyectadoDias)} loading={loading} hint="N/D si el promedio histórico genera caja" />
      </div>

      <CashProjectionChart pack={pack} loading={loading} />
    </div>
  );
}
