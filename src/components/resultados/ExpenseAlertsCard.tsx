"use client";

import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { formatMxn } from "@/services/money";
import type { GastoOpexAlerta } from "@/services/gastoOpex";
import { Check, Search } from "lucide-react";
import { useState } from "react";

type ExpenseAlertsCardProps = {
  periodo: string;
  alertas: GastoOpexAlerta[];
};

function formatSignedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function deviationTone(pct: number | null): "red" | "amber" {
  if (pct == null || pct >= 50) {
    return "red";
  }
  return "amber";
}

export function ExpenseAlertsCard({ periodo, alertas }: ExpenseAlertsCardProps) {
  const { t } = useLocale();
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);
  const auditPeriod = parseIngresoPeriodo(periodo);

  const openAudit = (alerta: GastoOpexAlerta) => {
    if (!auditPeriod) return;
    setAuditTarget({
      codigoCuenta: alerta.idCuenta,
      nombreCuenta: alerta.nombreCuenta,
      anio: auditPeriod.anio,
      periodo: auditPeriod.mes,
    });
  };

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="font-serif text-xl font-medium text-foreground">{t("resultados.opex.alertsTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("resultados.opex.alertsSubtitle")}</p>

      {alertas.length === 0 ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-category-margins px-3 py-1.5 text-sm font-medium text-favorable">
          <Check className="h-4 w-4" aria-hidden />
          {t("resultados.opex.alertsEmpty")}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">{t("resultados.opex.alertsAccount")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.opex.alertsMonthSpend")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.opex.alertsAvg3m")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.opex.alertsDeviation")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("resultados.opex.alertsExcess")}</th>
                <th className="pb-2 text-right font-medium">{t("resultados.opex.alertsAction")}</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((alerta) => {
                const tone = deviationTone(alerta.desviacionPct);
                return (
                  <tr
                    key={alerta.idCuenta}
                    className="cursor-pointer border-t border-border/40 transition-colors hover:bg-secondary/60"
                    onClick={() => openAudit(alerta)}
                    title={t("polizas.audit.drillHint")}
                  >
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-foreground" title={alerta.nombreCuenta}>
                        {alerta.nombreCuenta}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">{alerta.idCuenta}</p>
                    </td>
                    <td className="financial-nums py-2.5 pr-3 text-right text-foreground">
                      {formatMxn(alerta.gastoMes)}
                    </td>
                    <td className="financial-nums py-2.5 pr-3 text-right text-muted-foreground">
                      {formatMxn(alerta.promedio3M)}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          tone === "red"
                            ? "bg-category-solvency text-desfavorable"
                            : "bg-category-efficiency text-[#B45309]",
                        )}
                      >
                        {alerta.desviacionPct == null
                          ? t("resultados.opex.alertsNa")
                          : formatSignedPct(alerta.desviacionPct)}
                      </span>
                    </td>
                    <td className="financial-nums py-2.5 pr-3 text-right font-medium text-desfavorable">
                      {t("resultados.opex.alertsExcessValue", { amount: formatMxn(alerta.excedente) })}
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          openAudit(alerta);
                        }}
                      >
                        <Search className="h-3.5 w-3.5" aria-hidden />
                        {t("resultados.opex.alertsAudit")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </section>
  );
}
