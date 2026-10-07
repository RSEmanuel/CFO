"use client";

import { DataEmptyState } from "@/components/data-empty-state";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { useLocale } from "@/context/LocaleContext";
import { useFlujoOperativo } from "@/hooks/use-flujo-operativo";
import { CHART, CHART_AXIS, CHART_VARS } from "@/lib/chart-theme";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import {
  desgloseDia,
  type FlujoOperativoCategoria,
  type FlujoOperativoPayload,
  type FlujoOperativoPunto,
} from "@/services/flujoOperativo";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLOR_ENTRADAS = "var(--cifra-good)";
const COLOR_SALIDAS = "var(--cifra-bad)";
const COLOR_SALDO = "var(--cifra-ink)";

const TOOLTIP_STYLE = {
  background: CHART_VARS.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

const LEGEND_STYLE = {
  width: "100%",
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
  gap: 16,
  paddingBottom: 16,
  fontSize: 12,
};

type OperativoRow = {
  dia: string;
  entradas: number;
  /** Salidas en negativo para que la barra baje desde 0. */
  salidas: number;
  saldoAcumulado: number;
  punto: FlujoOperativoPunto;
};

function KpiCard({
  label,
  value,
  tone,
  favoriteId,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  favoriteId?: string;
}) {
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {favoriteId ? <FavoriteStarButton widgetId={favoriteId} label={label} /> : null}
      </div>
      <p
        className={`mt-1 font-sans text-2xl font-medium ${
          tone === "up" ? "text-category-marginsFg" : tone === "down" ? "text-category-solvencyFg" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

/** Tooltip diario: fecha exacta, entradas, salidas, flujo neto del día y saldo final. */
function OperativoTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: OperativoRow }> }) {
  const { t, formatDate } = useLocale();
  if (!active || !payload?.length) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }
  const { punto } = row;
  // La etiqueta es "YYYY-MM-DD": se construye la fecha en hora local para que
  // el día no se recorra por la zona horaria.
  const [anio, mes, dia] = punto.label.split("-").map(Number);
  const fecha = formatDate(new Date(anio ?? 2026, (mes ?? 1) - 1, dia ?? 1));
  const desglose = desgloseDia(punto);
  const categoryName = (categoria: FlujoOperativoCategoria) =>
    t(`flujo.operativo.categories.${categoria}`);
  const signo = (direccion: "entrada" | "salida" | "traspaso") =>
    direccion === "entrada" ? "+" : direccion === "salida" ? "−" : "↔";

  return (
    <div className="min-w-64 max-w-80 px-3.5 py-2.5 text-xs text-foreground" style={TOOLTIP_STYLE}>
      <p className="mb-2 font-medium text-foreground">{fecha}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t("flujo.operativo.inflows")}</span>
          <span className="financial-nums font-medium" style={{ color: COLOR_ENTRADAS }}>
            {formatMxn(punto.entradas)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t("flujo.operativo.outflows")}</span>
          <span className="financial-nums font-medium" style={{ color: COLOR_SALIDAS }}>
            {formatMxn(punto.salidas)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t("flujo.operativo.dayNetFlow")}</span>
          <span
            className={`financial-nums font-medium ${
              punto.neto >= 0 ? "text-category-marginsFg" : "text-category-solvencyFg"
            }`}
          >
            {formatMxn(punto.neto)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border pt-1.5 font-semibold">
          <span>{t("flujo.operativo.finalBalance")}</span>
          <span className="financial-nums font-medium text-foreground">
            {formatMxn(punto.saldoAcumulado)}
          </span>
        </div>
      </div>
      {desglose.length > 0 ? (
        <div className="mt-2.5 space-y-1 border-t border-border pt-2 text-[11px]">
          {desglose.map((item) => (
            <div key={item.categoria} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{categoryName(item.categoria)}</span>
              <span className="financial-nums shrink-0">
                {signo(item.direccion)}
                {formatMxn(item.monto)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Tablero diario: barras de entradas/salidas y línea de saldo de caja. */
export function FlujoOperativoTablero({
  data,
  units,
}: {
  data: FlujoOperativoPayload;
  units: DisplayUnits;
}) {
  const { t } = useLocale();
  const chartData: OperativoRow[] = data.puntos.map((punto) => ({
    dia: punto.label.slice(8),
    entradas: punto.entradas,
    salidas: -punto.salidas,
    saldoAcumulado: punto.saldoAcumulado,
    punto,
  }));

  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-sans text-lg font-medium text-foreground">
            {t("flujo.tabs.diaria")} · {data.periodo}
          </h3>
          <span className="text-sm text-muted-foreground">{t("flujo.operativo.help")}</span>
        </div>
        <div className="flex items-center gap-2">
          <FavoriteStarButton widgetId="chart-tablero-diario" label={t("flujo.tabs.diaria")} />
          <span className="text-xs text-muted-foreground">
            {t("flujo.operativo.accountsCovered", {
              count: data.cuentas.length,
              moneda: data.moneda,
            })}
          </span>
        </div>
      </div>

      <div className="w-full min-w-0">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 12, right: 28, left: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART_VARS.axis} strokeOpacity={0.6} />
            <XAxis
              dataKey="dia"
              tick={{ fill: CHART_VARS.mute, fontSize: 11 }}
              axisLine={{ stroke: CHART_VARS.axis }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              width={68}
              tick={{ fill: CHART_VARS.mute, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatAxisTick(Number(value), units)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={68}
              domain={[0, "auto"]}
              tick={{ fill: CHART_VARS.mute, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatAxisTick(Number(value), units)}
            />
            <Tooltip cursor={{ fill: "rgb(196 93 62 / 0.06)" }} content={<OperativoTooltip />} />
            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={LEGEND_STYLE} />
            <ReferenceLine y={0} yAxisId="left" stroke={CHART_VARS.axis} strokeDasharray="3 3" />
            <Bar
              yAxisId="left"
              stackId="movimientos"
              dataKey="entradas"
              name={t("flujo.operativo.inflows")}
              fill={COLOR_ENTRADAS}
              barSize={12}
              radius={[3, 3, 0, 0]}
            />
            <Bar
              yAxisId="left"
              stackId="movimientos"
              dataKey="salidas"
              name={t("flujo.operativo.outflows")}
              fill={COLOR_SALIDAS}
              barSize={12}
              radius={[0, 0, 3, 3]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="saldoAcumulado"
              name={t("flujo.operativo.cashBalance")}
              stroke={COLOR_SALDO}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: COLOR_SALDO, stroke: "var(--cifra-brand-contrast)", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {data.totales.traspasos > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("flujo.operativo.traspasosNote", { amount: formatMxn(data.totales.traspasos) })}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Tablero diario de tesorería: barras de entradas/salidas reales del auxiliar
 * de caja y bancos CONTPAQi (reportes 06/07) y línea del saldo de caja al
 * cierre de cada día (saldo inicial del mes del auxiliar + acumulado diario;
 * cuadra con el saldo final de bancos del periodo). Sin datos del periodo,
 * muestra estado vacío: no hay generadores ni fallbacks numéricos.
 */
export function FlujoOperativoView({ periodo, units }: { periodo: string; units: DisplayUnits }) {
  const { t } = useLocale();
  const { data, loading, error } = useFlujoOperativo(periodo);

  if (loading) return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  if (error) return <DataEmptyState title={t("flujo.loadError")} message={error} />;
  if (!data?.hasData) {
    return (
      <DataEmptyState
        title={t("flujo.operativo.emptyTitle")}
        message={t("flujo.operativo.emptyMessage")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={t("flujo.operativo.inflows")}
          value={formatMxn(data.totales.entradas)}
          tone="up"
          favoriteId="kpi-flujo-entradas"
        />
        <KpiCard
          label={t("flujo.operativo.outflows")}
          value={formatMxn(data.totales.salidas)}
          tone="down"
          favoriteId="kpi-flujo-salidas"
        />
        <KpiCard
          label={t("flujo.operativo.netFlow")}
          value={formatMxn(data.totales.neto)}
          tone={data.totales.neto >= 0 ? "up" : "down"}
          favoriteId="kpi-flujo-neto"
        />
        <KpiCard
          label={t("flujo.operativo.endingCash")}
          value={formatMxn(data.saldoFinal)}
          favoriteId="kpi-flujo-caja"
        />
      </div>

      <FlujoOperativoTablero data={data} units={units} />
    </div>
  );
}

export type FlujoOperativoKpiKey = "entradas" | "salidas" | "neto" | "caja";

/** KPI individual auto-fetch para el Panel de Control. */
export function FlujoOperativoKpiCard({ kpi, periodo }: { kpi: FlujoOperativoKpiKey; periodo: string }) {
  const { t } = useLocale();
  const { data, loading, error } = useFlujoOperativo(periodo);

  if (loading) {
    return <div className="h-24 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data?.hasData) {
    return null;
  }

  const props: Record<FlujoOperativoKpiKey, { label: string; value: string; tone?: "up" | "down" }> = {
    entradas: { label: t("flujo.operativo.inflows"), value: formatMxn(data.totales.entradas), tone: "up" },
    salidas: { label: t("flujo.operativo.outflows"), value: formatMxn(data.totales.salidas), tone: "down" },
    neto: {
      label: t("flujo.operativo.netFlow"),
      value: formatMxn(data.totales.neto),
      tone: data.totales.neto >= 0 ? "up" : "down",
    },
    caja: { label: t("flujo.operativo.endingCash"), value: formatMxn(data.saldoFinal) },
  };
  const config = props[kpi];
  return <KpiCard label={config.label} value={config.value} tone={config.tone} favoriteId={`kpi-flujo-${kpi}`} />;
}

/** Tablero diario auto-fetch para el Panel de Control. */
export function FlujoOperativoTableroCard({ periodo, units }: { periodo: string; units: DisplayUnits }) {
  const { data, loading, error } = useFlujoOperativo(periodo);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data?.hasData) {
    return null;
  }
  return <FlujoOperativoTablero data={data} units={units} />;
}

/** KPIs de tesorería del mes, sin el gráfico diario. */
export function FlujoResumenKpis({ periodo }: { periodo: string }) {
  const { t } = useLocale();
  const { data, loading } = useFlujoOperativo(periodo);

  if (loading) {
    return <div className="h-24 animate-pulse rounded-card bg-secondary" />;
  }
  if (!data?.hasData) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        label={t("flujo.operativo.inflows")}
        value={formatMxn(data.totales.entradas)}
        tone="up"
        favoriteId="kpi-flujo-entradas"
      />
      <KpiCard
        label={t("flujo.operativo.outflows")}
        value={formatMxn(data.totales.salidas)}
        tone="down"
        favoriteId="kpi-flujo-salidas"
      />
      <KpiCard
        label={t("flujo.operativo.netFlow")}
        value={formatMxn(data.totales.neto)}
        tone={data.totales.neto >= 0 ? "up" : "down"}
        favoriteId="kpi-flujo-neto"
      />
      <KpiCard
        label={t("flujo.operativo.endingCash")}
        value={formatMxn(data.saldoFinal)}
        favoriteId="kpi-flujo-caja"
      />
    </div>
  );
}

/** Movimientos diarios de caja: entradas contra salidas, sin los KPI de resumen. */
export function FlujoDinamicaDiariaView({ periodo, units }: { periodo: string; units: DisplayUnits }) {
  const { t } = useLocale();
  const { data, loading, error } = useFlujoOperativo(periodo);

  if (loading) return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  if (error) return <DataEmptyState title={t("flujo.loadError")} message={error} />;
  if (!data?.hasData) {
    return (
      <DataEmptyState
        title={t("flujo.operativo.emptyTitle")}
        message={t("flujo.operativo.emptyMessage")}
      />
    );
  }

  return <FlujoOperativoTablero data={data} units={units} />;
}
