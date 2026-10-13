"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import {
  buildFlujoAlertas,
  flujoMesActivo,
  mesesDeRespiro,
  type FlujoAlerta,
  type FlujoMensual,
} from "@/services/flujoTransformer";
import { useLocale } from "@/context/LocaleContext";
import { formatMxn } from "@/services/money";
import { useMemo } from "react";

function alertText(alert: FlujoAlerta, t: (key: string, values?: Record<string, string | number>) => string): string {
  switch (alert.kind) {
    case "lowRunway":
      return t("flujo.alertsMessages.lowRunway", { caja: formatMxn(alert.caja), meses: alert.meses.toFixed(1) });
    case "negativeTwoMonths":
      return t("flujo.alertsMessages.negativeTwoMonths", { monto: formatMxn(alert.salidaNeta) });
    case "highCapex":
      return t("flujo.alertsMessages.highCapex", { capex: formatMxn(alert.capex), entradas: formatMxn(alert.entradas) });
  }
}

/**
 * "Tu caja": meses de respiro del mes y las alertas de caja con su monto.
 * Sale del reporte Flujo de Efectivo (tesorería); sin tesorería no se muestra.
 */
export function FlujoAlertas({ periodo, rows }: { periodo: string; rows: FlujoMensual[] }) {
  const { t } = useLocale();
  const current = useMemo(() => flujoMesActivo(rows, periodo), [rows, periodo]);
  const alerts = useMemo(() => buildFlujoAlertas(rows, periodo), [rows, periodo]);

  if (!current) {
    return null;
  }
  const meses = mesesDeRespiro(current);

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:w-80 lg:shrink-0">
          <p className="font-sans text-lg font-bold text-foreground">{t("flujo.respiro.title")}</p>
          <p className="text-xs text-muted-foreground">{t("flujo.respiro.help")}</p>
          <p className="financial-nums mt-4 text-3xl font-semibold tracking-tight text-foreground">
            {meses == null ? t("common.na") : t("common.months", { value: meses.toFixed(1) })}
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <CifraMark state={meses == null ? "missing" : "estimated"} size={14} className="mt-px shrink-0" />
            {meses == null
              ? t("flujo.respiro.noOutflows")
              : t("flujo.respiro.source", { caja: formatMxn(current.saldoFinal), salidas: formatMxn(current.salidasOperativas) })}
          </p>
        </div>
        {alerts.length > 0 ? (
          <ul className="min-w-0 flex-1 space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.kind}
                className="flex items-start gap-2 rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              >
                <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-desfavorable" aria-hidden />
                {alertText(alert, t)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
