"use client";

import { CHART, TOP5_RESTO } from "@/lib/chart-theme";

export type IncomeBreakdownBarDatum = {
  name: string;
  value: number;
  isOther?: boolean;
};

type IncomeBreakdownBarsProps = {
  data: IncomeBreakdownBarDatum[];
  valueFormatter: (value: number) => string;
  totalLabel: string;
  totalFormatter?: (value: number) => string;
};

function sharePct(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * Desglose del ingreso en barras horizontales: el nombre completo de la cuenta
 * arriba, monto y % del ingreso a la derecha, y la barra con el mismo %.
 */
export function IncomeBreakdownBars({ data, valueFormatter, totalLabel, totalFormatter }: IncomeBreakdownBarsProps) {
  const visible = data.filter((datum) => datum.value > 0);
  const total = visible.reduce((sum, datum) => sum + datum.value, 0);
  const formatTotal = totalFormatter ?? valueFormatter;

  return (
    <div className="flex flex-col gap-4">
      <ul className="space-y-4">
        {visible.map((datum) => {
          const pct = sharePct(datum.value, total);
          return (
            <li key={datum.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="min-w-0 flex-1 text-sm text-foreground">{datum.name}</span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="financial-nums text-sm text-foreground">{valueFormatter(datum.value)}</span>
                  <span className="financial-nums w-14 text-right text-sm font-bold text-foreground">
                    {pct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, pct))}%`,
                    minWidth: pct > 0 ? 4 : 0,
                    backgroundColor: datum.isOther ? TOP5_RESTO : CHART.clay,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {total > 0 ? (
        <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-3">
          <span className="text-sm font-medium text-muted-foreground">{totalLabel}</span>
          <span className="financial-nums text-sm font-bold text-foreground">{formatTotal(total)}</span>
        </div>
      ) : null}
    </div>
  );
}
