"use client";

import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDays, fmtMoney, fmtPct, fmtRatio, n } from "@/components/dashboard/safe";
import type { ModulePack } from "@/services/metricsTypes";

function ebitdaMargin(pack: ModulePack): number | null {
  const ingresos = n(pack.pnl?.waterfall?.find((step) => step.key === "ingresos")?.amount);
  const ebitda = n(pack.pnl?.waterfall?.find((step) => step.key === "ebitda")?.amount);
  if (ingresos < 0.01) {
    return null;
  }
  return (ebitda / ingresos) * 100;
}

function ingresosBudgetPct(pack: ModulePack): number | null {
  const rows = pack.unitEconomics?.realVsBudgetIngresos ?? [];
  const real = rows.reduce((acc, row) => acc + n(row.real), 0);
  const budget = rows.reduce((acc, row) => acc + n(row.budget), 0);
  if (Math.abs(budget) < 0.01) {
    return null;
  }
  return ((real - budget) / budget) * 100;
}

export function ModuleOverview({
  pack,
  loading,
  assumptions,
}: {
  pack: ModulePack | null;
  loading: boolean;
  assumptions: string[];
}) {
  const salud = pack?.saludFinanciera;
  const flujo = pack?.flujoCaja;
  const ccc = pack?.capitalTrabajo?.ccc;
  const top5 = pack?.unitEconomics?.concentracionClientes?.top5Pct;
  const margin = pack ? ebitdaMargin(pack) : null;
  const budgetPct = pack ? ingresosBudgetPct(pack) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          favoriteId="metric:overview:free-cash-flow"
          title="Free Cash Flow"
          value={fmtMoney(flujo?.desglose?.freeCashFlow?.amount, flujo?.desglose?.freeCashFlow?.amountFormatted)}
          loading={loading}
          currentNumeric={flujo?.desglose?.freeCashFlow?.amount}
          hint="Entradas operativas − salidas operativas − CapEx"
        />
        <MetricCard
          favoriteId="metric:overview:cash-runway"
          title="Meses de respiro"
          value={fmtDays(flujo?.cashRunwayDias)}
          loading={loading}
          currentNumeric={flujo?.cashRunwayDias}
          hint="Días de caja al ritmo de salidas operativas"
        />
        <MetricCard
          favoriteId="metric:overview:ebitda-margin"
          title="Margen EBITDA"
          value={fmtPct(margin)}
          loading={loading}
          currentNumeric={margin}
        />
        <MetricCard
          favoriteId="metric:overview:ccc"
          title="Ciclo de conversión (CCC)"
          value={fmtDays(ccc?.days)}
          loading={loading}
          currentNumeric={ccc?.days}
          invertTrend
          hint="DSO + DIO − DPO · menos es mejor"
        />
        <MetricCard
          favoriteId="metric:overview:ingresos-vs-budget"
          title="Real vs presupuesto (ingresos)"
          value={fmtPct(budgetPct)}
          loading={loading}
          currentNumeric={budgetPct}
        />
        <MetricCard
          favoriteId="metric:overview:concentracion-top5"
          title="Concentración Top 5"
          value={fmtPct(top5)}
          loading={loading}
          currentNumeric={top5}
          invertTrend
          hint="Porcentaje de facturación en los cinco mayores clientes"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard favoriteId="metric:overview:liquidez-corriente" title="Liquidez corriente" value={fmtRatio(salud?.liquidezCorriente?.value)} loading={loading} hint="Activo circulante / Pasivo circulante" />
        <MetricCard favoriteId="metric:overview:prueba-acida" title="Prueba ácida" value={fmtRatio(salud?.pruebaAcida?.value)} loading={loading} hint="(AC − inventarios) / PC" />
        <MetricCard favoriteId="metric:overview:endeudamiento" title="Endeudamiento" value={fmtRatio(salud?.endeudamientoTotal?.value)} loading={loading} hint="|Pasivo total| / Capital contable NIF (3xxx + resultado YTD); con déficit (capital ≤ 0) no es significativo → N/D" />
        <MetricCard
          favoriteId="metric:overview:cobertura-intereses"
          title="Cobertura de intereses"
          value={fmtRatio(salud?.coberturaIntereses?.value)}
          loading={loading}
          hint={salud?.coberturaIntereses?.fuenteGastosFinancieros === "tesoreria" ? "Usa servicio de deuda de tesorería" : "EBIT / gastos financieros"}
        />
      </div>

      {assumptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Notas de cálculo</CardTitle>
            <CardDescription>Supuestos del motor cuando el catálogo no trae el dato directo.</CardDescription>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Ver supuestos</summary>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
