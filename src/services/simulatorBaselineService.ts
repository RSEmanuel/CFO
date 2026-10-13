import { AppError } from "@/auth/errors";
import { cccFromBalanza } from "@/services/capitalTrabajoCalcs";
import { computeErBuckets } from "@/services/estadoOperativo";
import { loadPeriodData, snapshotFromLoaded } from "@/services/metricsService";
import { resolveAccountRoles } from "@/services/ingresoMixService";
import { money } from "@/services/metricsLedger";
import { round2 } from "@/services/money";
import type { SimulatorBaseline } from "@/services/simulatorEngine";

/**
 * Línea base del Simulador What-If: compone en UNA respuesta los insumos
 * canónicos ya existentes (prohibido recomputar con aritmética nueva):
 * - PyG del mes: `computeErBuckets` (la única aritmética canónica del PyG).
 * - DSO/DIO/DPO/CCC y bases anualizadas: `cccFromBalanza` con los mismos
 *   insumos que usa `buildPeriodSnapshot` (cierre = movimiento = balanza del
 *   mes) → idénticos al catálogo #30-#33.
 * - Deuda financiera: `buildPeriodSnapshot` vía `snapshotFromLoaded`
 *   (rol deudaFinanciera).
 * - Caja y burn mensual: definición única de `services/caja.ts` (B06), la
 *   misma del catálogo #28 y de Flujo: tu caja = cuentas de caja y bancos de
 *   la balanza; burn = gasto mensual de operación del PyG oficial.
 * - Tasa efectiva REAL del periodo: impuestos (PTU+ISR) / EBT; 0 cuando no
 *   hubo provisión (el motor aplica entonces el fallback 30% del catálogo).
 * - Costo de deuda efectivo: gastos financieros del ER / deuda financiera,
 *   misma razón que la métrica #39 (aquí como ratio mensual; sin la caída a
 *   tesorería del snapshot para mantener la identidad RIF = prod − gastos).
 */
export type SimulatorBaselinePayload = SimulatorBaseline & {
  /** Periodo "YYYY-MM" del corte. */
  periodoLabel: string;
  assumptions: string[];
};

export const SIMULATOR_BASELINE_ASSUMPTIONS: string[] = [
  "La línea base es 100% canónica: buckets del ER Operativo (computeErBuckets), DSO/DPO/DIO/CCC desde la balanza (cccFromBalanza) y deuda/caja/runway del snapshot del catálogo (buildPeriodSnapshot). El simulador no recomputa ninguna de estas cifras.",
  "La tasa efectiva reportada es la REAL del periodo (PTU+ISR / RAII). Si el periodo no provisionó impuestos (tasa 0%), el motor aplica el fallback del 30% del catálogo (mismo criterio que NOPAT) y lo etiqueta en la UI.",
  "El costo de deuda efectivo es gastos financieros del ER (8101) / deuda financiera del periodo (ratio mensual), la misma razón de la métrica #39; a diferencia del catálogo no cae al servicio de deuda de tesorería para preservar la identidad RIF = productos − gastos financieros.",
  "La caja y los meses de respiro de la línea base son los del catálogo #28 (services/caja.ts): cuentas de caja y bancos de la balanza ÷ gasto mensual de operación del PyG oficial (promedio de hasta 3 meses).",
  "La simulación corre en memoria sobre la línea base: ninguna corrida muta la base de datos.",
];

function assertPeriodoAnio(periodo: number, anio: number): void {
  if (!Number.isInteger(periodo) || periodo < 1 || periodo > 12) {
    throw new AppError("VALIDATION_ERROR", "El periodo debe ser un entero entre 1 y 12.", 400);
  }
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw new AppError("VALIDATION_ERROR", "El año debe ser un entero válido.", 400);
  }
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export async function getSimulatorBaseline(
  tenantId: string,
  anio: number,
  periodo: number,
): Promise<SimulatorBaselinePayload> {
  assertPeriodoAnio(periodo, anio);
  const [data, accountRoles] = await Promise.all([
    loadPeriodData(tenantId, periodo, anio),
    resolveAccountRoles(tenantId),
  ]);

  const snapshot = snapshotFromLoaded(anio, periodo, data, accountRoles);
  const er = computeErBuckets(
    data.balanzaMes.map((fila) => ({
      idCuenta: fila.idCuenta,
      nombreCuenta: fila.nombreCuenta,
      debe: money(fila.debe),
      haber: money(fila.haber),
    })),
  );
  // Mismos insumos que buildPeriodSnapshot → mismos DSO/DPO/DIO/CCC que el
  // catálogo; además expone las bases anualizadas para el ΔNWC del motor.
  const ccc = cccFromBalanza({
    balanzaCierre: data.balanzaMes,
    balanzaMov: data.balanzaMes,
    roles: accountRoles,
  });

  const impuestos = round2(er.ptu + er.isr);
  const tasaEfectiva = er.ebt > 0.01 && impuestos > 0.01 ? round2(impuestos / er.ebt) : 0;
  const deudaFinanciera = snapshot.deudaBruta;
  const costoDeudaMensual = deudaFinanciera > 0.01 ? round4(er.gastosFinancieros / deudaFinanciera) : 0;

  return {
    tenantId,
    anio,
    periodo,
    periodoLabel: `${anio}-${String(periodo).padStart(2, "0")}`,
    ventas: er.ventas,
    cogs: er.costo,
    opex: er.totalOpex,
    da: er.da,
    ebit: er.ebit,
    ebitda: er.ebitda,
    productosFinancieros: er.productosFinancieros,
    gastosFinancieros: er.gastosFinancieros,
    rif: er.rif,
    ebt: er.ebt,
    impuestos,
    utilidadNeta: er.utilidadNeta,
    dso: ccc.dso,
    dio: ccc.dio,
    dpo: ccc.dpo,
    ccc: ccc.days,
    ventasAnualizadas: ccc.ventasAnualizadas,
    cogsAnualizado: ccc.cogsAnualizado,
    deudaFinanciera,
    caja: snapshot.cajaBancos,
    salidasOperativas: snapshot.gastoMensual ?? 0,
    tasaEfectiva,
    costoDeudaMensual,
    assumptions: SIMULATOR_BASELINE_ASSUMPTIONS,
  };
}
