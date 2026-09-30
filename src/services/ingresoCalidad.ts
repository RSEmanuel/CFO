import { classifyErCuenta } from "@/services/estadoOperativo";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { round2 } from "@/services/money";

/**
 * Monitor de Calidad de Ingreso y Pacing (tab Ingreso).
 *
 * Universo: SOLO ventas operativas = cuentas 4xxx hoja (`classifyErCuenta`
 * → "ventas"). Las financieras 7102/7104 (utilidad cambiaria, fondos) son
 * `productosFinancieros` y NUNCA entran aquí, aunque en la balanza tengan
 * categoriaMaestra = "Ingreso".
 *
 * Mapeo de devoluciones/deducciones (catálogo real Compac):
 * - Ventas brutas = Σ haber de las hojas 4xxx.
 * - Deducciones = Σ debe de las hojas 4xxx. Cubre AMBOS patrones vistos en la
 *   historia del tenant: la cuenta dedicada 4201 "Dev sobre Vts tasa gral" y
 *   los cargos directos sobre 4101 (2024-11, 2026-01, 2026-02; $450,258.58).
 * - Ventas netas = brutas − deducciones (= haber − debe, idéntico al bucket
 *   canónico `computeErBuckets.ventas`).
 * - Tasa de erosión = deducciones / brutas × 100. Badge: verde < 2%;
 *   ámbar ≥ 2% (el spec pide ámbar > 3%; la zona 2–3% queda ámbar preventivo).
 *
 * Run-rate (días NATURALES, no hábiles):
 * - Periodo CERRADO (anterior al mes en curso): avance = 100%, los días
 *   transcurridos = días totales y el "cierre estimado" = cierre real.
 * - Mes EN CURSO: días transcurridos = día del mes de `hoy`; el cierre
 *   estimado = promedio diario × días totales (proyección).
 * - Variación vs presupuesto oficial (montoPresupuestado de cuentas Ingreso);
 *   sin presupuesto cargado → comparativo en null y nota "Sin presupuesto".
 *
 * Materialidad de la tabla comercial: subcuentas con |monto neto| ≥ $10,000
 * se listan; el resto se pliega en "Otros ingresos menores" (oculto si la
 * suma neta del pliegue es ~$0). Cuentas en $0.00 exacto nunca se muestran.
 */

export type IngresoCuentaRow = {
  idCuenta: string;
  nombreCuenta: string;
  debe: number;
  haber: number;
};

export type ErosionBadge = "verde" | "ambar";

export type IngresoCalidadFacturacion = {
  ventasBrutas: number;
  deducciones: number;
  ventasNetas: number;
  /** deducciones / brutas × 100 (1 decimal); null si brutas ≈ 0. */
  tasaErosionPct: number | null;
  badge: ErosionBadge | null;
};

export type IngresoPacing = {
  diasTranscurridos: number;
  diasTotales: number;
  /** 0–100; 100 en periodos cerrados. */
  avancePct: number;
  /** true cuando el periodo ya cerró (histórico): el run-rate es el cierre real. */
  esCierre: boolean;
  promedioDiario: number | null;
  cierreEstimado: number | null;
  /** Presupuesto oficial de ingreso del mes; null = sin presupuesto cargado. */
  presupuesto: number | null;
  varPresupuestoPct: number | null;
  varPresupuestoMxn: number | null;
};

export type IngresoTablaRow = {
  /** null solo en la fila agregada "Otros ingresos menores" (sin drill-down). */
  idCuenta: string | null;
  nombreCuenta: string;
  monto: number;
  /** % sobre ventas netas del mes (1 decimal); null si ventas netas ≈ 0. */
  pctVentas: number | null;
  /** Δ% vs mes anterior; null = sin comparable (cuenta en ~0 o sin balanza). */
  momPct: number | null;
  /** Δ% vs mismo mes del año anterior; null = sin comparable. */
  yoyPct: number | null;
  esOtrosMenores: boolean;
};

export type IngresoMonitorModel = {
  calidad: IngresoCalidadFacturacion;
  pacing: IngresoPacing;
  tabla: IngresoTablaRow[];
};

