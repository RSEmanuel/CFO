"use client";

import { ChartCard } from "@/components/charts/ChartCard";
import { arr, chartMoney, n } from "@/components/dashboard/safe";
import { CHART, CHART_AXIS, CHART_SERIES } from "@/lib/chart-theme";
import type { ClienteConcentracion, ModulePack } from "@/services/metricsTypes";
import { useLocale } from "@/context/LocaleContext";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function ChartBody({ loading, children }: { loading: boolean; children: ReactNode }) {
  if (loading) {
    return <div className="h-full animate-pulse rounded-lg bg-muted" />;
  }
  return children;
}

export const CHART_IDS = {
  cashProjection: "cash-projection",
  opexCenters: "opex-centers",
  agingCxc: "aging-cxc",
  clientConcentration: "client-concentration",
} as const;

export const CHART_TITLE_KEYS: Record<string, string> = {
  [CHART_IDS.cashProjection]: "charts.cashProjection",
  [CHART_IDS.opexCenters]: "charts.opexCenters",
  [CHART_IDS.agingCxc]: "charts.agingCxc",
  [CHART_IDS.clientConcentration]: "charts.clientConcentration",
};

export function CashProjectionChart({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const { t } = useLocale();
  const chart = arr(pack?.flujoCaja?.proyeccion).map((item) => ({
    name: t("charts.horizonMonths", { count: n(item.horizonte) }),
    saldo: n(item.saldoProyectado?.amount),
    fcf: n(item.fcfProyectado?.amount),
  }));

  return (
    <ChartCard id={CHART_IDS.cashProjection} title={t(CHART_TITLE_KEYS[CHART_IDS.cashProjection])}>
      <ChartBody loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS.stroke} />
            <XAxis dataKey="name" tick={{ fill: CHART_AXIS.tick, fontSize: 12 }} />
            <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: CHART_AXIS.tick }} />
            <Tooltip formatter={chartMoney} />
            <Bar dataKey="saldo" name={t("charts.projectedBalance")} fill={CHART.olive} radius={[8, 8, 0, 0]} />
            <Bar dataKey="fcf" name={t("charts.projectedFcf")} fill={CHART.slate} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBody>
    </ChartCard>
  );
}

export function OpexCentersChart({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const { t } = useLocale();
  const centros = arr(pack?.pnl?.opexPorCentro).map((row) => ({
    name: row.centroDeCostos,
    monto: n(row.monto),
  }));

  return (
    <ChartCard id={CHART_IDS.opexCenters} title={t(CHART_TITLE_KEYS[CHART_IDS.opexCenters])} heightClass="h-72">
      <ChartBody loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={centros} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS.stroke} />
            <XAxis type="number" tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: CHART_AXIS.tick }} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12, fill: CHART_AXIS.tick }} />
            <Tooltip formatter={chartMoney} />
            <Bar dataKey="monto" name="OpEx" fill={CHART.sand} radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBody>
    </ChartCard>
  );
}

export function AgingCxcChart({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const { t } = useLocale();
  const aging = arr(pack?.capitalTrabajo?.agingCxc).map((bucket) => ({
    name: bucket.label ?? bucket.key,
    monto: n(bucket.monto),
  }));

  return (
    <ChartCard id={CHART_IDS.agingCxc} title={t(CHART_TITLE_KEYS[CHART_IDS.agingCxc])} heightClass="h-72">
      <ChartBody loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={aging}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS.stroke} />
            <XAxis dataKey="name" tick={{ fill: CHART_AXIS.tick }} />
            <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: CHART_AXIS.tick }} />
            <Tooltip formatter={chartMoney} />
            <Bar dataKey="monto" name="Saldo" fill={CHART.slate} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBody>
    </ChartCard>
  );
}

export function ClientConcentrationChart({ pack, loading }: { pack: ModulePack | null; loading: boolean }) {
  const { t } = useLocale();
  const pie = [...arr(pack?.unitEconomics?.concentracionClientes?.top5), pack?.unitEconomics?.concentracionClientes?.resto]
    .filter((item): item is ClienteConcentracion => Boolean(item && n(item.facturacion) > 0))
    .map((item) => ({
      name: item.nombreCliente,
      value: n(item.facturacion),
    }));

  return (
    <ChartCard id={CHART_IDS.clientConcentration} title={t(CHART_TITLE_KEYS[CHART_IDS.clientConcentration])} heightClass="h-72">
      <ChartBody loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
              {pie.map((entry, index) => (
                <Cell key={entry.name} fill={CHART_SERIES[index % CHART_SERIES.length]} />
              ))}
            </Pie>
            <Tooltip formatter={chartMoney} />
          </PieChart>
        </ResponsiveContainer>
      </ChartBody>
    </ChartCard>
  );
}

const CHART_RENDERERS: Record<string, (pack: ModulePack | null, loading: boolean) => ReactNode> = {
  [CHART_IDS.cashProjection]: (pack, loading) => <CashProjectionChart pack={pack} loading={loading} />,
  [CHART_IDS.opexCenters]: (pack, loading) => <OpexCentersChart pack={pack} loading={loading} />,
  [CHART_IDS.agingCxc]: (pack, loading) => <AgingCxcChart pack={pack} loading={loading} />,
  [CHART_IDS.clientConcentration]: (pack, loading) => <ClientConcentrationChart pack={pack} loading={loading} />,
};

export function FavoriteCharts({
  ids,
  pack,
  loading,
}: {
  ids: string[];
  pack: ModulePack | null;
  loading: boolean;
}) {
  const known = ids.filter((id) => CHART_RENDERERS[id]);
  if (known.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Gráficos favoritos</h3>
      <div className="grid gap-4 xl:grid-cols-2">
        {known.map((id) => (
          <div key={id}>{CHART_RENDERERS[id](pack, loading)}</div>
        ))}
      </div>
    </div>
  );
}
