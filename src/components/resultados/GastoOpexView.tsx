"use client";

import { useLocale } from "@/context/LocaleContext";
import { useGastoOpex } from "@/hooks/use-gasto-opex";
import { monthLabelKey } from "@/i18n/format";
import { CHART, CHART_AXIS, OPEX_SPLIT, TOP5_RESTO, TOP5_SERIES } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import type { BudgetProjectionPayload } from "@/services/budgetProjectionService";
import type { MonthlyFinancials } from "@/services/financialDataTransformer";
import { calculateTopKPIs } from "@/services/resultadosKpis";
import { OTROS_KEY, type Top5ChartSeries, type Top5EntitySeries } from "@/services/resultadosTop5";
import { Tooltip as Hint, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExpenseAlertsCard } from "@/components/resultados/ExpenseAlertsCard";
import { GastoOpexTreemap } from "@/components/resultados/GastoOpexTreemap";
import { AlertTriangle, CheckCircle2, HelpCircle, Receipt } from "lucide-react";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type GastoOpexViewProps = {
  periodo: string;
  units: DisplayUnits;
  comparable: string;
  budgetPayload?: BudgetProjectionPayload | null;
  rows: MonthlyFinancials[];
};

const KPI_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2,
});

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

function seriesColor(index: number, key: string): string {
  return key === OTROS_KEY ? TOP5_RESTO : TOP5_SERIES[index % TOP5_SERIES.length];
}

function localeMonthLabel(key: string, t: (id: string) => string): string {
  const match = key.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return key;
  }
  const abbr = t(monthLabelKey(Number(match[2]) - 1)).slice(0, 3);
  return `${abbr}-${match[1].slice(-2)}`;
}

