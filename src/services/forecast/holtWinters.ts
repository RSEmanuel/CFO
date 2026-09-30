import { round2 } from "../money";

const ALPHA = 0.3;
const BETA = 0.05;
const GAMMA = 0.2;
const SEASON = 12;

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

export type HoltWintersFit = {
  fitted: number[];
  forecast: (horizon: number) => number[];
};

/**
 * HW aditivo, s=12. α/β/γ fijos: suficiente tendencia suave sin sobreajustar en n~24.
 */
export function fitHoltWintersAdditive(y: number[]): HoltWintersFit | null {
  const n = y.length;
  if (n < 18) {
    return null;
  }
  const seasons = new Array<number>(SEASON).fill(0);
  const overall = mean(y);
  for (let month = 0; month < SEASON; month += 1) {
    const vals = y.filter((_, index) => index % SEASON === month);
    seasons[month] = (vals.length ? mean(vals) : overall) - overall;
  }
  let level = mean(y.slice(0, Math.min(SEASON, n)));
  let trend =
    n >= 24 ? (mean(y.slice(SEASON, SEASON * 2)) - mean(y.slice(0, SEASON))) / SEASON : 0;

  const fitted: number[] = [];
  for (let t = 0; t < n; t += 1) {
    const season = seasons[t % SEASON] ?? 0;
    fitted.push(round2(level + trend + season));
    const yVal = y[t] ?? 0;
    const newLevel = ALPHA * (yVal - season) + (1 - ALPHA) * (level + trend);
    const newTrend = BETA * (newLevel - level) + (1 - BETA) * trend;
    seasons[t % SEASON] = GAMMA * (yVal - newLevel) + (1 - GAMMA) * season;
    level = newLevel;
    trend = newTrend;
  }

  const levelFinal = level;
  const trendFinal = trend;
  const seasonsFinal = [...seasons];

  return {
    fitted,
    forecast(horizon: number) {
      const out: number[] = [];
      for (let h = 1; h <= horizon; h += 1) {
        const season = seasonsFinal[(n - 1 + h) % SEASON] ?? 0;
        out.push(round2(levelFinal + h * trendFinal + season));
      }
      return out;
    },
  };
}

export function clipNonNegative(values: number[]): { values: number[]; clipped: boolean } {
  let clipped = false;
  const next = values.map((item) => {
    if (item < 0) {
      clipped = true;
      return 0;
    }
    return round2(item);
  });
  return { values: next, clipped };
}
