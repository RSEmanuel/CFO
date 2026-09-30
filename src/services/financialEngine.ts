import { safeRatio } from "@/services/metricsLedger";
import type { PeriodSnapshot } from "@/services/financialSnapshot";
import { round2 } from "@/services/money";

export type MetricCategory = "margenes" | "retorno" | "eficiencia" | "liquidez" | "solvencia" | "gestion";
export type MetricUnit = "pct" | "x" | "days" | "score";

/** Motivo de un valor N/D: hoy solo capital contable ≤ 0 (déficit patrimonial). */
export type CatalogNullReason = "negativeCapital";

export type CatalogMetric = {
  id: number;
  key: string;
  category: MetricCategory;
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
  unit: MetricUnit;
  formatted: string;
  nullReason: CatalogNullReason | null;
};

function formatMetric(value: number | null, unit: MetricUnit): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }
  if (unit === "pct") {
    return `${value.toFixed(1)}%`;
  }
  if (unit === "days") {
    return value.toFixed(1);
  }
  if (unit === "score") {
    return value.toFixed(0);
  }
  return `${value.toFixed(2)}x`;
}

function categoryForId(id: number): MetricCategory {
  if (id <= 8) return "margenes";
  if (id <= 15) return "retorno";
  if (id <= 24) return "eficiencia";
  if (id <= 33) return "liquidez";
  if (id <= 41) return "solvencia";
  return "gestion";
}

function metric(
  id: number,
  key: string,
  value: number | null,
  unit: MetricUnit,
  nullReason: CatalogNullReason | null = null,
): CatalogMetric {
  const clean = value == null || !Number.isFinite(value) ? null : round2(value);
  return {
    id,
    key,
    category: categoryForId(id),
    value: clean,
    previous: null,
    deltaPct: null,
    unit,
    formatted: formatMetric(clean, unit),
    nullReason: clean == null ? nullReason : null,
  };
}

function pctOf(numerator: number, denominator: number): number | null {
  // Sin redondeo intermedio: safeRatio recorta el ratio a 2 decimales y eso
  // degradaba todo porcentaje del catálogo (0.05458 → 0.05 → 5.0% en vez de
  // 5.46%). Se redondea una sola vez, ya expresado como porcentaje.
  if (Math.abs(denominator) < 0.01) {
    return null;
  }
  return round2((numerator / denominator) * 100);
}

function growthPct(current: number, previous: number | null): number | null {
  if (previous == null || Math.abs(previous) < 0.01) {
    return null;
  }
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

/**
 * Ratios sobre capital (ROE, ROIC, ROCE, apalancamiento, WACC, etc.): con
 * capital ≤ 0 (déficit patrimonial) el signo se invierte y el ratio deja de
 * ser significativo → N/D con motivo, mismo criterio null-safe del ER/safeRatio.
 */
function capitalNullReason(capital: number): CatalogNullReason | null {
  return capital > 0.01 ? null : "negativeCapital";
}

function pctOnCapital(numerator: number, capital: number): number | null {
  return capital > 0.01 ? pctOf(numerator, capital) : null;
}

function ratioOnCapital(numerator: number, capital: number): number | null {
  return capital > 0.01 ? safeRatio(numerator, capital) : null;
}

function clampScore(value: number | null, maxAbs: number): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return round2(Math.max(0, Math.min(100, (value / maxAbs) * 100)));
}

export function calculateMargenes(s: PeriodSnapshot): CatalogMetric[] {
  return [
    metric(1, "grossMargin", pctOf(s.utilidadBruta, s.ingresos), "pct"),
    metric(2, "ebitdaMargin", pctOf(s.ebitda, s.ingresos), "pct"),
    metric(3, "netMargin", pctOf(s.utilidadNeta, s.ingresos), "pct"),
    metric(4, "nopatMargin", pctOf(s.nopat, s.ingresos), "pct"),
    metric(5, "operatingMargin", pctOf(s.ebit, s.ingresos), "pct"),
    metric(6, "ocfMargin", pctOf(s.ocf, s.ingresos), "pct"),
    metric(7, "fcfMargin", pctOf(s.fcf, s.ingresos), "pct"),
    metric(8, "effectiveTaxRate", pctOf(s.impuestos, s.ebt), "pct"),
  ];
}

