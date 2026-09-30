import { periodLabel } from "@/services/financialDataTransformer";
import { formatAxisTick, round2, type DisplayUnits } from "@/services/money";

export type FlujoMensual = {
  periodo: string;
  saldoInicial: number;
  entradasOperativas: number;
  salidasOperativas: number;
  salidasCapex: number;
  servicioDeuda: number;
  saldoFinal: number;
};

export type FlujoTendenciaPoint = {
  periodo: string;
  label: string;
  flujoNeto: number;
  saldoFinal: number;
};

export type FlujoTendenciaInsight = {
  messageKey: string;
  values?: Record<string, string | number>;
  favorable: boolean;
};

export type FlujoTendenciaModel = {
  points: FlujoTendenciaPoint[];
  insight: FlujoTendenciaInsight | null;
};

export type FlujoWaterfallWindow = "month" | "quarter";

export type FlujoWaterfallStepKind = "total" | "increase" | "decrease";

export type FlujoWaterfallStep = {
  key: string;
  label: string;
  labelKey?: string;
  kind: FlujoWaterfallStepKind;
  value: number;
};

export type FlujoWaterfallModel = {
  steps: FlujoWaterfallStep[];
  insight: FlujoTendenciaInsight | null;
};

export type FlujoActividadKey = "operacion" | "inversion" | "financiamiento";

export type FlujoActividadPoint = {
  periodo: string;
  label: string;
  value: number;
};

export type FlujoActividadComponente = {
  label: string;
  labelKey?: string;
  amount: number;
};

export type FlujoActividadFamily = {
  key: FlujoActividadKey;
  title: string;
  titleKey?: string;
  description: string;
  descriptionKey?: string;
  points: FlujoActividadPoint[];
  actual: number;
  rango: { min: number; max: number };
  vsMesAnterior: number | null;
  vsMesAnioAnterior: number | null;
  componentes: FlujoActividadComponente[];
};

function flujoNetoOf(row: FlujoMensual): number {
  return round2(row.saldoFinal - row.saldoInicial);
}

export function buildFlujoTendencia(
  rows: FlujoMensual[],
  periodo: string,
  units: DisplayUnits,
  monthsBack = 13,
): FlujoTendenciaModel {
  if (rows.length === 0 || monthsBack <= 0) {
    return { points: [], insight: null };
  }

  const found = rows.findIndex((row) => row.periodo === periodo);
  const resolvedEnd = found >= 0 ? found : rows.length - 1;
  const startIndex = Math.max(0, resolvedEnd - monthsBack + 1);
  const window = rows.slice(startIndex, resolvedEnd + 1);

  const points: FlujoTendenciaPoint[] = window.map((row) => ({
    periodo: row.periodo,
    label: periodLabel(row.periodo),
    flujoNeto: flujoNetoOf(row),
    saldoFinal: row.saldoFinal,
  }));

  if (points.length < 2) {
    return { points, insight: null };
  }

  const last = points[points.length - 1];
  const prior = points[points.length - 2];
  const delta = round2(last.saldoFinal - prior.saldoFinal);
  return {
    points,
    insight: cashInsight(delta, units),
  };
}

function parsePeriodo(periodo: string): { year: number; month: number } {
  const [year, month] = periodo.split("-").map(Number);
  return { year: year || 2025, month: month || 12 };
}

