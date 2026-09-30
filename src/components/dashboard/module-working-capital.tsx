"use client";

import { AgingCxcChart } from "@/components/charts/chart-registry";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { arr, fmtDays, fmtMoney } from "@/components/dashboard/safe";
import type { ModulePack } from "@/services/metricsTypes";

export function ModuleWorkingCapital({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const wc = pack?.capitalTrabajo;
  const ccc = wc?.ccc;
  const vendors = arr(wc?.topProveedores);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          favoriteId="metric:wc:nwc"
          title="NWC"
          value={fmtMoney(wc?.nwc?.amount, wc?.nwc?.amountFormatted)}
          loading={loading}
          currentNumeric={wc?.nwc?.amount}
          hint="Activo circulante − |pasivo circulante|"
        />
        <MetricCard
          favoriteId="metric:wc:dso"
          title="Días promedio de cobro (DSO)"
          value={fmtDays(ccc?.dso)}
          loading={loading}
          hint="Días cartera"
          insightText="Cuántos días tardas, en promedio, en cobrar a tus clientes."
        />
        <MetricCard favoriteId="metric:wc:dio" title="DIO" value={fmtDays(ccc?.dio)} loading={loading} hint="Días inventario" />
        <MetricCard favoriteId="metric:wc:dpo" title="DPO" value={fmtDays(ccc?.dpo)} loading={loading} hint="Días proveedores" />
        <MetricCard favoriteId="metric:wc:ccc" title="CCC" value={fmtDays(ccc?.days)} loading={loading} invertTrend />
      </div>

      <AgingCxcChart pack={pack} loading={loading} />

      <Card>
        <CardHeader>
          <CardTitle>Top 10 proveedores</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Proveedor</th>
                    <th className="py-2 pr-3 font-medium">Volumen</th>
                    <th className="py-2 font-medium">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((row) => (
                    <tr key={row.idProveedor} className="border-b last:border-0">
                      <td className="py-2 pr-3">{row.nombreProveedor}</td>
                      <td className="py-2 pr-3">{fmtMoney(row.volumen, row.volumenFormatted)}</td>
                      <td className="py-2">{fmtMoney(row.pendiente, row.pendienteFormatted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vendors.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Sin proveedores en el corte.</p> : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
