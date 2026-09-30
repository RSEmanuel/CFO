import { DEFAULT_ACCOUNT_ROLES, findRoleLeaves, matchesRole } from "@/services/ingest/accountRoles";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import type { AccountRoles } from "@/services/ingest/types";
import { round2 } from "@/services/money";

export type Top5Grupo = {
  key: string;
  label: string;
  monto: number;
};

export const OTROS_KEY = "__otros__";

const MONTH_ABBR_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

function periodKey(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export type MonthPoint = {
  key: string;
  label: string;
  anio: number;
  mes: number;
};

export type Top5EntitySeries = {
  key: string;
  label: string;
  monto: number;
  series: number[];
};

export type Top5ChartSeries = {
  months: Array<{ key: string; label: string }>;
  /**
   * Denominador del mes: universo auxiliar (no el KPI de ingreso del P&L).
   * Clientes = Σ cargos de hojas de cliente. Líneas = Σ (haber − debe) 4xx.
   * OPEX reutiliza esta serie con su propio universo (total OPEX).
   */
  total: number[];
  entidades: Top5EntitySeries[];
  resto: Top5EntitySeries | null;
};

export type ResultadosTop5Payload = {
  tenantId: string;
  periodo: string;
  moneda: string;
  clientes: Top5Bloque;
  lineas: Top5Bloque;
  clientesSeries: Top5ChartSeries;
  lineasSeries: Top5ChartSeries;
  hasBalanza: boolean;
  fuenteClientes: "resumen" | "movimientos" | null;
};

// Fila del auxiliar de clientes (resumen por cuenta o movimientos ya
// agregados por cuenta). La capa Prisma convierte Decimal a number.
export type AuxiliarClienteRow = {
  idCuenta: string;
  nombreCuenta: string;
  cargos: number;
};

// Fila mínima de balanza para líneas de negocio (PyG 4xxx).
export type BalanzaLineaRow = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: string;
  debe: number;
  haber: number;
};

export type Top5Bloque = {
  grupos: Top5Grupo[];
  total: number;
};

function sortPositivos(grupos: Top5Grupo[]): Top5Grupo[] {
  return grupos.filter((grupo) => grupo.monto > 0.005).sort((a, b) => b.monto - a.monto);
}

function suma(grupos: Top5Grupo[]): number {
  return round2(grupos.reduce((sum, grupo) => sum + grupo.monto, 0));
}

export function topConOtros(grupos: Top5Grupo[], n = 5): Top5Grupo[] {
  const visibles = grupos.slice(0, n);
  const resto = grupos.slice(n);
  if (resto.length === 0) {
    return visibles;
  }
  const montoResto = round2(resto.reduce((sum, grupo) => sum + grupo.monto, 0));
  return [...visibles, { key: OTROS_KEY, label: "", monto: montoResto }];
}

// Ventana TTM de las series Top 5 de Destacados (clientes y líneas de negocio):
// 12 meses móviles terminando en el periodo seleccionado. Con Jul-2026 cubre
// Ago-2025 → Jul-2026.
export const TOP5_WINDOW_MONTHS = 12;