/** Umbral de materialidad de la tabla comercial: $10,000 MXN. */
export const INGRESO_TABLA_MIN_MXN = 10_000;

/** Badge de erosión: verde < 2%, ámbar ≥ 2% (zona 2–3% preventiva). */
export const EROSION_VERDE_MAX_PCT = 2;

const ZERO = 0.005;

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** Hojas 4xxx (ventas operativas) agregadas por cuenta; 7xx quedan fuera. */
function hojasVentas(rows: IngresoCuentaRow[]): Map<string, { nombreCuenta: string; debe: number; haber: number }> {
  const byCuenta = new Map<string, { nombreCuenta: string; debe: number; haber: number }>();
  for (const row of rows) {
    const acc = byCuenta.get(row.idCuenta) ?? { nombreCuenta: row.nombreCuenta, debe: 0, haber: 0 };
    acc.debe += row.debe;
    acc.haber += row.haber;
    byCuenta.set(row.idCuenta, acc);
  }
  const leafSet = selectLeafCodes([...byCuenta.keys()]);
  const out = new Map<string, { nombreCuenta: string; debe: number; haber: number }>();
  for (const [idCuenta, acc] of byCuenta) {
    if (!leafSet.has(idCuenta)) continue;
    if (classifyErCuenta(idCuenta) !== "ventas") continue;
    out.set(idCuenta, acc);
  }
  return out;
}

/** Neto por cuenta (haber − debe) para comparativos MoM/YoY. */
function netosPorCuenta(rows: IngresoCuentaRow[] | null): Map<string, number> | null {
  if (rows == null) return null;
  const out = new Map<string, number>();
  for (const [idCuenta, acc] of hojasVentas(rows)) {
    out.set(idCuenta, round2(acc.haber - acc.debe));
  }
  return out;
}

export function buildCalidadFacturacion(actual: IngresoCuentaRow[]): IngresoCalidadFacturacion {
  let ventasBrutas = 0;
  let deducciones = 0;
  for (const acc of hojasVentas(actual).values()) {
    ventasBrutas += acc.haber;
    deducciones += acc.debe;
  }
  ventasBrutas = round2(ventasBrutas);
  deducciones = round2(deducciones);
  const ventasNetas = round2(ventasBrutas - deducciones);
  const tasaErosionPct = ventasBrutas > ZERO ? round1((deducciones / ventasBrutas) * 100) : null;
  const badge: ErosionBadge | null =
    tasaErosionPct == null ? null : tasaErosionPct < EROSION_VERDE_MAX_PCT ? "verde" : "ambar";
  return { ventasBrutas, deducciones, ventasNetas, tasaErosionPct, badge };
}

