"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { RESULTADOS_FAVORITE } from "@/services/favoritesRegistry";
import { EbitdaEbitTtmChart } from "@/components/resultados/EbitdaEbitTtmChart";
import { useLocale } from "@/context/LocaleContext";
import { useEstadoOperativo } from "@/hooks/use-estado-operativo";
import { cn } from "@/lib/utils";
import type { ErCell, ErRow, ErRowKey } from "@/services/estadoOperativo";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { formatMxn } from "@/services/money";
import { FileText } from "lucide-react";
import { useState } from "react";

type DisplayMode = "pct" | "mxn" | "ambos";

type EstadoOperativoCardProps = {
  periodo: string;
};

const NA = "N/A";

function formatPct(value: number | null): string {
  return value == null ? NA : `${value.toFixed(1)}%`;
}

function formatPp(value: number, suffix: string): string {
  const sign = value > 0.005 ? "+" : value < -0.005 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)} ${suffix}`;
}

function cellPrimary(cell: ErCell, mode: DisplayMode): string {
  if (mode === "pct") {
    return formatPct(cell.pct);
  }
  if (mode === "mxn") {
    return cell.monto == null ? NA : formatMxn(cell.monto);
  }
  return cell.monto == null ? formatPct(cell.pct) : formatMxn(cell.monto);
}

function cellSecondary(cell: ErCell, mode: DisplayMode): string | null {
  if (mode !== "ambos") {
    return null;
  }
  return formatPct(cell.pct);
}

function variationLines(row: ErRow, mode: DisplayMode, ppLabel: string): { primary: string; secondary: string | null } {
  if (mode === "pct") {
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

// Utilidades, ventas y productos: subir es favorable (esmeralda).
// Costos, gastos e impuestos: subir es adverso (carmesí).
function deltaTone(value: number | null, invertDelta: boolean): string {
  if (value == null || Math.abs(value) < 0.005) {
    return "text-muted-foreground";
  }
  const favorable = invertDelta ? value > 0 : value < 0;
  return favorable ? "text-[var(--cifra-good)]" : "text-[var(--cifra-bad)]";
}

/**
 * Rubros del ER con drill-down a pólizas. El endpoint matchea por prefijo de
 * segmento, así que cada rubro apunta a los segmentos de cuenta que agrega
 * (catálogo CONTPAQi del tenant: 4xx = 4101/4103/4201, etc.). Los renglones
 * calculados (subtotales y resultados) y el catch-all "otrosOperativos" no
 * son auditable por prefijo y quedan sin drill-down.
 */
const ER_AUDIT_PREFIXES: Partial<Record<ErRowKey, string>> = {
  ventas: "4101,4103,4201",
  costo: "5101",
  gastosVenta: "6101",
  gastosAdmin: "6201",
  daContable: "6301",
  ptu: "6405",
  isr: "6406",
  productosFinancieros: "7102,7104",
  gastosFinancieros: "8101",
};

export function EstadoOperativoCard({ periodo }: EstadoOperativoCardProps) {
  const { t } = useLocale();
  const { data, loading, error } = useEstadoOperativo(periodo);
  const [mode, setMode] = useState<DisplayMode>("ambos");
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);
  const auditPeriod = parseIngresoPeriodo(periodo);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }

  if (error || !data) {
    return (
      <section className="rounded-card border border-dashed border-border bg-card/60 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-sans text-lg font-medium text-foreground">{t("resultados.operativo.title")}</h3>
            <p className="text-sm text-muted-foreground">{error ?? t("resultados.operativo.empty")}</p>
          </div>
        </div>
      </section>
    );
  }

  const modes: Array<{ value: DisplayMode; labelKey: string }> = [
    { value: "pct", labelKey: "resultados.operativo.modePct" },
    { value: "mxn", labelKey: "resultados.operativo.modeMxn" },
    { value: "ambos", labelKey: "resultados.operativo.modeBoth" },
  ];

  return (
    <div className="space-y-6">
      <EbitdaEbitTtmChart ttm={data.ttm} />

      <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <div>
              <h3 className="font-sans text-xl font-medium text-foreground">{t("resultados.operativo.title")}</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("resultados.operativo.help")}</p>
            </div>
            <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.estadoOperativo} label={t("resultados.operativo.title")} />
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">{t("resultados.operativo.concepto")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.operativo.acumulado")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.operativo.mesActual")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.operativo.mesAnterior")}</th>
                <th className="pb-2 text-right font-medium">{t("resultados.operativo.variacion")}</th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map((row) => {
                const variation = variationLines(row, mode, t("resultados.operativo.pp"));
                const toneValue = mode === "mxn" ? row.variacionMonto : row.variacionPp;
                const auditPrefix = ER_AUDIT_PREFIXES[row.key] ?? null;
                const label = t(`resultados.operativo.rows.${row.key}`);
                return (
                  <EstadoRow
                    key={row.key}
                    row={row}
                    mode={mode}
                    label={label}
                    variation={variation}
                    tone={deltaTone(toneValue, row.invertDelta)}
                    onAudit={
                      auditPrefix && auditPeriod
                        ? () =>
                            setAuditTarget({
                              codigoCuenta: auditPrefix,
                              nombreCuenta: label,
                              anio: auditPeriod.anio,
                              periodo: auditPeriod.mes,
                            })
                        : null
                    }
                    auditHint={t("polizas.audit.drillHint")}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  );
}

function EstadoRow({
  row,
  mode,
  label,
  variation,
  tone,
  onAudit,
  auditHint,
}: {
  row: ErRow;
  mode: DisplayMode;
  label: string;
  variation: { primary: string; secondary: string | null };
  tone: string;
  onAudit: (() => void) | null;
  auditHint: string;
}) {
  const isSub = row.level > 0;
  const isTotal = row.role === "total";
  const isResult = row.role === "result";
  const isBottomLine = row.key === "utilidadNeta";
  return (
    <tr
      className={cn(
        "border-t border-border/40",
        isTotal && "border-t-2 border-t-foreground/40 font-semibold",
        isResult && "bg-[var(--cifra-good-soft)]/50 font-semibold",
        isBottomLine && "bg-[var(--cifra-good-soft)]/70",
        onAudit && "cursor-pointer transition-colors hover:bg-secondary/60",
      )}
      onClick={onAudit ?? undefined}
      title={onAudit ? auditHint : undefined}
    >
      <td
        className={cn(
          "py-2 pr-3 text-foreground",
          isSub && "pl-6 text-muted-foreground",
          isBottomLine && "underline decoration-double decoration-[var(--cifra-good)] underline-offset-4",
        )}
      >
        {isBottomLine ? (
          <span className="inline-flex items-center rounded-full bg-[var(--cifra-good)]/15 px-2 py-0.5 text-foreground">{label}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {label}
            {onAudit ? <FileText className="h-3.5 w-3.5 text-muted-foreground/50" /> : null}
          </span>
        )}
      </td>
      <MoneyCell cell={row.acumulado} mode={mode} />
      <MoneyCell cell={row.mesActual} mode={mode} />
      <MoneyCell cell={row.mesAnterior} mode={mode} />
      <td className={cn("financial-nums py-2 text-right", tone)}>
        <div>{variation.primary}</div>
        {variation.secondary ? <div className="text-[11px] opacity-80">{variation.secondary}</div> : null}
      </td>
    </tr>
  );
}

function MoneyCell({ cell, mode }: { cell: ErCell; mode: DisplayMode }) {
  const primary = cellPrimary(cell, mode);
  const secondary = cellSecondary(cell, mode);
  return (
    <td className="financial-nums py-2 pr-3 text-right text-foreground">
      {primary}
      {secondary ? <div className="text-[11px] text-muted-foreground">{secondary}</div> : null}
    </td>
  );
}