export function trailingMonths(anio: number, mes: number, count = 12): MonthPoint[] {
  const out: MonthPoint[] = [];
  let y = anio;
  let m = mes;
  for (let i = 0; i < count; i += 1) {
    out.unshift({
      key: periodKey(y, m),
      label: `${MONTH_ABBR_ES[m - 1]}-${String(y).slice(-2)}`,
      anio: y,
      mes: m,
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

// KPI de ingreso del P&L (haber − debe de toda cuenta Ingreso, incluye 7xx).
// NO es el denominador de participación de los widgets Top 5 de Destacados.
export function ingresoTotalKpi(rows: BalanzaLineaRow[]): number {
  return round2(
    rows
      .filter((row) => row.categoriaMaestra === "Ingreso")
      .reduce((sum, row) => sum + (row.haber - row.debe), 0),
  );
}

/** Universo auxiliar del mes = Σ montos rankeados (cargos clientes o volumen 4xx). */
export function totalAuxiliarMes(grupos: Top5Grupo[]): number {
  return suma(grupos);
}

export function alignTop5Series(
  months: MonthPoint[],
  totalAuxiliarMes: number[],
  gruposPorMes: Top5Grupo[][],
  rankingActivo: Top5Grupo[],
  n = 5,
): Top5ChartSeries {
  const top = rankingActivo.slice(0, n);
  const entidades: Top5EntitySeries[] = top.map((entidad) => ({
    key: entidad.key,
    label: entidad.label,
    monto: entidad.monto,
    series: months.map((_, index) => {
      const found = gruposPorMes[index]?.find((grupo) => grupo.key === entidad.key);
      return found ? found.monto : 0;
    }),
  }));

  // Resto = universo auxiliar del mes − Σ Top N. Con el denominador correcto
  // (Σ cargos clientes / Σ volumen 4xx) el Resto es ≥ 0. Si un llamador pasa
  // un total menor que ΣTop5 (p. ej. el KPI neto), el valor negativo se
  // conserva para tooltip/badges; la pila lo recorta a 0 (guarda defensivo).
  const restoValues = months.map((_, index) => {
    const topSuma = entidades.reduce((sum, entidad) => sum + (entidad.series[index] ?? 0), 0);
    return round2((totalAuxiliarMes[index] ?? 0) - topSuma);
  });
  const hasResto = rankingActivo.length > n || restoValues.some((value) => Math.abs(value) > 0.005);
  const resto: Top5EntitySeries | null = hasResto
    ? {
        key: OTROS_KEY,
        label: "",
        monto: restoValues[restoValues.length - 1] ?? 0,
        series: restoValues,
      }
    : null;

  return {
    months: months.map(({ key, label }) => ({ key, label })),
    total: totalAuxiliarMes.map((value) => round2(value)),
    entidades,
    resto,
  };
}

export const TOP5_STACK_ID = "ingreso";
/** % interior del segmento: solo si el tramo supera este umbral del total del mes. */
export const SEGMENT_LABEL_MIN_SHARE = 0.12;
/** Con más de este número de meses, el total sobre la barra va cada 2 + extremos. */
export const TOTAL_LABEL_DENSE_MONTHS = 14;

export function stackSharePct(monto: number, totalMes: number): number {
  return Math.abs(totalMes) > 0.01 ? (monto / totalMes) * 100 : 0;
}

export function shouldShowSegmentLabel(monto: number, totalMes: number): boolean {
  if (Math.abs(totalMes) <= 0.01 || monto <= 0.005) {
    return false;
  }
  return monto / Math.abs(totalMes) > SEGMENT_LABEL_MIN_SHARE;
}

export function shouldShowTotalLabel(index: number, count: number): boolean {
  if (count <= TOTAL_LABEL_DENSE_MONTHS) {
    return true;
  }
  return index === 0 || index === count - 1 || index % 2 === 0;
}

/**
 * Guarda defensivo: Recharts apila negativos hacia abajo. Si el denominador
 * del mes es menor que ΣTop5, el Resto visual se recorta a 0; tooltip y badges
 * conservan el valor real con signo.
 */
export function clampRestoForStack(resto: number): { visual: number; real: number; clamped: boolean } {
  const clamped = resto < -0.005;
  return { visual: Math.max(0, resto), real: resto, clamped };
}

export type Top5StackedPoint = {
  mes: string;
  monthKey: string;
  totalMes: number;
  restoReal: number;
  restoClamped: number;
} & Record<string, string | number>;

/** Clave visual en la cima de la pila (ignora Resto recortado a 0). */
export function stackTopKey(point: Top5StackedPoint, stackedKeys: string[]): string | null {
  for (let index = stackedKeys.length - 1; index >= 0; index -= 1) {
    const key = stackedKeys[index];
    if (key && Math.max(0, Number(point[key] ?? 0)) > 0.005) {
      return key;
    }
  }
  return stackedKeys[stackedKeys.length - 1] ?? null;
}

export function toTop5StackedPoints(series: Top5ChartSeries): Top5StackedPoint[] {
  return series.months.map((month, index) => {
    const totalMes = series.total[index] ?? 0;
    const restoReal = series.resto?.series[index] ?? 0;
    const { visual, clamped } = clampRestoForStack(restoReal);
    const point: Top5StackedPoint = {
      mes: month.label,
      monthKey: month.key,
      totalMes,
      restoReal,
      restoClamped: clamped ? 1 : 0,
    };
    for (const entidad of series.entidades) {
      const monto = entidad.series[index] ?? 0;
      point[entidad.key] = monto;
      point[`${entidad.key}_pct`] = round2(stackSharePct(monto, totalMes));
    }
    if (series.resto) {
      point[OTROS_KEY] = visual;
      point[`${OTROS_KEY}_pct`] = round2(stackSharePct(restoReal, totalMes));
    }
    return point;
  });
}

export function hasClampedResto(series: Top5ChartSeries): boolean {
  return Boolean(series.resto?.series.some((value) => value < -0.005));
}

export type Top5LegendRow = {
  key: string;
  label: string;
  monto: number;
  pct: number;
  isResto: boolean;
};

export function top5ActiveMonthRows(series: Top5ChartSeries, restLabel: string): {
  rows: Top5LegendRow[];
  periodTotal: number;
} {
  const last = Math.max(0, series.months.length - 1);
  const periodTotal = series.total[last] ?? 0;
  const entities: Top5LegendRow[] = series.entidades.map((actor) => {
    const monto = actor.series[last] ?? actor.monto;
    return {
      key: actor.key,
      label: actor.label,
      monto,
      pct: stackSharePct(monto, periodTotal),
      isResto: false,
    };
  });
  entities.sort((a, b) => b.monto - a.monto);
  if (!series.resto) {
    return { rows: entities, periodTotal };
  }
  const monto = series.resto.series[last] ?? series.resto.monto;
  return {
    periodTotal,
    rows: [
      ...entities,
      {
        key: series.resto.key,
        label: restLabel,
        monto,
        pct: stackSharePct(monto, periodTotal),
        isResto: true,
      },
    ],
  };
}

export function stackedTooltipRows(
  point: Top5StackedPoint,
  entidades: Top5EntitySeries[],
  restLabel: string,
  includeResto: boolean,
): Top5LegendRow[] {
  const totalMes = Number(point.totalMes);
  const rows: Top5LegendRow[] = entidades.map((actor) => {
    const monto = Number(point[actor.key] ?? 0);
    return {
      key: actor.key,
      label: actor.label,
      monto,
      pct: stackSharePct(monto, totalMes),
      isResto: false,
    };
  });
  if (includeResto) {
    const monto = Number(point.restoReal ?? 0);
    rows.push({
      key: OTROS_KEY,
      label: restLabel,
      monto,
      pct: stackSharePct(monto, totalMes),
      isResto: true,
    });
  }
  return rows.sort((a, b) => b.monto - a.monto);
}

// Contribución de un cliente = CARGOS del periodo en su hoja del auxiliar
// (ventas facturadas a crédito). NUNCA saldoFinal: eso es antigüedad CxC.
// Denominador de % = Σ esos cargos (universo auxiliar). Distinto de Concentración
// & Riesgo, que suma actividad + fallback de saldo pendiente en cuentas 1105.
export function buildTop5Clientes(rows: AuxiliarClienteRow[], roles: AccountRoles): Top5Bloque {
  const byCuenta = new Map<string, { idCuenta: string; nombreCuenta: string; cargos: number }>();
  for (const row of rows) {
    const acc = byCuenta.get(row.idCuenta) ?? {
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      cargos: 0,
    };
    acc.cargos += row.cargos;
    byCuenta.set(row.idCuenta, acc);
  }
  const cuentas = [...byCuenta.values()];
  const clienteRule = roles.clientes ?? DEFAULT_ACCOUNT_ROLES.clientes;
  const leaves = clienteRule ? findRoleLeaves(cuentas, clienteRule) : [];
  const grupos = sortPositivos(
    leaves.map((cuenta) => ({ key: cuenta.idCuenta, label: cuenta.nombreCuenta, monto: round2(cuenta.cargos) })),
  );
  return { grupos, total: suma(grupos) };
}

// Volumen de venta por línea = haber - debe del periodo en hojas del rol
// "ingresos" (4xx: 401/4101/4103 según el catálogo). Se excluyen mayores tipo
// 4101-0000-... y las cuentas 7xx (otros productos financieros), que la balanza
// clasifica como Ingreso pero NO son líneas de negocio.
// Denominador de % = Σ ese volumen 4xx (no el KPI de ingreso, que incluye 7xx).
export function buildTop5Lineas(rows: BalanzaLineaRow[], roles: AccountRoles): Top5Bloque {
  const byCuenta = new Map<string, { idCuenta: string; nombreCuenta: string; categoriaMaestra: string; debe: number; haber: number }>();
  for (const row of rows) {
    const acc = byCuenta.get(row.idCuenta) ?? {
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      categoriaMaestra: row.categoriaMaestra,
      debe: 0,
      haber: 0,
    };
    acc.debe += row.debe;
    acc.haber += row.haber;
    byCuenta.set(row.idCuenta, acc);
  }
  const cuentas = [...byCuenta.values()];
  const leafSet = selectLeafCodes(cuentas.map((cuenta) => cuenta.idCuenta));
  const ingresoRule = roles.ingresos ?? DEFAULT_ACCOUNT_ROLES.ingresos;
  const esLinea = (cuenta: { idCuenta: string; nombreCuenta: string; categoriaMaestra: string }) =>
    cuenta.categoriaMaestra === "Ingreso" &&
    (ingresoRule ? matchesRole(ingresoRule, cuenta.idCuenta, cuenta.nombreCuenta) : true);
  const grupos = sortPositivos(
    cuentas
      .filter((cuenta) => leafSet.has(cuenta.idCuenta) && esLinea(cuenta))
      .map((cuenta) => ({
        key: cuenta.idCuenta,
        label: cuenta.nombreCuenta,
        monto: round2(cuenta.haber - cuenta.debe),
      })),
  );
  return { grupos, total: suma(grupos) };
}