function daysInMonth(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function buildPacing(
  ventasNetas: number,
  opts: { anio: number; mes: number; hoy: Date; presupuesto: number | null },
): IngresoPacing {
  const { anio, mes, hoy, presupuesto } = opts;
  const diasTotales = daysInMonth(anio, mes);
  const hoyAnio = hoy.getUTCFullYear();
  const hoyMes = hoy.getUTCMonth() + 1;
  const periodoIdx = anio * 12 + (mes - 1);
  const hoyIdx = hoyAnio * 12 + (hoyMes - 1);

  const esCierre = periodoIdx < hoyIdx;
  const diasTranscurridos =
    periodoIdx < hoyIdx ? diasTotales : periodoIdx === hoyIdx ? Math.min(hoy.getUTCDate(), diasTotales) : 0;
  const avancePct = diasTotales > 0 ? round1((diasTranscurridos / diasTotales) * 100) : 0;

  const promedioDiario = diasTranscurridos > 0 ? round2(ventasNetas / diasTranscurridos) : null;
  // Sin doble redondeo: en periodo cerrado (transcurridos = totales) el cierre
  // estimado es exactamente el cierre real.
  const cierreEstimado =
    diasTranscurridos > 0 ? round2((ventasNetas / diasTranscurridos) * diasTotales) : null;

  const hasPresupuesto = presupuesto != null && Math.abs(presupuesto) > ZERO;
  const varPresupuestoMxn =
    hasPresupuesto && cierreEstimado != null ? round2(cierreEstimado - (presupuesto ?? 0)) : null;
  const varPresupuestoPct =
    varPresupuestoMxn != null && presupuesto != null ? round1((varPresupuestoMxn / presupuesto) * 100) : null;

  return {
    diasTranscurridos,
    diasTotales,
    avancePct,
    esCierre,
    promedioDiario,
    cierreEstimado,
    presupuesto: hasPresupuesto ? round2(presupuesto ?? 0) : null,
    varPresupuestoPct,
    varPresupuestoMxn,
  };
}

function deltaPct(actual: number, prior: number | null | undefined): number | null {
  if (prior == null || Math.abs(prior) <= ZERO) return null;
  return round1(((actual - prior) / Math.abs(prior)) * 100);
}

export function buildTablaComercial(
  actual: IngresoCuentaRow[],
  mesAnterior: IngresoCuentaRow[] | null,
  anoAnterior: IngresoCuentaRow[] | null,
  ventasNetas: number,
): IngresoTablaRow[] {
  const priorMes = netosPorCuenta(mesAnterior);
  const priorAnio = netosPorCuenta(anoAnterior);
  const pctVentasOf = (monto: number) =>
    Math.abs(ventasNetas) > ZERO ? round1((monto / ventasNetas) * 100) : null;

  const visibles: IngresoTablaRow[] = [];
  const plegadas: Array<{ idCuenta: string; monto: number }> = [];

  for (const [idCuenta, acc] of hojasVentas(actual)) {
    const monto = round2(acc.haber - acc.debe);
    if (Math.abs(monto) <= ZERO) continue; // $0.00 exacto: nunca se muestra
    if (Math.abs(monto) >= INGRESO_TABLA_MIN_MXN) {
      visibles.push({
        idCuenta,
        nombreCuenta: acc.nombreCuenta,
        monto,
        pctVentas: pctVentasOf(monto),
        momPct: deltaPct(monto, priorMes?.get(idCuenta)),
        yoyPct: deltaPct(monto, priorAnio?.get(idCuenta)),
        esOtrosMenores: false,
      });
    } else {
      plegadas.push({ idCuenta, monto });
    }
  }

  visibles.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));

  if (plegadas.length > 0) {
    const montoMenores = round2(plegadas.reduce((sum, row) => sum + row.monto, 0));
    if (Math.abs(montoMenores) > ZERO) {
      const priorMesMenores = priorMes
        ? round2(plegadas.reduce((sum, row) => sum + (priorMes.get(row.idCuenta) ?? 0), 0))
        : null;
      const priorAnioMenores = priorAnio
        ? round2(plegadas.reduce((sum, row) => sum + (priorAnio.get(row.idCuenta) ?? 0), 0))
        : null;
      visibles.push({
        idCuenta: null,
        nombreCuenta: "",
        monto: montoMenores,
        pctVentas: pctVentasOf(montoMenores),
        momPct: priorMesMenores != null ? deltaPct(montoMenores, priorMesMenores) : null,
        yoyPct: priorAnioMenores != null ? deltaPct(montoMenores, priorAnioMenores) : null,
        esOtrosMenores: true,
      });
    }
  }

  return visibles;
}

export function buildIngresoMonitor(input: {
  actual: IngresoCuentaRow[];
  mesAnterior: IngresoCuentaRow[] | null;
  anoAnterior: IngresoCuentaRow[] | null;
  anio: number;
  mes: number;
  hoy: Date;
  presupuesto: number | null;
}): IngresoMonitorModel {
  const calidad = buildCalidadFacturacion(input.actual);
  const pacing = buildPacing(calidad.ventasNetas, {
    anio: input.anio,
    mes: input.mes,
    hoy: input.hoy,
    presupuesto: input.presupuesto,
  });
  const tabla = buildTablaComercial(input.actual, input.mesAnterior, input.anoAnterior, calidad.ventasNetas);
  return { calidad, pacing, tabla };
}