export function calculateRetorno(s: PeriodSnapshot, previous: PeriodSnapshot | null): CatalogMetric[] {
  const deltaNopat = previous ? round2(s.nopat - previous.nopat) : null;
  const deltaCi = previous ? round2(s.capitalInvertido - previous.capitalInvertido) : null;
  const ronic =
    deltaNopat != null && deltaCi != null && Math.abs(deltaCi) > 0.01 ? round2((deltaNopat / deltaCi) * 100) : null;
  // Capital empleado = activo total − |pasivo circulante|: la balanza persiste
  // pasivos en negativo; sin el abs el denominador sumaría en vez de restar.
  const capitalEmpleado = round2(s.activoTotal - Math.abs(s.pasivoCirculante));

  return [
    metric(9, "roic", pctOnCapital(s.nopat, s.capitalInvertido), "pct", capitalNullReason(s.capitalInvertido)),
    metric(10, "roce", pctOnCapital(s.ebit, capitalEmpleado), "pct", capitalNullReason(capitalEmpleado)),
    metric(11, "roe", pctOnCapital(s.utilidadNeta, s.patrimonio), "pct", capitalNullReason(s.patrimonio)),
    metric(12, "roa", pctOf(s.utilidadNeta, s.activoTotal), "pct"),
    metric(13, "gmroi", safeRatio(s.utilidadBruta, s.inventarioPromedio), "x"),
    metric(14, "ronic", ronic, "pct"),
    metric(15, "cashRoic", pctOnCapital(s.ocf, s.capitalInvertido), "pct", capitalNullReason(s.capitalInvertido)),
  ];
}

export function calculateEficiencia(s: PeriodSnapshot): CatalogMetric[] {
  return [
    metric(16, "assetTurnover", safeRatio(s.ingresos, s.activoTotal), "x"),
    metric(17, "receivablesTurnover", safeRatio(s.ingresos, s.cxc), "x"),
    metric(18, "inventoryTurnover", safeRatio(s.cogs, s.inventarios), "x"),
    metric(19, "payablesTurnover", safeRatio(s.cogs, s.cxp), "x"),
    metric(20, "icTurnover", ratioOnCapital(s.ingresos, s.capitalInvertido), "x", capitalNullReason(s.capitalInvertido)),
    metric(21, "nwcOfRevenue", pctOf(s.nwc, s.ingresos), "pct"),
    metric(22, "capexOfRevenue", pctOf(s.capex, s.ingresos), "pct"),
    metric(23, "sgaOfRevenue", pctOf(s.sga, s.ingresos), "pct"),
    metric(24, "daOfRevenue", pctOf(s.da, s.ingresos), "pct"),
  ];
}

export function calculateLiquidez(s: PeriodSnapshot): CatalogMetric[] {
  const runwayMonths = s.salidasOperativas > 0.01 ? round2(s.saldoCaja / s.salidasOperativas) : null;
  const runway = metric(28, "cashRunwayMonths", runwayMonths, "x");
  runway.formatted = runwayMonths == null ? "" : runwayMonths.toFixed(1);

  return [
    metric(25, "currentRatio", safeRatio(s.activoCirculante, Math.abs(s.pasivoCirculante)), "x"),
    metric(26, "quickRatio", safeRatio(s.activoCirculante - s.inventarios, Math.abs(s.pasivoCirculante)), "x"),
    metric(27, "cashRatio", safeRatio(s.cajaBancos, Math.abs(s.pasivoCirculante)), "x"),
    runway,
    metric(29, "cashEfficiency", safeRatio(s.fcf, s.ebitda), "x"),
    metric(30, "ccc", s.ccc, "days"),
    metric(31, "dso", s.dso, "days"),
    metric(32, "dpo", s.dpo, "days"),
    metric(33, "dio", s.dio, "days"),
  ];
}

export function calculateSolvencia(s: PeriodSnapshot, previous: PeriodSnapshot | null): CatalogMetric[] {
  const ebitGrowth = previous ? growthPct(s.ebit, previous.ebit) : null;
  const revGrowth = previous ? growthPct(s.ingresos, previous.ingresos) : null;
  const dol =
    ebitGrowth != null && revGrowth != null && Math.abs(revGrowth) > 0.01
      ? round2(ebitGrowth / revGrowth)
      : null;

  return [
    metric(34, "interestCoverage", safeRatio(s.ebit, s.gastosFinancieros), "x"),
    metric(35, "netDebtToEbitda", safeRatio(s.deudaNeta, s.ebitda), "x"),
    metric(36, "financialLeverage", ratioOnCapital(s.activoTotal, s.patrimonio), "x", capitalNullReason(s.patrimonio)),
    metric(37, "liabilityRatio", safeRatio(Math.abs(s.pasivoTotal), s.activoTotal), "x"),
    metric(38, "debtRatio", safeRatio(s.deudaBruta, s.activoTotal), "x"),
    metric(39, "costOfDebt", pctOf(s.gastosFinancieros, s.deudaBruta > 0.01 ? s.deudaBruta : 0), "pct"),
    metric(40, "operatingLeverage", dol, "x"),
    metric(41, "debtToRevenue", safeRatio(s.deudaBruta, s.ingresos), "x"),
  ];
}

