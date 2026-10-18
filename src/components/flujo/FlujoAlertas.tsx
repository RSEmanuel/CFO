"use client";

import { useLocale } from "@/context/LocaleContext";
import { useCajaRespiro } from "@/hooks/use-caja-respiro";
import type { FlujoMensual } from "@/services/flujoTransformer";
import { formatMxn } from "@/services/money";

/**
 * "Tu caja": saldo de caja y bancos y meses de respiro. Salen de la definición
 * única (services/caja.ts, balanza).
 */
// `rows` ya no se usa aquí (las alertas se quitaron de esta sección); se conserva para no tocar a quien la monta.
export function FlujoAlertas({ periodo }: { periodo: string; rows: FlujoMensual[] }) {
  const { t } = useLocale();
  const { data: respiro } = useCajaRespiro(periodo);

  if (!respiro?.hasBalanza) {
    return null;
  }
  const sinCaja = respiro.cuentas === 0;
  const meses = respiro.mesesDeRespiro;
  const gasto = respiro.gastoMensual == null ? "" : formatMxn(respiro.gastoMensual);

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="min-w-0">
        <p className="font-sans text-lg font-bold text-foreground">{t("flujo.respiro.title")}</p>
        <p className="text-xs text-muted-foreground">{t("flujo.respiro.help")}</p>

        <p className="cifra-num mt-4 text-3xl font-semibold tracking-tight text-foreground">
          {sinCaja ? t("common.na") : formatMxn(respiro.caja)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {sinCaja ? t("flujo.respiro.noCash") : t("flujo.respiro.cajaSource")}
        </p>

        {sinCaja ? null : (
          <>
            <p className="mt-4 text-xs font-medium text-muted-foreground">{t("flujo.respiro.mesesLabel")}</p>
            <p className="cifra-num text-2xl font-semibold tracking-tight text-foreground">
              {meses == null ? t("common.na") : t("common.months", { value: meses.toFixed(1) })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {meses == null
                ? t("flujo.respiro.noOutflows")
                : respiro.mesesRitmo > 1
                  ? t("flujo.respiro.source", { gasto, meses: respiro.mesesRitmo })
                  : t("flujo.respiro.sourceOneMonth", { gasto })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