function shiftPeriodo(periodo: string, deltaMonths: number): string {
  const { year, month } = parsePeriodo(periodo);
  const date = new Date(year, month - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function quarterOf(month: number): number {
  return Math.ceil(month / 3);
}

function quarterTag(year: number, quarter: number): string {
  return `T${quarter}-${year}`;
}

function priorQuarter(year: number, quarter: number): { year: number; quarter: number } {
  if (quarter === 1) {
    return { year: year - 1, quarter: 4 };
  }
  return { year, quarter: quarter - 1 };
}

function monthsForQuarter(rows: FlujoMensual[], year: number, quarter: number): FlujoMensual[] {
  const start = (quarter - 1) * 3 + 1;
  return rows.filter((row) => {
    const parsed = parsePeriodo(row.periodo);
    return parsed.year === year && parsed.month >= start && parsed.month < start + 3;
  });
}

function cashInsight(delta: number, units: DisplayUnits): FlujoTendenciaInsight {
  const tick = formatAxisTick(Math.abs(delta), units);
  if (delta > 0) {
    return { messageKey: "flujo.cashIncreased", values: { amount: tick }, favorable: true };
  }
  return { messageKey: "flujo.cashDecreased", values: { amount: tick }, favorable: false };
}

function waterfallSteps(args: {
  startLabel: string;
  endLabel: string;
  saldoInicial: number;
  entradasOperativas: number;
  salidasOperativas: number;
  salidasCapex: number;
  servicioDeuda: number;
  saldoFinal: number;
}): FlujoWaterfallStep[] {
  return [
    { key: "inicio", label: args.startLabel, kind: "total", value: args.saldoInicial },
    { key: "entradasOperativas", label: "Entradas operativas", labelKey: "flujo.operatingInflows", kind: "increase", value: args.entradasOperativas },
    { key: "salidasOperativas", label: "Salidas operativas", labelKey: "flujo.operatingOutflows", kind: "decrease", value: args.salidasOperativas },
    { key: "capex", label: "CapEx", labelKey: "flujo.capex", kind: "decrease", value: args.salidasCapex },
    { key: "servicioDeuda", label: "Servicio de deuda", labelKey: "flujo.debtService", kind: "decrease", value: args.servicioDeuda },
    { key: "fin", label: args.endLabel, kind: "total", value: args.saldoFinal },
  ];
}

export function buildFlujoWaterfall(
  rows: FlujoMensual[],
  periodo: string,
  window: FlujoWaterfallWindow,
  units: DisplayUnits,
): FlujoWaterfallModel {
  if (rows.length === 0) {
    return { steps: [], insight: null };
  }

  const found = rows.findIndex((row) => row.periodo === periodo);
  const current = rows[found >= 0 ? found : rows.length - 1];
  const { year, month } = parsePeriodo(current.periodo);

  if (window === "quarter") {
    const quarter = quarterOf(month);
    const ofQuarter = monthsForQuarter(rows, year, quarter);
    if (ofQuarter.length === 0) {
      return { steps: [], insight: null };
    }
    const first = ofQuarter[0];
    const last = ofQuarter[ofQuarter.length - 1];
    const prior = priorQuarter(year, quarter);
    const entradasOperativas = round2(ofQuarter.reduce((sum, row) => sum + row.entradasOperativas, 0));
    const salidasOperativas = round2(ofQuarter.reduce((sum, row) => sum + row.salidasOperativas, 0));
    const salidasCapex = round2(ofQuarter.reduce((sum, row) => sum + row.salidasCapex, 0));
    const servicioDeuda = round2(ofQuarter.reduce((sum, row) => sum + row.servicioDeuda, 0));
    const delta = round2(last.saldoFinal - first.saldoInicial);
    return {
      steps: waterfallSteps({
        startLabel: quarterTag(prior.year, prior.quarter),
        endLabel: quarterTag(year, quarter),
        saldoInicial: first.saldoInicial,
        entradasOperativas,
        salidasOperativas,
        salidasCapex,
        servicioDeuda,
        saldoFinal: last.saldoFinal,
      }),
      insight: cashInsight(delta, units),
    };
  }

  const priorPeriod = shiftPeriodo(current.periodo, -1);
  const priorRow = rows.find((row) => row.periodo === priorPeriod);
  const delta = round2(current.saldoFinal - current.saldoInicial);
  return {
    steps: waterfallSteps({
      startLabel: priorRow ? periodLabel(priorRow.periodo) : "Inicio",
      endLabel: periodLabel(current.periodo),
      saldoInicial: current.saldoInicial,
      entradasOperativas: current.entradasOperativas,
      salidasOperativas: current.salidasOperativas,
      salidasCapex: current.salidasCapex,
      servicioDeuda: current.servicioDeuda,
      saldoFinal: current.saldoFinal,
    }),
    insight: cashInsight(delta, units),
  };
}

function actividadOf(row: FlujoMensual, key: FlujoActividadKey): number {
  if (key === "operacion") {
    return round2(row.entradasOperativas - row.salidasOperativas);
  }
  if (key === "inversion") {
    return round2(-row.salidasCapex);
  }
  return round2(-row.servicioDeuda);
}

function componentesOf(row: FlujoMensual, key: FlujoActividadKey): FlujoActividadComponente[] {
  if (key === "operacion") {
    return [
      { label: "Entradas operativas", labelKey: "flujo.operatingInflows", amount: row.entradasOperativas },
      { label: "Salidas operativas", labelKey: "flujo.operatingOutflows", amount: round2(-row.salidasOperativas) },
      { label: "Neto", labelKey: "flujo.net", amount: actividadOf(row, "operacion") },
    ];
  }
  if (key === "inversion") {
    return [{ label: "CapEx", labelKey: "flujo.capex", amount: round2(-row.salidasCapex) }];
  }
  return [{ label: "Servicio de deuda", labelKey: "flujo.debtService", amount: round2(-row.servicioDeuda) }];
}

const ACTIVIDAD_META: Array<{
  key: FlujoActividadKey;
  title: string;
  titleKey: string;
  description: string;
  descriptionKey: string;
}> = [
  {
    key: "operacion",
    title: "Operación",
    titleKey: "flujo.operation",
    description: "Efectivo generado por la operación: cobros menos pagos del día a día.",
    descriptionKey: "flujo.operationHelp",
  },
  {
    key: "inversion",
    title: "Inversión",
    titleKey: "flujo.investing",
    description: "Salidas (o entradas) por activos de largo plazo: CapEx.",
    descriptionKey: "flujo.investingHelp",
  },
  {
    key: "financiamiento",
    title: "Financiamiento",
    titleKey: "flujo.financing",
    description: "Caja vinculada a deuda: servicio de deuda del periodo.",
    descriptionKey: "flujo.financingHelp",
  },
];

function deltaVs(rows: FlujoMensual[], current: FlujoMensual, key: FlujoActividadKey, months: number): number | null {
  const prior = rows.find((row) => row.periodo === shiftPeriodo(current.periodo, months));
  if (!prior) {
    return null;
  }
  return round2(actividadOf(current, key) - actividadOf(prior, key));
}

export function buildFlujosPorActividad(
  rows: FlujoMensual[],
  periodo: string,
  monthsBack = 10,
): FlujoActividadFamily[] {
  if (rows.length === 0 || monthsBack <= 0) {
    return [];
  }

  const found = rows.findIndex((row) => row.periodo === periodo);
  const resolvedEnd = found >= 0 ? found : rows.length - 1;
  const current = rows[resolvedEnd];
  const startIndex = Math.max(0, resolvedEnd - monthsBack + 1);
  const window = rows.slice(startIndex, resolvedEnd + 1);

  return ACTIVIDAD_META.map((meta) => {
    const points: FlujoActividadPoint[] = window.map((row) => ({
      periodo: row.periodo,
      label: periodLabel(row.periodo),
      value: actividadOf(row, meta.key),
    }));
    const values = points.map((point) => point.value);
    return {
      key: meta.key,
      title: meta.title,
      titleKey: meta.titleKey,
      description: meta.description,
      descriptionKey: meta.descriptionKey,
      points,
      actual: actividadOf(current, meta.key),
      rango: {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
      },
      vsMesAnterior: deltaVs(rows, current, meta.key, -1),
      vsMesAnioAnterior: deltaVs(rows, current, meta.key, -12),
      componentes: componentesOf(current, meta.key),
    };
  });
}

export type FlujoAlerta = { messageKey: string; values?: Record<string, string | number> };

export function buildFlujoAlertas(rows: FlujoMensual[], periodo: string): FlujoAlerta[] {
  if (rows.length === 0) {
    return [];
  }

  const found = rows.findIndex((row) => row.periodo === periodo);
  const current = rows[found >= 0 ? found : rows.length - 1];
  const alerts: FlujoAlerta[] = [];

  if (current.saldoFinal < 1.5 * current.salidasOperativas) {
    alerts.push({ messageKey: "flujo.alertsMessages.lowRunway" });
  }

  const prior = rows.find((row) => row.periodo === shiftPeriodo(current.periodo, -1));
  if (prior && flujoNetoOf(current) < 0 && flujoNetoOf(prior) < 0) {
    alerts.push({ messageKey: "flujo.alertsMessages.negativeTwoMonths" });
  }

  if (current.salidasCapex > 0.5 * current.entradasOperativas) {
    alerts.push({ messageKey: "flujo.alertsMessages.highCapex" });
  }

  return alerts;
}
