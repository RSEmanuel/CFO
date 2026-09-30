"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/context/LocaleContext";
import { monthLabelKey } from "@/i18n/format";

type PosicionFinancieraFilterBarProps = {
  year: number | null;
  period: number | null;
  availableYears: number[];
  availablePeriods: number[];
  showPeriod: boolean;
  onYearChange: (year: number) => void;
  onPeriodChange: (period: number) => void;
};

export function PosicionFinancieraFilterBar({
  year,
  period,
  availableYears,
  availablePeriods,
  showPeriod,
  onYearChange,
  onPeriodChange,
}: PosicionFinancieraFilterBarProps) {
  const { t } = useLocale();
  const years = availableYears.length > 0 ? availableYears : year != null ? [year] : [];
  const periods = availablePeriods.length > 0 ? availablePeriods : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div className="flex flex-wrap gap-4">
      <label className="min-w-[140px]">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("filters.year")}
        </span>
        <Select
          value={year != null ? String(year) : undefined}
          onValueChange={(value) => onYearChange(Number(value))}
        >
          <SelectTrigger className="h-10 w-[160px] bg-card">
            <SelectValue placeholder={t("filters.year")} />
          </SelectTrigger>
          <SelectContent>
            {years.map((item) => (
              <SelectItem key={item} value={String(item)}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {showPeriod ? (
        <label className="min-w-[140px]">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("filters.period")}
          </span>
          <Select
            value={period != null ? String(period) : undefined}
            onValueChange={(value) => onPeriodChange(Number(value))}
          >
            <SelectTrigger className="h-10 w-[200px] bg-card">
              <SelectValue placeholder={t("filters.period")} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {t(monthLabelKey(item - 1))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}
    </div>
  );
}
