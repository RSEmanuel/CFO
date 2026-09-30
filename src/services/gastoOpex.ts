import { computeErBuckets, isErOpexCuenta, type ErBuckets } from "@/services/estadoOperativo";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { round2 } from "@/services/money";
import {
  alignTop5Series,
  OTROS_KEY,
  type MonthPoint,
  type Top5ChartSeries,
  type Top5Grupo,
} from "@/services/resultadosTop5";

export type GastoOpexRow = {
  idCuenta: string;
  nombreCuenta: string;
  debe: number;
  haber: number;
};

function aggregateByCuenta(rows: GastoOpexRow[]): GastoOpexRow[] {
  const byCuenta = new Map<string, GastoOpexRow>();
  for (const row of rows) {
    const acc = byCuenta.get(row.idCuenta) ?? {
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      debe: 0,
      haber: 0,
    };
    acc.debe += row.debe;
    acc.haber += row.haber;
    if (row.nombreCuenta) {
      acc.nombreCuenta = row.nombreCuenta;
    }
    byCuenta.set(row.idCuenta, acc);
  }
  return [...byCuenta.values()];
}

/**
 * Hojas afectables de OPEX canónico (mismo universo que `computeErBuckets.totalOpex`).
 * Incluye ceros y negativos para que Otros = total − ΣTop5 cierre el mes.
 */
export function buildGastoOpexGrupos(rows: GastoOpexRow[]): { grupos: Top5Grupo[]; totalOpex: number } {
  const cuentas = aggregateByCuenta(rows);
  const leafSet = selectLeafCodes(cuentas.map((cuenta) => cuenta.idCuenta));
  const grupos = cuentas
    .filter((cuenta) => leafSet.has(cuenta.idCuenta) && isErOpexCuenta(cuenta.idCuenta))
    .map((cuenta) => ({
      key: cuenta.idCuenta,
      label: cuenta.nombreCuenta,
      monto: round2(cuenta.debe - cuenta.haber),
    }))
    .sort((a, b) => b.monto - a.monto || a.key.localeCompare(b.key));
  return { grupos, totalOpex: computeErBuckets(rows).totalOpex };
}

export function rankingGastoOpex(grupos: Top5Grupo[], n = 5): Top5Grupo[] {
  return grupos.filter((grupo) => grupo.monto > 0.005).slice(0, n);
}

/** Top 5 del periodo activo; historia 12m con el mismo criterio; Otros = total − ΣTop5. */
export function buildGastoOpexSeries(
  months: MonthPoint[],
  gruposPorMes: Top5Grupo[][],
  totales: number[],
  rankingActivo: Top5Grupo[],
  n = 5,
): Top5ChartSeries {
  const series = alignTop5Series(months, totales, gruposPorMes, rankingActivo, n);
  const restoValues = series.total.map((total, index) => {
    const top = series.entidades.reduce((sum, entidad) => sum + (entidad.series[index] ?? 0), 0);
    return round2(total - top);
  });
  const hasResto = restoValues.some((value) => Math.abs(value) > 0.005);
  return {
    ...series,
    resto: hasResto
      ? {
          key: OTROS_KEY,
          label: "",
          monto: restoValues[restoValues.length - 1] ?? 0,
          series: restoValues,
        }
      : null,
  };
}

const ZERO = 0.005;

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** Quita acentos/diacríticos y pasa a minúsculas para matching laboral. */
export function normalizeCuentaNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabras clave laborales (regex sobre nombre ya normalizado, sin acentos).
 * Lista explícita y testeable; no usa NÓMINA genérico (evita “servicio de máq. nómina”).
 *
 * Cuentas Compac jul-2026 que matchean (universo OPEX 61xx–63xx/6xxx, sin 6405/6406):
 * - 6101-0001 Sueldos y Salarios
 * - 6101-0006 Vacaciones
 * - 6101-0007 Prima Vacacional
 * - 6101-0012 Aguinaldo
 * - 6101-0019 Fondo de Ahorro
 * - 6101-0026 Cuotas al IMSS
 * - 6101-0027 Aportacione al INFONAVIT
 * - 6101-0028 Aportaciones al SAR
 * - 6101-0029 Impuesto Estatal sobre Nóminas
 * - 6101-0031 Asimilados a Salarios
 * CESANTÍA y SEGURO DE GASTOS MÉDICOS no existen en este catálogo (el patrón sí los cubre).
 */
export const LABOR_KEYWORDS = [
  "sueldos?",
  "salarios?",
  "asimilados?",
  "imss",
  "infonavit",
  "sar",
  "aguinaldo",
  "vacaciones",
  "fondo de ahorro",
  "impuesto(?: estatal)? sobre nominas?",
  "prima vacacional",
  "cesantia",
  "seguro de gastos medicos",
] as const;

