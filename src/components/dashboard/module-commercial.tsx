"use client";

import { ClientConcentrationChart } from "@/components/charts/chart-registry";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { arr, fmtMoney, fmtPct } from "@/components/dashboard/safe";
import type { ModulePack } from "@/services/metricsTypes";

function BudgetTable({
  title,
  rows,
  loading,
}: {
  title: string;
  rows: Array<{ id: string; nombre: string; realFormatted?: string | null; real?: number; budgetFormatted?: string | null; budget?: number | null; variacionPct?: number | null }>;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Rubro</th>
                  <th className="py-2 pr-3 font-medium">Real</th>
                  <th className="py-2 pr-3 font-medium">Presupuesto</th>
                  <th className="py-2 font-medium">Var.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{row.nombre}</td>
                    <td className="py-2 pr-3">{fmtMoney(row.real, row.realFormatted)}</td>
                    <td className="py-2 pr-3">{row.budgetFormatted ?? (row.budget == null ? "N/D" : fmtMoney(row.budget))}</td>
                    <td className="py-2">{fmtPct(row.variacionPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Sin datos en el corte.</p> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ModuleCommercial({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const unit = pack?.unitEconomics;
  const conc = unit?.concentracionClientes;
  const lineas = arr(unit?.porLineaNegocio);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard favoriteId="metric:commercial:concentracion-top5" title="Concentración Top 5" value={fmtPct(conc?.top5Pct)} loading={loading} invertTrend />
        <MetricCard favoriteId="metric:commercial:concentracion-top10" title="Concentración Top 10" value={fmtPct(conc?.top10Pct)} loading={loading} invertTrend />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ClientConcentrationChart pack={pack} loading={loading} />

        <Card>
          <CardHeader>
            <CardTitle>Margen bruto por línea de negocio</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 animate-pulse rounded-lg bg-muted" />
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Línea</th>
                      <th className="py-2 pr-3 font-medium">Facturación</th>
                      <th className="py-2 font-medium">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((row) => (
                      <tr key={row.lineaNegocio} className="border-b last:border-0">
                        <td className="py-2 pr-3">{row.lineaNegocio}</td>
                        <td className="py-2 pr-3">{fmtMoney(row.facturacion, row.facturacionFormatted)}</td>
                        <td className="py-2">{fmtPct(row.margenBrutoPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lineas.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Sin facturación en el corte.</p> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BudgetTable title="Real vs presupuesto · ingresos" rows={arr(unit?.realVsBudgetIngresos)} loading={loading} />
      <BudgetTable title="Real vs presupuesto · centros de costo" rows={arr(unit?.realVsBudgetCentros)} loading={loading} />
    </div>
  );
}