function formatDelta(deltaPct: number): string {
  const pct = deltaPct * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatSignedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatPesos(value: number): string {
  return `$${value.toFixed(2)}`;
}

const SPLIT_COLORS = OPEX_SPLIT;

function splitSegments(split: {
  venta: number;
  admin: number;
  otros: number;
  pctVenta: number | null;
  pctAdmin: number | null;
  pctOtros: number | null;
}) {
  const includeOtros = Math.abs(split.otros) > 0.005;
  const ventaW = Math.max(0, split.venta);
  const adminW = Math.max(0, split.admin);
  const otrosW = includeOtros ? Math.max(0, split.otros) : 0;
  const denom = ventaW + adminW + otrosW;
  return [
    { key: "venta" as const, pct: split.pctVenta, width: denom > 0 ? (ventaW / denom) * 100 : 0, color: SPLIT_COLORS.venta },
    { key: "admin" as const, pct: split.pctAdmin, width: denom > 0 ? (adminW / denom) * 100 : 0, color: SPLIT_COLORS.admin },
    ...(includeOtros
      ? [{ key: "otros" as const, pct: split.pctOtros, width: denom > 0 ? (otrosW / denom) * 100 : 0, color: SPLIT_COLORS.otros }]
      : []),
  ];
}

function chartRows(series: Top5ChartSeries, t: (id: string) => string, restLabel: string) {
  const actors: Top5EntitySeries[] = [
    ...series.entidades,
    ...(series.resto ? [{ ...series.resto, label: restLabel }] : []),
  ];
  return series.months.map((month, index) => {
    const row: Record<string, string | number> = {
      month: localeMonthLabel(month.key, t),
      total: series.total[index] ?? 0,
    };
    for (const actor of actors) {
      row[actor.key] = actor.series[index] ?? 0;
    }
    return row;
  });
}

function shiftPeriodo(periodo: string, deltaMonths: number): string {
  const [year, month] = periodo.split("-").map(Number);
  const date = new Date((year || 2025), (month || 12) - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type OpexXTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string; index?: number };
  units: DisplayUnits;
  totalsByMonth: Map<string, number>;
  chartData?: Array<Record<string, string | number>>;
};

function OpexXTick({
  x = 0,
  y = 0,
  payload,
  units,
  totalsByMonth,
  chartData,
}: OpexXTickProps) {
  const month = String(payload?.value ?? "");
  const totalFromMap = totalsByMonth.get(month);
  const total =
    totalFromMap !== undefined
      ? totalFromMap
      : payload?.index != null && chartData
        ? Number(chartData[payload.index]?.total ?? 0)
        : 0;
  const formattedTotal = formatAxisTick(total, units);

  return (
    <g transform={`translate(${x},${y})`}>
      <text transform="rotate(-35)" textAnchor="end">
        <tspan x={0} dy={12} fill={CHART.mute} fontSize={11}>
          {month}
        </tspan>
        <tspan x={0} dy={14} fill={CHART.clay} fontSize={10} fontWeight={600}>
          {formattedTotal}
        </tspan>
      </text>
    </g>
  );
}

function OpexTooltip({
  active,
  payload,
  label,
  totalLabel,
  names,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string;
    value?: number;
    color?: string;
    payload?: Record<string, unknown>;
  }>;
  label?: string | number;
  totalLabel: string;
  names: Record<string, string>;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const total = Number(payload[0]?.payload?.total ?? 0);
  const breakdown = payload
    .filter((item) => String(item.dataKey) !== "total")
    .map((item) => ({
      key: String(item.dataKey ?? ""),
      name: names[String(item.dataKey)] ?? item.name ?? "",
      color: item.color ?? CHART.mute,
      value: Number(item.value ?? 0),
    }))
    .sort((a, b) => b.value - a.value);
  const pctOf = (monto: number) => (total > 0.01 ? (monto / total) * 100 : 0);

  return (
    <div className="min-w-52 px-3 py-2 text-xs text-foreground" style={TOOLTIP_STYLE}>
      <p className="mb-1 font-medium">{label}</p>
      <p className="font-semibold text-clay">
        {totalLabel}: {formatMxn(total)}
      </p>
      <div className="mt-2 space-y-1 border-t border-border pt-2">
        {breakdown.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="truncate" title={row.name}>
                {row.name}
              </span>
            </span>
            <span className="financial-nums shrink-0 text-foreground">
              {formatMxn(row.value)} · {pctOf(row.value).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GastoOpexView({ periodo, units, comparable, budgetPayload, rows }: GastoOpexViewProps) {
  const { t } = useLocale();
  const { data, loading, error } = useGastoOpex(periodo);
  const restLabel = t("resultados.opex.others");
  const kpis = useMemo(
    () => calculateTopKPIs(rows, "Gasto", periodo, budgetPayload, data?.totalesPorMes),
    [rows, periodo, budgetPayload, data],
  );

  const kpiTitle = (card: (typeof kpis.cards)[number]) => {
    if (card.key === "promedio3M") return t("resultados.average3m");
    if (card.key === "mesAnterior") return t("resultados.previousMonth");
    if (card.key === "anoAnterior") return t("resultados.previousYear");
    if (card.key === "trimAnterior") return t("resultados.previousQuarter");
    return t(card.title === "Presupuesto oficial" ? "resultados.officialBudget" : "resultados.monthProjection");
  };

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }

  const comparablePeriod = comparable === "mom" ? shiftPeriodo(periodo, -1) : shiftPeriodo(periodo, -12);
  const comparableTotal = data?.totalesPorMes[comparablePeriod];
  const comparableLabel = data ? localeMonthLabel(comparablePeriod, t) : null;

  if (error || !data) {
    return (
      <section className="rounded-card border border-dashed border-border bg-card/60 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
            <Receipt className="h-4 w-4" />
          </span>
          <p className="text-sm text-muted-foreground">{error ?? t("resultados.opex.loadError")}</p>
        </div>
      </section>
    );
  }

  const actors: Top5EntitySeries[] = [
    ...data.series.entidades,
    ...(data.series.resto ? [{ ...data.series.resto, label: restLabel }] : []),
  ];
  const names = Object.fromEntries(actors.map((actor) => [actor.key, actor.label || restLabel]));
  const chartData = chartRows(data.series, t, restLabel);
  const totalsByMonth = new Map<string, number>();
  for (const row of chartData) {
    if (typeof row.month === "string") {
      totalsByMonth.set(row.month, Number(row.total ?? 0));
    }
  }
  const rankingTotal = data.totalOpex;
  const pctOf = (monto: number) => (rankingTotal > 0.01 ? (monto / rankingTotal) * 100 : 0);
  const control = data.control;
  const splitRows = splitSegments(control.split);
  const splitLabel = (key: "venta" | "admin" | "otros") =>
    t(key === "venta" ? "resultados.opex.splitVenta" : key === "admin" ? "resultados.opex.splitAdmin" : "resultados.opex.splitOtros");
  // Badge de la tarjeta: >0 verde ("Crecimiento Eficiente"), ≤0 rojo/ámbar.
  const jawsPositive = control.jaws != null && control.jaws.jawsPp > 0;
  const jawsVentasGanan =
    control.jaws != null && control.jaws.deltaIngresosPct > control.jaws.deltaOpexPct;
  const laborHintAccounts = control.laboral.cuentas
    .filter((cuenta) => Math.abs(cuenta.monto) > 0.005)
    .map((cuenta) => `${cuenta.idCuenta} ${cuenta.nombreCuenta}`)
    .join(" · ");

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <article className="rounded-card border border-category-marginsFg/20 bg-category-margins px-4 py-3 shadow-[var(--shadow-card)]">
          <p className="font-serif text-base text-foreground">{t("resultados.opex.absorptionTitle")}</p>
          <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
            {control.absorcionPct == null ? t("resultados.opex.na") : `${control.absorcionPct.toFixed(1)}%`}
          </p>
          {control.pesosPorPeso == null ? null : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("resultados.opex.absorptionHint", { pesos: formatPesos(control.pesosPorPeso) })}
            </p>
          )}
        </article>

        <article
          className={cn(
            "rounded-card border px-4 py-3 shadow-[var(--shadow-card)]",
            control.jaws == null
              ? "border-border bg-card"
              : jawsPositive
                ? "border-category-marginsFg/20 bg-category-margins"
                : "border-category-solvencyFg/20 bg-category-solvency",
          )}
        >
          <div className="flex items-center gap-1.5">
            <p className="font-serif text-base text-foreground">{t("resultados.opex.jawsTitle")}</p>
            <Hint>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("resultados.opex.jawsHelp")}
                  className="text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("resultados.opex.jawsHelp")}</TooltipContent>
            </Hint>
          </div>
          {control.jaws ? (
            <>
              <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
                {formatSignedPct(control.jaws.jawsPp)}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  jawsPositive ? "bg-category-margins text-favorable" : "bg-category-solvency text-desfavorable",
                )}
              >
                {jawsPositive ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {t(jawsPositive ? "resultados.opex.jawsHealthy" : "resultados.opex.jawsInverted")}
              </span>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("resultados.opex.jawsNarrative", {
                  deltaIngresos: formatSignedPct(control.jaws.deltaIngresosPct),
                  deltaOpex: formatSignedPct(control.jaws.deltaOpexPct),
                  periodo: localeMonthLabel(control.jaws.periodoAnterior, t),
                })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(jawsVentasGanan ? "resultados.opex.jawsNarrativePositive" : "resultados.opex.jawsNarrativeNegative")}
              </p>
            </>
          ) : (
            <Hint>
              <TooltipTrigger asChild>
                <p className="financial-nums mt-2 cursor-help text-2xl font-semibold tracking-tight underline decoration-dotted underline-offset-4">
                  {t("resultados.opex.jawsUnavailable")}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("resultados.opex.jawsUnavailableHint")}</TooltipContent>
            </Hint>
          )}
        </article>

        <article className="rounded-card border border-category-efficiencyFg/20 bg-category-efficiency px-4 py-3 shadow-[var(--shadow-card)]">
          <p className="font-serif text-base text-foreground">{t("resultados.opex.laborTitle")}</p>
          <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight" title={laborHintAccounts || undefined}>
            {KPI_FORMATTER.format(control.laboral.monto)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {control.laboral.pctOpex == null
              ? t("resultados.opex.laborEmpty")
              : t("resultados.opex.laborHint", { pct: control.laboral.pctOpex.toFixed(1) })}
          </p>
        </article>

        <article className="rounded-card border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
          <p className="font-serif text-base text-foreground">{t("resultados.opex.splitTitle")}</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {splitRows
              .map((row) => `${row.pct == null ? t("resultados.opex.na") : `${row.pct.toFixed(1)}%`} ${splitLabel(row.key)}`)
              .join(" | ")}
          </p>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary">
            {splitRows.map((row) => (
              <span key={row.key} className="h-full" style={{ width: `${row.width}%`, backgroundColor: row.color }} />
            ))}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {splitRows.map((row) => (
              <span key={row.key} className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.color }} />
                {splitLabel(row.key)}
              </span>
            ))}
          </p>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.cards.map((card) => (
          <article key={card.key} className="rounded-card border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
            <p className="font-serif text-base text-foreground">{kpiTitle(card)}</p>
            <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
              {card.value == null ? "N/A" : KPI_FORMATTER.format(card.value)}
            </p>
            {card.deltaPct == null ? null : (
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                  card.deltaPct >= 0
                    ? "bg-category-margins text-favorable"
                    : "bg-category-solvency text-desfavorable",
                )}
              >
                {formatDelta(card.deltaPct)}
              </span>
            )}
          </article>
        ))}
      </div>

      <section className="flex flex-col gap-6 rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)] md:flex-row">
        <div className="flex w-full min-w-0 flex-col md:w-[40%]">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
              <Receipt className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-serif text-xl font-medium text-foreground">{t("resultados.opex.title")}</h2>
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {t("resultados.monthly")} | {units.toUpperCase()} | MXN
              </p>
            </div>
          </div>
          <p className="financial-nums text-4xl font-semibold tracking-tight">
            {formatAxisTick(data.totalOpex, units)}
          </p>
          {Object.prototype.hasOwnProperty.call(data.totalesPorMes, comparablePeriod) ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {comparable === "mom" ? "MoM" : "YoY"} {comparableLabel}: {formatAxisTick(comparableTotal ?? 0, units)}
            </p>
          ) : null}

          <h3 className="mb-3 mt-6 font-serif text-lg font-medium text-foreground">
            {t("resultados.opex.mainItems")}
          </h3>
          {actors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("resultados.opex.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {actors.map((actor, index) => (
                <li key={actor.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: seriesColor(index, actor.key),
                      ...(actor.key === OTROS_KEY ? { outline: `1px dashed ${TOP5_RESTO}` } : {}),
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground" title={actor.label || restLabel}>
                    {actor.label || restLabel}
                  </span>
                  <span className="financial-nums text-muted-foreground">{formatMxn(actor.monto)}</span>
                  <span className="financial-nums w-14 text-right font-medium text-foreground">
                    {pctOf(actor.monto).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="h-[320px] w-full min-w-0 md:h-[360px] md:w-[60%]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={CHART_AXIS.stroke} vertical={false} />
              <XAxis
                dataKey="month"
                tick={<OpexXTick units={units} totalsByMonth={totalsByMonth} chartData={chartData} />}
                axisLine={{ stroke: CHART.mute, opacity: 0.3 }}
                tickLine={false}
                interval={0}
                height={72}
              />
              <YAxis
                tick={{ fill: CHART.mute, fontSize: 11 }}
                tickFormatter={(value: number) => formatAxisTick(Number(value), units)}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<OpexTooltip totalLabel={t("resultados.opex.total")} names={names} />} />
              {actors.map((actor, index) => (
                <Line
                  key={actor.key}
                  type="monotone"
                  dataKey={actor.key}
                  name={actor.label || restLabel}
                  stroke={seriesColor(index, actor.key)}
                  strokeWidth={actor.key === OTROS_KEY ? 1.5 : 2}
                  strokeDasharray={actor.key === OTROS_KEY ? "3 3" : undefined}
                  dot={actor.key === OTROS_KEY ? { r: 2 } : { r: 3 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <GastoOpexTreemap periodo={data.periodo} treemap={data.treemap} />

      <ExpenseAlertsCard periodo={data.periodo} alertas={data.alertas} />
    </div>
    </TooltipProvider>
  );
}
