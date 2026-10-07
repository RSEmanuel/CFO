"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import {
  DELTA_LIMITS,
  type SimulatorDeltas,
  type SimulatorDriverKey,
} from "@/services/simulatorEngine";
import { FileDown, FileSpreadsheet, RotateCcw } from "lucide-react";

type DriverDef = {
  key: SimulatorDriverKey;
  step: number;
  unit: "pct" | "days" | "pp";
};

const DRIVER_GROUPS: Array<{ titleKey: string; keys: SimulatorDriverKey[] }> = [
  {
    titleKey: "simulator.drivers.groups.commercial",
    keys: ["crecimientoVentasPct", "sensibilidadPreciosPct"],
  },
  {
    titleKey: "simulator.drivers.groups.efficiency",
    keys: ["variacionOpexPct"],
  },
  {
    titleKey: "simulator.drivers.groups.cash",
    keys: ["dsoDias", "dpoDias", "tasaInteresDeltaPp"],
  },
];

function driverDef(key: SimulatorDriverKey): DriverDef {
  if (key === "sensibilidadPreciosPct") return { key, step: 0.5, unit: "pct" };
  if (key === "tasaInteresDeltaPp") return { key, step: 0.25, unit: "pp" };
  if (key === "dsoDias" || key === "dpoDias") return { key, step: 1, unit: "days" };
  return { key, step: 1, unit: "pct" };
}

function formatDriverValue(value: number, unit: DriverDef["unit"], daysLabel: string): string {
  const sign = value > 0 ? "+" : "";
  if (unit === "days") {
    return `${sign}${value.toFixed(0)} ${daysLabel}`;
  }
  if (unit === "pp") {
    return `${sign}${value.toFixed(2)} pp`;
  }
  return `${sign}${value.toFixed(1)}%`;
}

type SimulatorDriversPanelProps = {
  deltas: SimulatorDeltas;
  onChange: (next: SimulatorDeltas) => void;
  onReset: () => void;
  onExportXlsx: () => void;
  onExportPdf: () => void;
};

export function SimulatorDriversPanel({
  deltas,
  onChange,
  onReset,
  onExportXlsx,
  onExportPdf,
}: SimulatorDriversPanelProps) {
  const { t } = useLocale();
  const daysLabel = t("simulator.units.days");

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-lg font-medium text-foreground">{t("simulator.drivers.title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("simulator.drivers.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw size={14} />
            {t("simulator.actions.reset")}
          </Button>
          <Button variant="outline" size="sm" onClick={onExportXlsx}>
            <FileSpreadsheet size={14} />
            {t("simulator.actions.exportXlsx")}
          </Button>
          <Button variant="outline" size="sm" onClick={onExportPdf}>
            <FileDown size={14} />
            {t("simulator.actions.exportPdf")}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {DRIVER_GROUPS.map((group) => (
          <div key={group.titleKey} className="rounded-card border border-border bg-secondary/40 p-4">
            <h3 className="mb-4 font-sans text-base font-bold tracking-tight text-foreground">{t(group.titleKey)}</h3>
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
              {group.keys.map((key) => {
                const driver = driverDef(key);
                const limits = DELTA_LIMITS[driver.key];
                const value = deltas[driver.key];
                const active = value !== 0;
                const labelKey = `simulator.drivers.${driver.key}`;
                const helpKey = `simulator.drivers.${driver.key}Help`;
                return (
                  <div key={driver.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <label
                        htmlFor={`sim-${driver.key}`}
                        className="text-sm font-medium text-foreground"
                      >
                        {t(labelKey)}
                      </label>
                      <span
                        className={cn(
                          "financial-nums rounded-full px-2 py-0.5 text-[11px] font-medium",
                          active ? "bg-secondary text-clay" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {formatDriverValue(value, driver.unit, daysLabel)}
                      </span>
                    </div>
                    <input
                      id={`sim-${driver.key}`}
                      type="range"
                      min={limits.min}
                      max={limits.max}
                      step={driver.step}
                      value={value}
                      onChange={(event) =>
                        onChange({ ...deltas, [driver.key]: Number(event.target.value) })
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[hsl(var(--brand-clay))]"
                      aria-label={t(labelKey)}
                    />
                    <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                      <span>{formatDriverValue(limits.min, driver.unit, daysLabel)}</span>
                      <span>{formatDriverValue(limits.max, driver.unit, daysLabel)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{t(helpKey)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
