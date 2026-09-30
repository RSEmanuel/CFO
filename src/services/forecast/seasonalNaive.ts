import { round2 } from "../money";

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function calendarMonth(index: number): number {
  return index % 12;
}

/** ŷ_{t+h} = y_{t+h−12} si hay YoY; si no, media del mes o MA3. */
export function seasonalNaiveForecast(y: number[], horizon: number): number[] {
  const n = y.length;
  const out: number[] = [];
  for (let h = 1; h <= horizon; h += 1) {
    const targetIndex = n - 1 + h;
    const yoyIndex = targetIndex - 12;
    if (yoyIndex >= 0 && yoyIndex < n) {
      out.push(round2(y[yoyIndex] ?? 0));
      continue;
    }
    const month = calendarMonth(targetIndex);
    const sameMonth = y.filter((_, index) => calendarMonth(index) === month);
    if (sameMonth.length >= 2) {
      out.push(round2(mean(sameMonth)));
      continue;
    }
    const window = y.slice(Math.max(0, n - 3));
    out.push(round2(mean(window)));
  }
  return out;
}

export function seasonalNaiveFitted(y: number[]): number[] {
  const n = y.length;
  return y.map((_, t) => {
    if (t >= 12) {
      return round2(y[t - 12] ?? 0);
    }
    const month = calendarMonth(t);
    const prior = y.filter((__, index) => index < t && calendarMonth(index) === month);
    if (prior.length >= 2) {
      return round2(mean(prior));
    }
    const window = y.slice(Math.max(0, t - 3), t);
    return round2(window.length ? mean(window) : (y[t] ?? 0));
  });
}
