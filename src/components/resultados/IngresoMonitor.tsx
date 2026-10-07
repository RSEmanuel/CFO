"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { RESULTADOS_FAVORITE } from "@/services/favoritesRegistry";
import { useLocale } from "@/context/LocaleContext";
import { useIngresoCalidad } from "@/hooks/use-ingreso-calidad";
import { cn } from "@/lib/utils";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import type { IngresoTablaRow } from "@/services/ingresoCalidad";
import { formatCompactAxis, formatMxn } from "@/services/money";
import { ArrowDown, ArrowUp, Gauge, ReceiptText } from "lucide-react";
import { useState } from "react";

type IngresoMonitorPart = "calidad" | "pacing" | "tabla";

type IngresoMonitorProps = {
  periodo: string;
  part?: IngresoMonitorPart;
};

const BAR_BRUTAS = "var(--cifra-ink)";
const BAR_DEDUCCIONES = "var(--cifra-bad)";
const BAR_NETAS = "var(--cifra-good)";

function formatSignedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function DeltaPill({ value }: { value: number | null }) {
  const { t } = useLocale();
  if (value == null) {
    return <span className="text-muted-foreground">{t("resultados.ingreso.na")}</span>;
  }
  const up = value > 0;
  const down = value < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 font-medium",
        up ? "text-favorable" : down ? "text-desfavorable" : "text-muted-foreground",
      )}
    >
      {up ? <ArrowUp className="h-3.5 w-3.5" /> : down ? <ArrowDown className="h-3.5 w-3.5" /> : null}
      {formatSignedPct(value)}
    </span>
  );
}

