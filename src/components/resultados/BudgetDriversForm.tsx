"use client";

import { Button } from "@/components/ui/button";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { ApiError, apiRequest } from "@/lib/api";
import { invalidateApiCache } from "@/lib/api-cache";
import type { BudgetAssumptionPayload } from "@/services/budgetAssumptionService";
import { DEFAULT_BUDGET_DRIVERS, type BudgetDrivers } from "@/services/forecast/drivers";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const DRIVER_FIELDS: Array<{
  key: keyof BudgetDrivers;
  labelKey: string;
  step: string;
}> = [
  { key: "salesGrowthPct", labelKey: "resultados.drivers.salesGrowth", step: "0.1" },
  { key: "inflationPct", labelKey: "resultados.drivers.inflation", step: "0.1" },
  { key: "headcount", labelKey: "resultados.drivers.headcount", step: "1" },
  { key: "headcountCostMonthly", labelKey: "resultados.drivers.headcountCost", step: "100" },
  { key: "debtInterestMonthly", labelKey: "resultados.drivers.debtInterest", step: "100" },
  { key: "depreciationMonthly", labelKey: "resultados.drivers.depreciation", step: "100" },
];

export function BudgetDriversForm({
  anio,
  onSaved,
}: {
  anio: number;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const { tenantId } = useSession();
  const [drivers, setDrivers] = useState<BudgetDrivers>(DEFAULT_BUDGET_DRIVERS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId || !anio) {
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ tenantId, anio: String(anio) });
    apiRequest<BudgetAssumptionPayload>(`/api/metrics/budget-assumptions?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setDrivers(payload.drivers);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDrivers(DEFAULT_BUDGET_DRIVERS);
        }
      });
    return () => controller.abort();
  }, [tenantId, anio]);

  const save = async () => {
    if (!tenantId || saving) {
      return;
    }
    setSaving(true);
    try {
      const params = new URLSearchParams({ tenantId, anio: String(anio) });
      await apiRequest<BudgetAssumptionPayload>(
        `/api/metrics/budget-assumptions?${params.toString()}`,
        { method: "PUT", body: JSON.stringify(drivers) },
      );
      toast.success(t("resultados.drivers.saved"));
      invalidateApiCache((key) => key.includes("/api/metrics/budget-projection"));
      onSaved();
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : null;
      toast.error(message ?? t("resultados.drivers.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-card border border-border bg-secondary/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-serif text-base font-medium text-foreground">
            {t("resultados.drivers.title")}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("resultados.drivers.help")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={saving}
          onClick={() => void save()}
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? t("resultados.drivers.saving") : t("resultados.drivers.save")}
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DRIVER_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t(field.labelKey)}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step={field.step}
              value={drivers[field.key]}
              onChange={(event) =>
                setDrivers((current) => ({
                  ...current,
                  [field.key]: Number(event.target.value),
                }))
              }
              className="h-10 w-full rounded-control border border-input bg-card px-3 text-sm financial-nums focus:border-clay focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
