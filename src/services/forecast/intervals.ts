import { round2 } from "../money";
import type { HorizonMonth } from "./types";
import { shiftPeriodo } from "./series";

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  const w = index - lo;
  return a + (b - a) * w;
}

export function empiricalQuantiles(residuals: number[]): { q20: number; q50: number; q80: number } {
  const sorted = [...residuals].sort((a, b) => a - b);
  return {
    q20: quantile(sorted, 0.2),
    q50: quantile(sorted, 0.5),
    q80: quantile(sorted, 0.8),
  };
}

/** Residuos in-sample; la banda crece con sqrt(h) (error acumulado). */
export function intervalMonths(
  anchor: string,
  pointForecast: number[],
  residuals: number[],
): HorizonMonth[] {
  const { q20, q80 } = empiricalQuantiles(residuals);
  return pointForecast.map((p50raw, index) => {
    const h = index + 1;
    const width = Math.sqrt(h);
    const p50 = round2(p50raw);
    const p20 = round2(p50 + q20 * width);
    const p80 = round2(p50 + q80 * width);
    const ordered = [p20, p50, p80].sort((a, b) => a - b);
    return {
      periodo: shiftPeriodo(anchor, h),
      p20: ordered[0] ?? p50,
      p50: ordered[1] ?? p50,
      p80: ordered[2] ?? p50,
    };
  });
}