export function calculateGestion(s: PeriodSnapshot, previous: PeriodSnapshot | null): CatalogMetric[] {
  const margenes = calculateMargenes(s);
  const retorno = calculateRetorno(s, previous);
  const liquidez = calculateLiquidez(s);
  const scoreParts = [
    clampScore(margenes.find((m) => m.key === "grossMargin")?.value ?? null, 60),
    clampScore(margenes.find((m) => m.key === "ebitdaMargin")?.value ?? null, 40),
    clampScore(retorno.find((m) => m.key === "roe")?.value ?? null, 40),
    clampScore(liquidez.find((m) => m.key === "currentRatio")?.value ?? null, 4),
  ].filter((n): n is number => n != null);
  const keyScore =
    scoreParts.length > 0 ? round2(scoreParts.reduce((acc, n) => acc + n, 0) / scoreParts.length) : null;

  const deltaEbitda = previous ? round2(s.ebitda - previous.ebitda) : null;
  const deltaRevenue = previous ? round2(s.ingresos - previous.ingresos) : null;
  const valueDriver =
    deltaEbitda != null && deltaRevenue != null && Math.abs(deltaRevenue) > 0.01
      ? round2(deltaEbitda / deltaRevenue)
      : null;

  // WACC: con capital contable NIF ≤ 0 la ponderación patrimonio/deuda deja
  // de ser significativa (el equity se recorta a 0 y el WACC colapsa al costo
  // de la deuda, ~1%) → N/D con motivo, mismo criterio que los demás ratios
  // sobre capital (#9/#11/#15/#20/#36/#48/#49).
  const waccPct = s.patrimonio > 0.01 ? round2(s.wacc * 100) : null;
  const spread = pctOnCapital(s.nopat, s.capitalInvertido);
  // #48 consume el WACC: si el hurdle rate es N/D el spread también lo es;
  // no se arrastra el WACC colapsado aunque el capital invertido sea > 0.
  const economicSpread = spread == null || waccPct == null ? null : round2(spread - waccPct);
  const roe = pctOnCapital(s.utilidadNeta, s.patrimonio);
  const shareholderMargin = roe == null ? null : round2(roe - s.ke * 100);
  const payout = s.utilidadNeta > 0.01 && s.dividendos > 0.01 ? pctOf(s.dividendos, s.utilidadNeta) : null;

  return [
    metric(42, "keyScore", keyScore, "score"),
    metric(43, "valueDriver", valueDriver, "x"),
    metric(44, "revenueGrowth", previous ? growthPct(s.ingresos, previous.ingresos) : null, "pct"),
    metric(45, "ebitdaGrowth", previous ? growthPct(s.ebitda, previous.ebitda) : null, "pct"),
    metric(46, "wacc", waccPct, "pct", capitalNullReason(s.patrimonio)),
    metric(47, "costOfEquity", round2(s.ke * 100), "pct"),
    metric(
      48,
      "economicSpread",
      economicSpread,
      "pct",
      capitalNullReason(s.capitalInvertido) ?? capitalNullReason(s.patrimonio),
    ),
    metric(49, "shareholderMargin", shareholderMargin, "pct", capitalNullReason(s.patrimonio)),
    metric(50, "dividendPayout", payout, "pct"),
  ];
}

export type CatalogCategories = {
  margenes: CatalogMetric[];
  retorno: CatalogMetric[];
  eficiencia: CatalogMetric[];
  liquidez: CatalogMetric[];
  solvencia: CatalogMetric[];
  gestion: CatalogMetric[];
};

export function getAllMetrics(current: PeriodSnapshot, previous: PeriodSnapshot | null): CatalogCategories {
  const groups: CatalogCategories = {
    margenes: calculateMargenes(current),
    retorno: calculateRetorno(current, previous),
    eficiencia: calculateEficiencia(current),
    liquidez: calculateLiquidez(current),
    solvencia: calculateSolvencia(current, previous),
    gestion: calculateGestion(current, previous),
  };

  if (!previous) {
    return groups;
  }

  const prior: CatalogMetric[] = [
    ...calculateMargenes(previous),
    ...calculateRetorno(previous, null),
    ...calculateEficiencia(previous),
    ...calculateLiquidez(previous),
    ...calculateSolvencia(previous, null),
    ...calculateGestion(previous, null),
  ];
  const priorByKey = new Map(prior.map((item) => [item.key, item.value]));

  (Object.keys(groups) as Array<keyof CatalogCategories>).forEach((category) => {
    groups[category] = groups[category].map((item) => {
      const prev = priorByKey.get(item.key) ?? null;
      const deltaPct =
        item.value != null && prev != null && Math.abs(prev) > 0.0001
          ? round2(((item.value - prev) / Math.abs(prev)) * 100)
          : null;
      return { ...item, previous: prev, deltaPct };
    });
  });

  return groups;
}
