"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { TranslateFn } from "@/i18n/translate";
import { apiRequest } from "@/lib/api";
import { invalidateApiCache } from "@/lib/api-cache";
import type { BudgetAssumptionsSource, BudgetDrivers } from "@/services/forecast/drivers";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function pct(value: number, locale: Locale): string {
  return formatNumber(Math.abs(value), locale, { maximumFractionDigits: 1 });
}

/** Los supuestos efectivos en una frase: qué asumimos de ventas, costos y nómina. */
export function budgetAssumptionsSentence(
  drivers: BudgetDrivers,
  source: BudgetAssumptionsSource,
  t: TranslateFn,
  locale: Locale,
): string {
  const growth = drivers.salesGrowthPct;
  const salesBase =
    growth > 0
      ? t("resultados.budgetAssumptions.salesUp", { value: pct(growth, locale) })
      : growth < 0
        ? t("resultados.budgetAssumptions.salesDown", { value: pct(growth, locale) })
        : t("resultados.budgetAssumptions.salesFlat");
  const sales = source === "auto" && growth !== 0 ? `${salesBase} ${t("resultados.budgetAssumptions.trendNote")}` : salesBase;
  const inflation = drivers.inflationPct;
  const costs =
    inflation > 0
      ? t("resultados.budgetAssumptions.costsUp", { value: pct(inflation, locale) })
      : inflation < 0
        ? t("resultados.budgetAssumptions.costsDown", { value: pct(inflation, locale) })
        : t("resultados.budgetAssumptions.costsFlat");
  const hiring =
    drivers.headcount > 0 && drivers.headcountCostMonthly > 0
      ? t("resultados.budgetAssumptions.hiring", { count: drivers.headcount })
      : t("resultados.budgetAssumptions.noHiring");
  return t("resultados.budgetAssumptions.sentence", { sales, costs, hiring });
}

/**
 * Caja "Cifra calculó esta proyección" / "Supuestos que tú definiste" bajo el título de Presupuesto.
 * En modo manual permite volver a la proyección automática (borra los supuestos guardados de ese año).
 */
export function BudgetAssumptionsSummary({
  anio,
  drivers,
  source,
  updatedAt,
  onReset,
}: {
  anio: number;
  drivers: BudgetDrivers;
  source: BudgetAssumptionsSource;
  updatedAt: string | null;
  onReset: () => void;
}) {
  const { t, locale } = useLocale();
  const { tenantId } = useSession();
  const [resetting, setResetting] = useState(false);
  const manual = source === "manual";

  async function resetToAuto(): Promise<void> {
    if (!tenantId || resetting || !window.confirm(t("resultados.budgetAssumptions.resetConfirm"))) {
      return;
    }
    setResetting(true);
    try {
      const params = new URLSearchParams({ tenantId, anio: String(anio) });
      await apiRequest(`/api/metrics/budget-assumptions?${params.toString()}`, { method: "DELETE" });
      invalidateApiCache((key) => key.includes("/api/metrics/budget-projection"));
      toast.success(t("resultados.budgetAssumptions.resetDone"));
      onReset();
    } catch {
      toast.error(t("resultados.budgetAssumptions.resetError"));
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="rounded-card border border-border bg-secondary/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <p className="text-sm font-medium text-foreground">
            {manual ? t("resultados.budgetAssumptions.manualTitle") : t("resultados.budgetAssumptions.autoTitle")}
          </p>
          <p className="mt-1 text-sm text-foreground">{budgetAssumptionsSentence(drivers, source, t, locale)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {manual && updatedAt
              ? t("resultados.budgetAssumptions.manualSaved", {
                  date: formatDate(updatedAt, locale, { day: "numeric", month: "long", year: "numeric" }),
                })
              : t("resultados.budgetAssumptions.estimateNote")}
          </p>
        </div>
        {manual ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            disabled={resetting}
            onClick={() => void resetToAuto()}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {resetting ? t("resultados.budgetAssumptions.resetting") : t("resultados.budgetAssumptions.reset")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
