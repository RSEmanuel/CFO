export const MONEY_TOLERANCE = 0.01;

export type MoneyValue = number | string | { toString(): string };

export function toNumber(value: MoneyValue): number {
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : NaN;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function nearlyEqual(a: number, b: number, tolerance = MONEY_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** Formato MXN del producto: $#,##0.00 */
export function formatMxn(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

export type DisplayUnits = "k" | "m" | "b";

/** Tick de eje Y: divide MXN una sola vez y evita `$5,000.00K` recortado. */
export function formatAxisTick(value: number, units: DisplayUnits): string {
  if (units === "k") {
    return `$${(value / 1_000).toLocaleString("en-US", { maximumFractionDigits: 0 })}K`;
  }
  if (units === "m") {
    return `$${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
  }
  return `$${(value / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}B`;
}

/** Etiqueta compacta de gráfico: `$2.4M` o `$955K` según magnitud. */
export function formatCompactAxis(value: number): string {
  return Math.abs(value) >= 1_000_000 ? formatAxisTick(value, "m") : formatAxisTick(value, "k");
}
