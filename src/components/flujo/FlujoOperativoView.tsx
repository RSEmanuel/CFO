"use client";

import { ExpandableShell } from "@/components/charts/ExpandableChartCard";
import { DataEmptyState } from "@/components/data-empty-state";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
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
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLOR_ENTRADAS = "var(--cifra-good)";
const COLOR_SALIDAS = "var(--cifra-bad)";
const COLOR_SALDO = CHART.clay;

const TOOLTIP_STYLE = {
  background: CHART_VARS.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

type OperativoRow = {
  dia: string;
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

function SaldoStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="cifra-num mt-0.5 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/**
 * "Tu caja día a día": saldo de caja y bancos al cierre de cada día (cuadra con el auxiliar de
 * bancos), con el día más bajo marcado y qué hacer al respecto. Entradas y salidas del día se
 * quedan en el tooltip: la pregunta es cuándo estuvo más apretada la caja, no qué se movió cada día.
 */
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
    saldoAcumulado: punto.saldoAcumulado,
    punto,
  }));
  // Primer día con el saldo más bajo del mes.
  const minimo = chartData.reduce<OperativoRow | null>(
    (low, row) => (low == null || row.saldoAcumulado < low.saldoAcumulado ? row : low),
    null,
  );
  const enNegativo = minimo != null && minimo.saldoAcumulado < 0;
  const diaMinimo = minimo ? String(Number(minimo.dia)) : "";
  // Etiquetas del eje cada 5 días (01, 05, 10…) en lugar de días alternos.
  const ticks = chartData.map((row) => row.dia).filter((dia) => Number(dia) === 1 || Number(dia) % 5 === 0);
  const yMin = Math.min(0, minimo?.saldoAcumulado ?? 0);

  return (
    <ExpandableShell className="p-5">
      {(toggle, expanded) => (
        <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-sans text-lg font-medium text-foreground">
                {t("flujo.operativo.saldoDiario.title")} · {data.periodo}
              </h3>
              <p className="text-sm text-muted-foreground">{t("flujo.operativo.saldoDiario.help")}</p>
            </div>
            <div className="flex items-center gap-2">
              <FavoriteStarButton widgetId="chart-tablero-diario" label={t("flujo.operativo.saldoDiario.title")} />
              <span className="text-xs text-muted-foreground">
                {t("flujo.operativo.accountsCovered", {
                  count: data.cuentas.length,
                  moneda: data.moneda,
                })}
              </span>
              {toggle}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SaldoStat label={t("flujo.operativo.saldoDiario.opening")} value={formatMxn(data.saldoInicial)} />
            <SaldoStat label={t("flujo.operativo.saldoDiario.closing")} value={formatMxn(data.saldoFinal)} />
            {minimo ? (
              <SaldoStat
                label={t("flujo.operativo.saldoDiario.lowest")}
                value={formatMxn(minimo.saldoAcumulado)}
                detail={t("flujo.operativo.saldoDiario.lowestDay", { dia: diaMinimo })}
              />
            ) : null}
          </div>

          {minimo ? (
            <p className="mt-3 text-sm text-foreground">
              {enNegativo
                ? t("flujo.operativo.saldoDiario.insightNegative", {
                    dia: diaMinimo,
                    monto: formatMxn(-minimo.saldoAcumulado),
                  })
                : t("flujo.operativo.saldoDiario.insightLowest", {
                    dia: diaMinimo,
                    monto: formatMxn(minimo.saldoAcumulado),
                  })}
            </p>
          ) : null}

          <div className={cn("mt-4 w-full min-w-0", expanded ? "min-h-0 flex-1" : "h-[340px]")}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 16, right: 16, left: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_VARS.axis} strokeOpacity={0.6} />
                <XAxis
                  dataKey="dia"
                  ticks={ticks}
                  interval={0}
                  tick={{ fill: CHART_VARS.mute, fontSize: 12, fontFamily: "var(--cifra-font-mono)" }}
                  axisLine={{ stroke: CHART_VARS.axis }}
                  tickLine={false}
                />
                <YAxis
                  width={76}
                  domain={[yMin, "auto"]}
                  tick={{ fill: CHART_VARS.mute, fontSize: 12, fontFamily: "var(--cifra-font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => formatAxisTick(Number(value), units)}
                />
                {enNegativo ? (
                  <ReferenceArea
                    y1={yMin}
                    y2={0}
                    fill="color-mix(in srgb, var(--cifra-bad) 12%, transparent)"
                    fillOpacity={1}
                  />
                ) : null}
                <ReferenceLine y={0} stroke={CHART_VARS.axis} strokeDasharray="3 3" />
                <Tooltip cursor={{ stroke: CHART_VARS.axis }} content={<OperativoTooltip />} />
                <Area
                  type="monotone"
                  dataKey="saldoAcumulado"
                  name={t("flujo.operativo.cashBalance")}
                  stroke={COLOR_SALDO}
                  strokeWidth={2.5}
                  fill="color-mix(in srgb, var(--cifra-brand) 10%, transparent)"
                  fillOpacity={1}
                  baseValue={yMin}
                  dot={false}
                  activeDot={{ r: 4, fill: COLOR_SALDO, stroke: "var(--cifra-surface)", strokeWidth: 2 }}
                />
                {minimo ? (
                  <ReferenceDot
                    x={minimo.dia}
                    y={minimo.saldoAcumulado}
                    r={5}
                    fill={enNegativo ? "var(--cifra-bad)" : COLOR_SALDO}
                    stroke="var(--cifra-surface)"
                    strokeWidth={2}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {data.totales.traspasos > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("flujo.operativo.traspasosNote", { amount: formatMxn(data.totales.traspasos) })}
            </p>
          ) : null}
        </>
      )}
    </ExpandableShell>
  );
}

/**
 * Tablero diario de tesorería: KPIs de entradas/salidas reales del auxiliar
 * de caja y bancos CONTPAQi (reportes 06/07) y la línea del saldo de caja al
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

/** "Tu caja día a día" (pestaña Dinámica diaria), sin los KPI de resumen. */
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
