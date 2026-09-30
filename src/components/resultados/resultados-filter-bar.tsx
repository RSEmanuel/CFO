"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/context/LocaleContext";
import { monthLabelKey } from "@/i18n/format";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type ResultadosFilters = {
  temporalidad: string;
  periodo: string;
  comparable: string;
  currency: string;
  units: "k" | "m" | "b";
  analysis: "amount" | "pct";
};

export const INITIAL_RESULTADOS_FILTERS: ResultadosFilters = {
  temporalidad: "month",
  periodo: "2025-12",
  comparable: "yoy",
  currency: "mxn",
  units: "k",
  analysis: "amount",
};

type ResultadosFilterBarProps = {
  filters: ResultadosFilters;
  onChange: (filters: ResultadosFilters) => void;
  availablePeriods?: string[];
  trailing?: ReactNode;
};

type FilterSelectProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
};

function FilterSelect({ label, value, onValueChange, options }: FilterSelectProps) {
  const { t } = useLocale();
  return (
    <label className="min-w-[140px] flex-1">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <Select value={value || undefined} onValueChange={onValueChange}>
        <SelectTrigger className="h-10 bg-card">
          <SelectValue placeholder={t("filters.select")} />
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

function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-[140px]">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <div className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 min-w-9 rounded-control px-3 text-sm font-medium transition-colors",
              value === option.value
                ? "bg-secondary text-clay shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ResultadosFilterBar({
  filters,
  onChange,
  availablePeriods = [],
  trailing,
}: ResultadosFilterBarProps) {
  const { t } = useLocale();
  const periods = availablePeriods.map((value) => {
    const [year, month] = value.split("-").map(Number);
    return { value, label: `${t(monthLabelKey((month || 1) - 1)).slice(0, 3)}-${year}` };
  });
  return (
    <section className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <FilterSelect
        label={t("filters.temporality")}
        value={filters.temporalidad}
        onValueChange={(value) => onChange({ ...filters, temporalidad: value })}
        options={[
          { value: "month", label: t("filters.month") },
          { value: "quarter", label: t("filters.quarter") },
          { value: "year", label: t("filters.year") },
        ]}
      />
      <FilterSelect label={t("filters.period")} value={filters.periodo} onValueChange={(value) => onChange({ ...filters, periodo: value })} options={periods} />
      <FilterSelect
        label={t("filters.comparable")}
        value={filters.comparable}
        onValueChange={(value) => onChange({ ...filters, comparable: value })}
        options={[
          { value: "yoy", label: t("filters.yoyFull") },
          { value: "mom", label: t("filters.momFull") },
        ]}
      />
      <FilterSelect
        label={t("filters.currency")}
        value={filters.currency}
        onValueChange={(value) => onChange({ ...filters, currency: value })}
        options={[
          { value: "mxn", label: "MXN" },
          { value: "usd", label: "USD" },
        ]}
      />
      <ToggleGroup
        label={t("filters.units")}
        value={filters.units}
        onChange={(units) => onChange({ ...filters, units })}
        options={[
          { value: "k", label: "K" },
          { value: "m", label: "M" },
          { value: "b", label: "B" },
        ]}
      />
      <ToggleGroup
        label={t("filters.analysis")}
        value={filters.analysis}
        onChange={(analysis) => onChange({ ...filters, analysis })}
        options={[
          { value: "amount", label: "$" },
          { value: "pct", label: "%" },
        ]}
      />
      {trailing ? <div className="ml-auto pb-1">{trailing}</div> : null}
    </section>
  );
}
