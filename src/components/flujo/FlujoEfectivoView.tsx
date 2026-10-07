"use client";

import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { DataEmptyState } from "@/components/data-empty-state";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { FlujoEfectivoSankey } from "@/components/flujo/FlujoEfectivoSankey";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import { useFlujoEfectivo } from "@/hooks/use-flujo-efectivo";
import { CHART } from "@/lib/chart-theme";
import type { FlujoEfectivoPeriodo, FlujoLinea } from "@/services/flujoEfectivo";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type FlujoEfectivoViewProps = {
  periodo: string;
  units: DisplayUnits;
};

function lineaLabel(linea: FlujoLinea, t: (key: string) => string): string {
  return linea.labelKey ? t(linea.labelKey) : linea.label;
}

function FlujoEfectivoWaterfallFallback({
  data,
  units,
}: {
  data: FlujoEfectivoPeriodo;
  units: DisplayUnits;
}) {
  const { t } = useLocale();
  const rows = [
    { name: t("flujo.efectivo.saldoInicial"), base: 0, amount: data.saldoInicial, kind: "total" },
    {
      name: t("flujo.efectivo.ingresos"),
      base: data.saldoInicial,
      amount: data.totalIngresos,
      kind: "increase",
    },
    {
      name: t("flujo.efectivo.egresos"),
      base: data.saldoFinal,
      amount: data.totalEgresos,
      kind: "decrease",
    },
    { name: t("flujo.efectivo.saldoFinal"), base: 0, amount: data.saldoFinal, kind: "total" },
  ];
  const colorOf = (kind: string) =>
    kind === "increase" ? CHART.olive : kind === "decrease" ? CHART.coral : CHART.clay;
  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart data={rows} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: CHART.mute, fontSize: 13, fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: CHART.beigeDeep }}
          interval={0}
        />
        <YAxis
          tick={{ fill: CHART.mute, fontSize: 13 }}
          tickFormatter={(value: number) => formatAxisTick(value, units)}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip
          cursor={{ fill: "rgba(26,25,21,0.04)" }}
          formatter={(value, name) =>
            name === "amount" ? [formatMxn(Number(value)), t("flujo.efectivo.monto")] : null
          }
        />
        <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="amount" stackId="wf" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.kind + row.name} fill={colorOf(row.kind)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FlujoEfectivoView({ periodo, units }: FlujoEfectivoViewProps) {
  const { t } = useLocale();
  const { data, loading, error } = useFlujoEfectivo(periodo);
  const [excluirTraspasos, setExcluirTraspasos] = useState(true);

  const chartLineas = useMemo(() => {
    if (!data) {
      return { ingresos: [] as FlujoLinea[], egresos: [] as FlujoLinea[] };
    }
    const filter = (lineas: FlujoLinea[]) =>
      excluirTraspasos ? lineas.filter((linea) => !linea.esTraspaso) : lineas;
    return {
      ingresos: filter(data.data.ingresos).map((linea) => ({
        ...linea,
        label: lineaLabel(linea, t),
      })),
      egresos: filter(data.data.egresos).map((linea) => ({
        ...linea,
        label: lineaLabel(linea, t),
      })),
    };
  }, [data, excluirTraspasos, t]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <DataEmptyState
        title={t("flujo.efectivo.emptyTitle")}
        message={t("flujo.efectivo.emptyMessage")}
      />
    );
  }

  const flujo = data.data;
  const hasTraspasos = flujo.traspasos > 0;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{t("flujo.efectivo.mapaTitle")}</CardTitle>
          <CardDescription>{t("flujo.efectivo.mapaHelp")}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FavoriteStarButton widgetId="chart-sankey" label={t("flujo.efectivo.mapaTitle")} />
          {hasTraspasos ? (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={excluirTraspasos}
                onChange={(event) => setExcluirTraspasos(event.target.checked)}
                className="h-4 w-4 accent-[var(--cifra-brand)]"
              />
              {t("flujo.efectivo.excluirTraspasos")}
            </label>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[540px] min-h-[540px] w-full">
          <ChartErrorBoundary fallback={<FlujoEfectivoWaterfallFallback data={flujo} units={units} />}>
            {chartLineas.ingresos.length > 0 && chartLineas.egresos.length > 0 ? (
              <FlujoEfectivoSankey
                ingresos={chartLineas.ingresos}
                egresos={chartLineas.egresos}
                units={units}
              />
            ) : (
              <FlujoEfectivoWaterfallFallback data={flujo} units={units} />
            )}
          </ChartErrorBoundary>
        </div>
      </CardContent>
    </Card>
  );
}
