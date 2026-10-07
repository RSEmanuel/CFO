"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { useLocale } from "@/context/LocaleContext";
import { RESULTADOS_FAVORITE } from "@/services/favoritesRegistry";
import { useCogsDesglose } from "@/hooks/use-cogs-desglose";
import { CHART, COGS_STACK } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import type { CogsAnalysisRow, CogsColumnCell, CogsLineRef, CogsStackedMix } from "@/services/cogsDesglose";
import { formatMxn } from "@/services/money";
import { PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DisplayMode = "pct" | "mxn" | "ambos";

type CogsAnalisisCardProps = {
  periodo: string;
};

const NA = "N/A";

/** Paleta local del mix de costo. La utilidad conserva el verde del stack; el resto no usa Ember. */
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

function lineLabel(line: CogsLineRef, t: (key: string) => string): string {
  if (line.kind === "rubro" && line.rubroKey) {
    return t(`resultados.cogs.rubros.${line.rubroKey}`);
  }
  return line.nombre;
}

function formatPct(value: number | null): string {
  return value == null ? NA : `${value.toFixed(1)}%`;
}

function formatPp(value: number, suffix: string): string {
  const sign = value > 0.005 ? "+" : value < -0.005 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)} ${suffix}`;
}

function cellPrimary(cell: CogsColumnCell, mode: DisplayMode, role: CogsAnalysisRow["role"]): string {
  if (role === "header") {
    return "";
  }
  if (role === "ratio" || mode === "pct") {
    return formatPct(cell.pct);
  }
  if (mode === "mxn") {
    return cell.monto == null ? NA : formatMxn(cell.monto);
  }
  return cell.monto == null ? formatPct(cell.pct) : formatMxn(cell.monto);
}

function cellSecondary(cell: CogsColumnCell, mode: DisplayMode, role: CogsAnalysisRow["role"]): string | null {
  if (mode !== "ambos" || role === "header" || role === "ratio") {
    return null;
  }
  return formatPct(cell.pct);
}

function variationLines(row: CogsAnalysisRow, mode: DisplayMode, ppLabel: string): { primary: string; secondary: string | null } {
  if (row.role === "header") {
    return { primary: "", secondary: null };
  }
  if (row.role === "ratio" || mode === "pct") {
    return { primary: row.variacionPp == null ? NA : formatPp(row.variacionPp, ppLabel), secondary: null };
  }
  const amount = row.variacionMonto == null ? NA : formatMxn(row.variacionMonto);
  if (mode === "mxn") {
    return { primary: amount, secondary: null };
  }
  return {
    primary: amount,
    secondary: row.variacionPp == null ? NA : formatPp(row.variacionPp, ppLabel),
  };
}

// Costos: subir absorción/importe es adverso (carmesí). Ventas, utilidad y margen: invertDelta, subir es favorable (esmeralda).
function deltaTone(value: number | null, invertDelta: boolean): string {
  if (value == null || Math.abs(value) < 0.005) {
    return "text-muted-foreground";
  }
  const favorable = invertDelta ? value > 0 : value < 0;
  return favorable ? "text-[var(--cifra-good)]" : "text-[var(--cifra-bad)]";
}

export function CogsAnalisisCard({ periodo }: CogsAnalisisCardProps) {
  const { t } = useLocale();
  const { data, loading, error } = useCogsDesglose(periodo);
  const [mode, setMode] = useState<DisplayMode>("ambos");

  const chartData = useMemo(() => {
    if (!data?.analisis) {
      return [];
    }
    const { mesAnterior, mesActual } = data.analisis.stacked;
    const point = (name: string, mix: CogsStackedMix) => {
      const row: Record<string, string | number | CogsStackedMix> = {
        name,
        utilidadPct: mix.pctUtilidad ?? 0,
        mix,
      };
      for (const segment of mix.segmentos) {
        row[segment.id] = segment.pct ?? 0;
      }
      return row;
    };
    return [point(t("resultados.cogs.mesAnterior"), mesAnterior), point(t("resultados.cogs.mesActual"), mesActual)];
  }, [data, t]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }

  if (error || !data || !data.analisis) {
    return (
      <section className="rounded-card border border-dashed border-border bg-card/60 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
            <PackageSearch className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-sans text-lg font-medium text-foreground">{t("resultados.cogs.analisisTitle")}</h3>
            <p className="text-sm text-muted-foreground">{error ?? t("resultados.incomeMixEmpty")}</p>
          </div>
        </div>
      </section>
    );
  }

  const modes: Array<{ value: DisplayMode; labelKey: string }> = [
    { value: "pct", labelKey: "resultados.cogs.modePct" },
    { value: "mxn", labelKey: "resultados.cogs.modeMxn" },
    { value: "ambos", labelKey: "resultados.cogs.modeBoth" },
  ];

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div>
            <h3 className="font-sans text-xl font-medium text-foreground">{t("resultados.cogs.analisisTitle")}</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("resultados.cogs.analisisHelp")}</p>
          </div>
          <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.cogsAnalisis} label={t("resultados.cogs.analisisTitle")} />
        </div>
        <div className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5">
          {modes.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={cn(
                "h-9 rounded-control px-3 text-sm font-medium transition-colors",
                mode === option.value
                  ? "bg-secondary text-clay shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-pressed={mode === option.value}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: CHART.mute, fontSize: 11 }} axisLine={{ stroke: CHART.mute, opacity: 0.3 }} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: CHART.mute, fontSize: 11 }}
                tickFormatter={(value: number) => `${value}%`}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(26,25,21,0.04)" }}
                formatter={(_value, _name, item) => {
                  const entry = item as { dataKey?: unknown; payload?: { mix?: CogsStackedMix } };
                  const mix = entry.payload?.mix;
                  const dataKey = String(entry.dataKey ?? "");
                  if (!mix) {
                    return ["", ""];
                  }
                  if (dataKey === "utilidadPct") {
                    return [`${formatPct(mix.pctUtilidad)} · ${formatMxn(mix.utilidad)}`, t("resultados.cogs.chartUtilidad")];
                  }
                  const segment = mix.segmentos.find((candidate) => candidate.id === dataKey);
                  const label = segment ? lineLabel(segment, t) : dataKey;
                  return [`${formatPct(segment?.pct ?? null)} · ${formatMxn(segment?.monto ?? 0)}`, label];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.analisis.stacked.mesActual.segmentos.map((segment, index) => (
                <Bar
                  key={segment.id}
                  dataKey={segment.id}
                  name={lineLabel(segment, t)}
                  stackId="mix"
                  fill={COGS_LINE_PALETTE[index % COGS_LINE_PALETTE.length]}
                  isAnimationActive={false}
                />
              ))}
              <Bar
                dataKey="utilidadPct"
                name={t("resultados.cogs.chartUtilidad")}
                stackId="mix"
                fill={COGS_STACK.utilidad}
                isAnimationActive={false}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">{t("resultados.cogs.concepto")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.cogs.acumulado")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.cogs.mesActual")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.cogs.mesAnterior")}</th>
                <th className="pb-2 text-right font-medium">{t("resultados.cogs.variacion")}</th>
              </tr>
            </thead>
            <tbody>
              {data.analisis.filas.map((row) => {
                const variation = variationLines(row, mode, t("resultados.cogs.pp"));
                const toneValue = mode === "mxn" ? row.variacionMonto : row.variacionPp;
                return (
                  <AnalisisRow
                    key={row.key}
                    row={row}
                    mode={mode}
                    label={row.line ? lineLabel(row.line, t) : t(`resultados.cogs.rows.${row.key}`)}
                    variation={variation}
                    tone={deltaTone(toneValue, row.invertDelta)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AnalisisRow({
  row,
  mode,
  label,
  variation,
  tone,
}: {
  row: CogsAnalysisRow;
  mode: DisplayMode;
  label: string;
  variation: { primary: string; secondary: string | null };
  tone: string;
}) {
  const isHeader = row.role === "header";
  const isSub = row.role === "sub";
  const isTotalCosto = row.key === "totalCosto";
  const isResult = row.key === "utilidadBruta";
  return (
    <tr
      className={cn(
        "border-t border-border/40",
        isTotalCosto && "border-t-2 border-t-foreground/40",
        isResult && "bg-[var(--cifra-good-soft)]/70",
        isHeader && "font-semibold",
      )}
    >
      <td
        className={cn(
          "py-2 pr-3 text-foreground",
          isSub && "pl-6 text-muted-foreground",
          isHeader && "font-semibold",
          isResult && "font-semibold underline decoration-double decoration-[var(--cifra-good)] underline-offset-4",
        )}
      >
        {isResult ? (
          <span className="inline-flex items-center rounded-full bg-[var(--cifra-good)]/15 px-2 py-0.5 text-foreground">{label}</span>
        ) : (
          label
        )}
      </td>
      <MoneyCells cell={row.acumulado} mode={mode} role={row.role} />
      <MoneyCells cell={row.mesActual} mode={mode} role={row.role} />
      <MoneyCells cell={row.mesAnterior} mode={mode} role={row.role} />
      <td className={cn("financial-nums py-2 text-right", tone)}>
        {isHeader ? null : (
          <>
            <div>{variation.primary}</div>
            {variation.secondary ? <div className="text-[11px] opacity-80">{variation.secondary}</div> : null}
          </>
        )}
      </td>
    </tr>
  );
}

function MoneyCells({
  cell,
  mode,
  role,
}: {
  cell: CogsColumnCell;
  mode: DisplayMode;
  role: CogsAnalysisRow["role"];
}) {
  const primary = cellPrimary(cell, mode, role);
  const secondary = cellSecondary(cell, mode, role);
  return (
    <>
      <td className="financial-nums py-2 pr-3 text-right text-foreground">
        {primary}
        {secondary ? <div className="text-[11px] text-muted-foreground">{secondary}</div> : null}
      </td>
    </>
  );
}
