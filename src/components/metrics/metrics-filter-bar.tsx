"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { monthLabelKey } from "@/i18n/format";
import type { CatalogComparable } from "@/hooks/use-metrics-catalog";

export type MetricsFilters = {
  temporalidad: "month" | "quarter" | "year";
  comparable: CatalogComparable;
  currency: "mxn" | "usd";
  units: "exact" | "k" | "m";
  analysis: "amount" | "pct";
};

type MetricsFilterBarProps = {
  filters: MetricsFilters;
  onChange: (filters: MetricsFilters) => void;
};

type FilterSelectProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
};

function FilterSelect({ label, value, onValueChange, options }: FilterSelectProps) {
  return (
    <label className="min-w-[150px] flex-1">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-10 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function MetricsFilterBar({ filters, onChange }: MetricsFilterBarProps) {
  const { t } = useLocale();
  const { anio, periodo, setAnio, setPeriodo, setPeriodView } = useSession();
  const selectedPeriod = `${anio}-${String(periodo).padStart(2, "0")}`;

  function setPeriod(value: string) {
    const [year, month] = value.split("-").map(Number);
    if (Number.isInteger(year) && Number.isInteger(month)) {
      setAnio(year);
      setPeriodo(month);
      setPeriodView("mensual");
    }
  }

  const periods = [2024, 2025, 2026].flatMap((year) =>
    Array.from({ length: 12 }, (_, index) => ({
      value: `${year}-${String(index + 1).padStart(2, "0")}`,
      label: `${t(monthLabelKey(index)).slice(0, 3)}-${year}`,
    })),
  );

  return (
    <section className="metrics-filter-bar">
      <FilterSelect
        label={t("filters.temporality")}
        value={filters.temporalidad}
        onValueChange={(value) =>
          onChange({ ...filters, temporalidad: value as MetricsFilters["temporalidad"] })
        }
        options={[
          { value: "month", label: `${t("filters.month")} (M)` },
          { value: "quarter", label: `${t("filters.quarter")} (Q)` },
          { value: "year", label: `${t("filters.year")} (YoY)` },
        ]}
      />
      <FilterSelect label={t("filters.period")} value={selectedPeriod} onValueChange={setPeriod} options={periods} />
      <FilterSelect
        label={t("filters.comparable")}
        value={filters.comparable}
        onValueChange={(value) => onChange({ ...filters, comparable: value as CatalogComparable })}
        options={[
          { value: "yoy", label: t("filters.yoyFull") },
          { value: "mom", label: t("filters.momFull") },
        ]}
      />
      <FilterSelect
        label={t("filters.currency")}
        value={filters.currency}
        onValueChange={(value) => onChange({ ...filters, currency: value as MetricsFilters["currency"] })}
        options={[
          { value: "mxn", label: t("metrics.currencyMxn") },
          { value: "usd", label: t("metrics.currencyUsd") },
        ]}
      />
      <FilterSelect
        label={t("filters.units")}
        value={filters.units}
        onValueChange={(value) => onChange({ ...filters, units: value as MetricsFilters["units"] })}
        options={[
          { value: "exact", label: t("metrics.exact") },
          { value: "k", label: t("metrics.thousands") },
          { value: "m", label: t("metrics.millions") },
        ]}
      />
      <FilterSelect
        label={t("filters.analysis")}
        value={filters.analysis}
        onValueChange={(value) => onChange({ ...filters, analysis: value as MetricsFilters["analysis"] })}
        options={[
          { value: "amount", label: t("metrics.amount") },
          { value: "pct", label: t("metrics.percentage") },
        ]}
      />
    </section>
  );
}