function ImpactBar({
  label,
  amount,
  widthPct,
  color,
  negative,
}: {
  label: string;
  amount: number;
  widthPct: number;
  color: string;
  negative?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(10rem,1.2fr)_minmax(10rem,2fr)_minmax(7rem,auto)] items-center gap-3">
      <p className="truncate text-sm text-foreground" title={label}>
        {label}
      </p>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, widthPct))}%`, backgroundColor: color }}
        />
      </div>
      <p
        className={cn(
          "financial-nums text-right text-sm font-medium",
          negative && amount > 0.005 ? "text-desfavorable" : "text-foreground",
        )}
      >
        {negative && amount > 0.005 ? `−${formatMxn(amount)}` : formatMxn(amount)}
      </p>
    </div>
  );
}

export function IngresoMonitor({ periodo, part }: IngresoMonitorProps) {
  const { t } = useLocale();
  const { data, loading, error } = useIngresoCalidad(periodo);
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);
  const auditPeriod = parseIngresoPeriodo(periodo);

  if (loading) {
    return <div className="h-72 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data) {
    return (
      <section className="rounded-card border border-dashed border-border bg-card/60 p-6">
        <p className="text-sm text-muted-foreground">{error ?? t("resultados.ingreso.loadError")}</p>
      </section>
    );
  }

  const { calidad, pacing, tabla } = data;
  const brutasBase = calidad.ventasBrutas > 0.005 ? calidad.ventasBrutas : 0;
  const pacingTexto = pacing.esCierre
    ? t("resultados.ingreso.runRateCierre", { closing: formatCompactAxis(pacing.cierreEstimado ?? 0) })
    : t("resultados.ingreso.runRateTexto", {
        daily: formatCompactAxis(pacing.promedioDiario ?? 0),
        closing: formatCompactAxis(pacing.cierreEstimado ?? 0),
      });

  const openAudit = (row: IngresoTablaRow) => {
    if (!row.idCuenta || !auditPeriod) return;
    setAuditTarget({
      codigoCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      anio: auditPeriod.anio,
      periodo: auditPeriod.mes,
    });
  };

  const show = (name: IngresoMonitorPart) => part == null || part === name;

  return (
    <div className="space-y-4">
      {show("calidad") || show("pacing") ? (
      <div className={cn("grid grid-cols-1 gap-4", show("calidad") && show("pacing") && "lg:grid-cols-2")}>
        {show("calidad") ? (
        <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-sans text-xl font-medium text-foreground">
                    {t("resultados.ingreso.calidadTitle")}
                  </h2>
                  <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.ingresoCalidad} label={t("resultados.ingreso.calidadTitle")} />
                </div>
                <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  {t("resultados.ingreso.calidadSubtitle")}
                </p>
              </div>
            </div>
            {calidad.badge ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                  calidad.badge === "verde"
                    ? "bg-category-margins text-favorable"
                    : "bg-category-efficiency text-[var(--cifra-warn)]",
                )}
              >
                {t("resultados.ingreso.erosion")}: {calidad.tasaErosionPct?.toFixed(1)}% ·{" "}
                {t(calidad.badge === "verde" ? "resultados.ingreso.erosionOk" : "resultados.ingreso.erosionWarn")}
              </span>
            ) : null}
          </div>

          <div className="space-y-3">
            <ImpactBar
              label={t("resultados.ingreso.brutas")}
              amount={calidad.ventasBrutas}
              widthPct={brutasBase > 0 ? 100 : 0}
              color={BAR_BRUTAS}
            />
            <ImpactBar
              label={t("resultados.ingreso.deducciones")}
              amount={calidad.deducciones}
              widthPct={brutasBase > 0 ? (calidad.deducciones / brutasBase) * 100 : 0}
              color={BAR_DEDUCCIONES}
              negative
            />
            <div className="border-t border-border/60 pt-3">
              <ImpactBar
                label={t("resultados.ingreso.netas")}
                amount={calidad.ventasNetas}
                widthPct={brutasBase > 0 ? (calidad.ventasNetas / brutasBase) * 100 : 0}
                color={BAR_NETAS}
              />
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{t("resultados.ingreso.calidadHelp")}</p>
        </section>
        ) : null}

        {show("pacing") ? (
        <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
              <Gauge className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-sans text-xl font-medium text-foreground">
                  {t("resultados.ingreso.pacingTitle")}
                </h2>
                <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.ingresoRitmo} label={t("resultados.ingreso.pacingTitle")} />
              </div>
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {t("resultados.ingreso.diasAvance", {
                  elapsed: pacing.diasTranscurridos,
                  total: pacing.diasTotales,
                })}
              </p>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-clay" style={{ width: `${pacing.avancePct}%` }} />
          </div>

          <p className="financial-nums mt-4 text-3xl font-semibold tracking-tight">
            {pacing.cierreEstimado == null ? t("resultados.ingreso.na") : formatCompactAxis(pacing.cierreEstimado)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{pacingTexto}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-3 text-sm">
            <span className="text-muted-foreground">
              {t("resultados.ingreso.promedioDiario")}:{" "}
              <span className="financial-nums font-medium text-foreground">
                {pacing.promedioDiario == null ? t("resultados.ingreso.na") : formatCompactAxis(pacing.promedioDiario)}
              </span>
            </span>
            {pacing.presupuesto == null ? (
              <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {t("resultados.ingreso.sinPresupuesto")}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t("resultados.ingreso.vsPresupuesto")}:{" "}
                <span
                  className={cn(
                    "financial-nums font-medium",
                    (pacing.varPresupuestoPct ?? 0) >= 0 ? "text-favorable" : "text-desfavorable",
                  )}
                >
                  {pacing.varPresupuestoPct == null ? "" : formatSignedPct(pacing.varPresupuestoPct)}
                  {pacing.varPresupuestoMxn == null ? "" : ` (${formatMxn(pacing.varPresupuestoMxn)})`}
                </span>
              </span>
            )}
          </div>
        </section>
        ) : null}
      </div>
      ) : null}

      {show("tabla") ? (
      <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-sans text-xl font-medium text-foreground">{t("resultados.ingreso.tablaTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("resultados.ingreso.tablaHelp")}</p>
          </div>
          <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.ingresoTabla} label={t("resultados.ingreso.tablaTitle")} />
        </div>

        {tabla.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("resultados.ingreso.tablaEmpty")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">{t("resultados.ingreso.colConcepto")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("resultados.ingreso.colMonto")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("resultados.ingreso.colPct")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("resultados.ingreso.colMom")}</th>
                  <th className="pb-2 text-right font-medium">{t("resultados.ingreso.colYoy")}</th>
                </tr>
              </thead>
              <tbody>
                {tabla.map((row) => (
                  <tr
                    key={row.idCuenta ?? "__otros_menores__"}
                    className={cn(
                      "border-t border-border/40 transition-colors",
                      row.idCuenta ? "cursor-pointer hover:bg-secondary/60" : "",
                    )}
                    onClick={() => openAudit(row)}
                    title={row.idCuenta ? t("polizas.audit.drillHint") : undefined}
                  >
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-foreground" title={row.nombreCuenta || undefined}>
                        {row.esOtrosMenores ? t("resultados.ingreso.otrosMenores") : row.nombreCuenta}
                      </p>
                      {row.idCuenta ? (
                        <p className="font-mono text-[11px] text-muted-foreground">{row.idCuenta}</p>
                      ) : null}
                    </td>
                    <td className="financial-nums py-2.5 pr-3 text-right text-foreground">{formatMxn(row.monto)}</td>
                    <td className="financial-nums py-2.5 pr-3 text-right text-muted-foreground">
                      {row.pctVentas == null ? t("resultados.ingreso.na") : `${row.pctVentas.toFixed(1)}%`}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <DeltaPill value={row.momPct} />
                    </td>
                    <td className="py-2.5 text-right">
                      <DeltaPill value={row.yoyPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  );
}
