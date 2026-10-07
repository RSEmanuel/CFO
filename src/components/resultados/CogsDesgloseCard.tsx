"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { useLocale } from "@/context/LocaleContext";
import { useCogsDesglose } from "@/hooks/use-cogs-desglose";
import { CHART } from "@/lib/chart-theme";
import type { CogsRubroKey } from "@/services/cogsDesglose";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import { PackageSearch } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COGS_LINE_PALETTE = [
  "var(--cifra-ink)",
  "var(--cifra-ink-2)",
  "var(--cifra-ink-3)",
  "var(--cifra-line)",
  "var(--cifra-line-2)",
  "var(--cifra-brand)",
  "var(--cifra-brand-soft)",
  "var(--cifra-surface-2)",
] as const;

type CogsDesgloseCardProps = {
  periodo: string;
  units: DisplayUnits;
};

export function CogsDesgloseCard({ periodo, units }: CogsDesgloseCardProps) {
  const { t } = useLocale();
  const { data, loading, error } = useCogsDesglose(periodo);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-card bg-secondary" />;
  }

  const rubroLabel = (key: CogsRubroKey) => t(`resultados.cogs.rubros.${key}`);

  if (error || !data || !data.hasCogs) {
    return (
      <section className="rounded-card border border-dashed border-border bg-card/60 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
            <PackageSearch className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-sans text-lg font-medium text-foreground">{t("resultados.cogs.title")}</h3>
            <p className="text-sm text-muted-foreground">
              {error ?? (data?.hasBalanza ? t("resultados.cogs.empty") : t("resultados.incomeMixEmpty"))}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const items = data.rubros.flatMap((rubro) => {
    if (rubro.key !== "otrosDirectos") {
      return [{ key: rubro.key, name: rubroLabel(rubro.key), monto: rubro.monto, pctCosto: rubro.pctCosto, pctVentas: rubro.pctVentas }];
    }
    return rubro.cuentas.map((cuenta) => ({
      key: cuenta.idCuenta,
      name: cuenta.nombreCuenta,
      monto: cuenta.monto,
      pctCosto: data.totalCosto > 0.005 ? (cuenta.monto / data.totalCosto) * 100 : 0,
      pctVentas: data.ventasNetas > 0.005 ? (cuenta.monto / data.ventasNetas) * 100 : null,
    }));
  });

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-lg font-medium text-foreground">{t("resultados.cogs.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("resultados.cogs.help")}</p>
        </div>
        <div className="flex items-center gap-1">
          <FavoriteStarButton widgetId="chart-cogs-desglose" label={t("resultados.cogs.title")} />
          <p className="financial-nums text-2xl font-semibold tracking-tight">
            {formatAxisTick(data.totalCosto, units)}
          </p>
        </div>
      </div>

      <div className="mt-4 h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <XAxis
              type="number"
              tick={{ fill: CHART.mute, fontSize: 11 }}
              tickFormatter={(value: number) => formatAxisTick(Number(value), units)}
              axisLine={{ stroke: CHART.mute, opacity: 0.3 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={190}
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART.mute, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(26,25,21,0.04)" }}
              formatter={(value) => [
                `${formatMxn(Number(value))} · ${data.totalCosto > 0.01 ? ((Number(value) / data.totalCosto) * 100).toFixed(1) : "0.0"}% ${t("resultados.cogs.pctOfCost")}`,
                "",
              ]}
            />
            <Bar dataKey="monto" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {items.map((item, index) => (
                <Cell key={item.key} fill={COGS_LINE_PALETTE[index % COGS_LINE_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 overflow-x-auto border-t border-border/60 pt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">{t("resultados.cogs.rubro")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("resultados.cogs.amount")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("resultados.cogs.pctOfCost")}</th>
              <th className="pb-2 text-right font-medium">{t("resultados.cogs.pctOfSales")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((rubro, index) => (
              <tr key={rubro.key} className="border-t border-border/40">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COGS_LINE_PALETTE[index % COGS_LINE_PALETTE.length] }}
                    />
                    <span className="text-foreground">{rubro.name}</span>
                  </span>
                </td>
                <td className="financial-nums py-2 pr-3 text-right text-foreground">{formatMxn(rubro.monto)}</td>
                <td className="financial-nums py-2 pr-3 text-right text-muted-foreground">
                  {rubro.pctCosto.toFixed(1)}%
                </td>
                <td className="financial-nums py-2 text-right text-muted-foreground">
                  {rubro.pctVentas == null ? t("common.na") : `${rubro.pctVentas.toFixed(1)}%`}
                </td>
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <td className="py-2 pr-3 text-foreground">{t("resultados.cogs.total")}</td>
              <td className="financial-nums py-2 pr-3 text-right text-foreground">{formatMxn(data.totalCosto)}</td>
              <td className="financial-nums py-2 pr-3 text-right text-foreground">100.0%</td>
              <td className="financial-nums py-2 text-right text-foreground">
                {data.ventasNetas > 0.005
                  ? `${((data.totalCosto / data.ventasNetas) * 100).toFixed(1)}%`
                  : t("common.na")}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