export const LABOR_NAME_PATTERNS: readonly RegExp[] = LABOR_KEYWORDS.map(
  (keyword) => new RegExp(`(?:^|[^a-z0-9])(?:${keyword})(?:[^a-z0-9]|$)`),
);

export function isLaborOpexNombre(nombreCuenta: string): boolean {
  const normalized = normalizeCuentaNombre(nombreCuenta);
  return LABOR_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

export type LaborOpexCuenta = {
  idCuenta: string;
  nombreCuenta: string;
  monto: number;
};

export function matchLaborOpexCuentas(rows: GastoOpexRow[]): { cuentas: LaborOpexCuenta[]; total: number } {
  const cuentas = aggregateByCuenta(rows);
  const leafSet = selectLeafCodes(cuentas.map((cuenta) => cuenta.idCuenta));
  const matched = cuentas
    .filter(
      (cuenta) =>
        leafSet.has(cuenta.idCuenta) &&
        isErOpexCuenta(cuenta.idCuenta) &&
        isLaborOpexNombre(cuenta.nombreCuenta),
    )
    .map((cuenta) => ({
      idCuenta: cuenta.idCuenta,
      nombreCuenta: cuenta.nombreCuenta,
      monto: round2(cuenta.debe - cuenta.haber),
    }))
    .sort((a, b) => b.monto - a.monto || a.idCuenta.localeCompare(b.idCuenta));
  const total = round2(matched.reduce((sum, cuenta) => sum + cuenta.monto, 0));
  return { cuentas: matched, total };
}

/** (OPEX / ventas netas) × 100. Null si ventas ≤ 0 (no inventa el ratio). */
export function opexAbsorptionPct(opex: number, ventas: number): number | null {
  if (ventas <= ZERO) {
    return null;
  }
  return round1((opex / ventas) * 100);
}

export type JawsBadge = "saludable" | "invertida";

export type JawsRatio = {
  jawsPp: number;
  deltaIngresosPct: number;
  deltaOpexPct: number;
  badge: JawsBadge;
};

/**
 * Jaws = %Δ ingresos MoM − %Δ OPEX MoM.
 * Null si el mes anterior tiene ingreso u OPEX ≤ 0 (no inventa el signo).
 */
export function computeJawsRatio(input: {
  ventasActual: number;
  ventasAnterior: number;
  opexActual: number;
  opexAnterior: number;
}): JawsRatio | null {
  if (input.ventasAnterior <= ZERO || input.opexAnterior <= ZERO) {
    return null;
  }
  const deltaIngresosPct = ((input.ventasActual - input.ventasAnterior) / input.ventasAnterior) * 100;
  const deltaOpexPct = ((input.opexActual - input.opexAnterior) / input.opexAnterior) * 100;
  const jawsPp = round1(deltaIngresosPct - deltaOpexPct);
  return {
    jawsPp,
    deltaIngresosPct: round1(deltaIngresosPct),
    deltaOpexPct: round1(deltaOpexPct),
    badge: jawsPp >= 0 ? "saludable" : "invertida",
  };
}

/**
 * Split canónico Compac (no SAT 601/602):
 * - venta: prefijo 6101 → `gastosVenta`
 * - admin: prefijo 6201 → `gastosAdmin`
 * - otros: 6301 (`daContable`) + resto 6xxx (`otrosOperativos`), sin PTU 6405 ni ISR 6406
 * Por construcción venta + admin + otros = totalOpex.
 */
export type OpexCommercialSplit = {
  venta: number;
  admin: number;
  otros: number;
  total: number;
  pctVenta: number | null;
  pctAdmin: number | null;
  pctOtros: number | null;
};

export function opexCommercialSplit(buckets: ErBuckets): OpexCommercialSplit {
  const venta = buckets.gastosVenta;
  const admin = buckets.gastosAdmin;
  const otros = round2(buckets.daContable + buckets.otrosOperativos);
  const total = buckets.totalOpex;
  if (Math.abs(total) <= ZERO) {
    return { venta, admin, otros, total, pctVenta: null, pctAdmin: null, pctOtros: null };
  }
  return {
    venta,
    admin,
    otros,
    total,
    pctVenta: round1((venta / total) * 100),
    pctAdmin: round1((admin / total) * 100),
    pctOtros: round1((otros / total) * 100),
  };
}

export type GastoOpexControl = {
  ventas: number;
  opex: number;
  absorcionPct: number | null;
  pesosPorPeso: number | null;
  jaws: (JawsRatio & { periodoAnterior: string }) | null;
  laboral: { monto: number; pctOpex: number | null; cuentas: LaborOpexCuenta[] };
  split: OpexCommercialSplit;
  anterior: { periodo: string; ventas: number; opex: number } | null;
};

export function computeGastoOpexControl(
  actual: GastoOpexRow[],
  anterior: GastoOpexRow[] | null,
  periodoAnterior: string | null,
): GastoOpexControl {
  const actualBuckets = computeErBuckets(actual);
  const laboral = matchLaborOpexCuentas(actual);
  const absorcionPct = opexAbsorptionPct(actualBuckets.totalOpex, actualBuckets.ventas);
  const priorBuckets = anterior && anterior.length > 0 ? computeErBuckets(anterior) : null;
  const jaws =
    priorBuckets && periodoAnterior
      ? computeJawsRatio({
          ventasActual: actualBuckets.ventas,
          ventasAnterior: priorBuckets.ventas,
          opexActual: actualBuckets.totalOpex,
          opexAnterior: priorBuckets.totalOpex,
        })
      : null;
  const pctOpex =
    Math.abs(actualBuckets.totalOpex) > ZERO ? round1((laboral.total / actualBuckets.totalOpex) * 100) : null;

  return {
    ventas: actualBuckets.ventas,
    opex: actualBuckets.totalOpex,
    absorcionPct,
    pesosPorPeso: absorcionPct == null ? null : round2(absorcionPct / 100),
    jaws: jaws && periodoAnterior ? { ...jaws, periodoAnterior } : null,
    laboral: { monto: laboral.total, pctOpex, cuentas: laboral.cuentas },
    split: opexCommercialSplit(actualBuckets),
    anterior: priorBuckets && periodoAnterior
      ? { periodo: periodoAnterior, ventas: priorBuckets.ventas, opex: priorBuckets.totalOpex }
      : null,
  };
}

/**
 * Detector de fugas OPEX vs. promedio móvil de los 3 meses anteriores (M-1, M-2, M-3).
 *
 * Universo: hojas OPEX canónicas (`isErOpexCuenta` via `buildGastoOpexGrupos`).
 *
 * Historia:
 * - Se promedian solo los meses previos que existan en el ledger (filas de balanza).
 * - Si hay <3 meses de historia, se usa n=1 o n=2. Mínimo 1 mes previo con dato
 *   (a nivel empresa: el array `priorMonthsRows` no vacío). Sin ese mínimo, no hay alertas.
 * - En un mes existente, una subcuenta sin movimiento cuenta como 0 (entra al promedio).
 *
 * Alerta si AMBAS: gastoMes > promedio3M × 1.20 **y** (gastoMes − promedio3M) ≥ $25,000.
 * gastoMes ≤ 0 → nunca alerta.
 *
 * Promedio ~0 con gastoMes > 0: desviación “nueva” (UI N/A). Alerta si excedente ≥ $25K
 * (la condición del 20% queda vacuamente cumplida).
 */
export const OPEX_ALERT_RATIO = 1.2;
export const OPEX_ALERT_EXCESO_MIN = 25_000;

export type GastoOpexAlerta = {
  idCuenta: string;
  nombreCuenta: string;
  gastoMes: number;
  promedio3M: number;
  /** Null = promedio 0 / cuenta nueva → la UI muestra N/A. */
  desviacionPct: number | null;
  excedente: number;
  mesesHistoria: number;
};

export function detectGastoOpexAlertas(
  actual: GastoOpexRow[],
  priorMonthsRows: GastoOpexRow[][],
): GastoOpexAlerta[] {
  const history = priorMonthsRows.filter((rows) => rows.length > 0);
  if (history.length === 0) {
    return [];
  }

  const { grupos: activos } = buildGastoOpexGrupos(actual);
  const priorMaps = history.map((rows) => {
    const { grupos } = buildGastoOpexGrupos(rows);
    return new Map(grupos.map((grupo) => [grupo.key, grupo.monto]));
  });
  const mesesHistoria = priorMaps.length;
  const alertas: GastoOpexAlerta[] = [];

  for (const grupo of activos) {
    if (grupo.monto <= ZERO) {
      continue;
    }
    const priorValues = priorMaps.map((map) => map.get(grupo.key) ?? 0);
    const promedio3M = round2(priorValues.reduce((sum, value) => sum + value, 0) / mesesHistoria);
    const excedente = round2(grupo.monto - promedio3M);
    const promedioCero = Math.abs(promedio3M) <= ZERO;

    if (promedioCero) {
      if (excedente >= OPEX_ALERT_EXCESO_MIN) {
        alertas.push({
          idCuenta: grupo.key,
          nombreCuenta: grupo.label,
          gastoMes: grupo.monto,
          promedio3M: 0,
          desviacionPct: null,
          excedente,
          mesesHistoria,
        });
      }
      continue;
    }

    if (grupo.monto > promedio3M * OPEX_ALERT_RATIO && excedente >= OPEX_ALERT_EXCESO_MIN) {
      alertas.push({
        idCuenta: grupo.key,
        nombreCuenta: grupo.label,
        gastoMes: grupo.monto,
        promedio3M,
        desviacionPct: round1((excedente / promedio3M) * 100),
        excedente,
        mesesHistoria,
      });
    }
  }

  return alertas.sort((a, b) => b.excedente - a.excedente || a.idCuenta.localeCompare(b.idCuenta));
}
