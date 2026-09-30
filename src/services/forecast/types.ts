export type RubroKey = "ingreso" | "costo" | "gasto" | "ebitda";

export type ForecastMethod = "seasonal_naive" | "holt_winters" | "unavailable";

export type HorizonMonth = {
  periodo: string;
  p20: number;
  p50: number;
  p80: number;
};

export type RubroForecast = {
  key: RubroKey;
  method: ForecastMethod;
  mapeHoldout: number | null;
  months: HorizonMonth[];
  assumptions: string[];
};

export type MonthlyPnlPoint = {
  periodo: string;
  ingreso: number;
  costo: number;
  gasto: number;
  ebitda: number;
  officialIngreso: number;
  officialCosto: number;
  officialGasto: number;
};

export type SeriesBuildResult = {
  points: MonthlyPnlPoint[];
  hasOfficialBudget: boolean;
};

export type ScenarioKind = "base" | "upside" | "downside";

/** Fracciones (0.08 = +8%). Overlay; no reentrena. */
export type ScenarioSliders = {
  gIngreso: number;
  gCosto: number;
  gGasto: number;
};

export const DEFAULT_SCENARIO_SLIDERS: ScenarioSliders = {
  gIngreso: 0,
  gCosto: 0,
  gGasto: 0,
};

export type ScenarioMonth = {
  periodo: string;
  ingreso: number;
  costo: number;
  gasto: number;
  ebitda: number;
};

export type OfficialVsForecast = {
  periodo: string;
  actual: { ingreso: number; costo: number; gasto: number; ebitda: number };
  official: { ingreso: number | null; costo: number | null; gasto: number | null } | null;
  p50: { ingreso: number; costo: number; gasto: number; ebitda: number } | null;
};

export type BudgetProjectionResult = {
  hasOfficialBudget: boolean;
  methodNote: string;
  rubros: Record<RubroKey, RubroForecast>;
  scenarios: Record<ScenarioKind, ScenarioMonth[]>;
  officialVsP50: OfficialVsForecast[];
  orientativa: boolean;
};

export type BalanzaPnlLike = {
  anio: number;
  periodo: number;
  categoriaMaestra: string;
  debe: unknown;
  haber: unknown;
  montoPresupuestado: unknown;
};
