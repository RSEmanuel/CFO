import type { CarteraTipo } from "@/services/cobranzaCarteraService";
import { round2 } from "@/services/money";

/**
 * Lógica pura del detalle de movimientos de cartera (sin Prisma: seguro para
 * importar desde componentes de cliente). La consulta a BD vive en
 * `cobranzaCarteraMovimientosService.ts`.
 *
 * Convención de running balance (verificada contra datos reales 2024-08→2026-07):
 * - CLIENTE (naturaleza deudora):  saldo += cargos − abonos.
 * - PROVEEDOR (naturaleza acreedora): saldo += abonos − cargos.
 * Ambos parten del `saldoInicial` de la cuenta y el acumulado final cuadra con
 * el `saldoFinal` del resumen (= `saldoPendiente` de la fila de cartera).
 *
 * Orden cronológico: fecha ASC; el desempate intra-día por tipo/número de
 * póliza es solo determinista — el saldo final no depende del orden intra-día.
 * No se usa el campo `saldo` crudo del reporte porque su orden de captura no es
 * estrictamente cronológico.
 */

export type CarteraMovimientoInput = {
  fecha: Date;
  tipoPoliza: string;
  numeroPoliza: string;
  cargos: number;
  abonos: number;
};

export type CarteraMovimientoItem = {
  id: string;
  /** YYYY-MM-DD (fecha de captura, sin componente de zona horaria). */
  fecha: string;
  tipoPoliza: string;
  numeroPoliza: string;
  concepto: string;
  referencia: string;
  cargos: number;
  abonos: number;
  saldoAcumulado: number;
};

export type CobranzaCarteraMovimientosPayload = {
  tenantId: string;
  anio: number;
  periodo: number;
  moneda: string;
  cuenta: string;
  nombreCuenta: string;
  type: CarteraTipo;
  saldoInicial: number;
  saldoFinal: number;
  movimientos: CarteraMovimientoItem[];
};

/** Umbral de "cuenta saldada": residuos de redondeo menores a $1.00 se ocultan. */
export const CARTERA_SALDO_UMBRAL = 1.0;

export function isCuentaConSaldoPendiente(saldoPendiente: number): boolean {
  return Math.abs(saldoPendiente) >= CARTERA_SALDO_UMBRAL;
}

/**
 * Filtro de umbral en cliente: los KPIs de cartera se calculan en el servidor
 * sobre el universo completo, así que ocultar residuos NO los altera.
 */
export function filterCarteraPorUmbral<T extends { saldoPendiente: number }>(
  items: T[],
  mostrarSaldadas: boolean,
): T[] {
  if (mostrarSaldadas) return items;
  return items.filter((item) => isCuentaConSaldoPendiente(item.saldoPendiente));
}

/** Orden cronológico determinista: fecha, luego tipo y número de póliza. */
export function compareMovimientosCronologico(
  a: CarteraMovimientoInput,
  b: CarteraMovimientoInput,
): number {
  const byFecha = a.fecha.getTime() - b.fecha.getTime();
  if (byFecha !== 0) return byFecha;
  const byTipo = a.tipoPoliza.localeCompare(b.tipoPoliza);
  if (byTipo !== 0) return byTipo;
  return a.numeroPoliza.localeCompare(b.numeroPoliza);
}

/**
 * Acumula el saldo movimiento a movimiento según la naturaleza de la cuenta.
 * Se redondea a centavos en cada paso para que el acumulado mostrado cuadre
 * exactamente con la suma de la columna Cargo − Abono.
 */
export function computeRunningBalance<T extends CarteraMovimientoInput>(
  type: CarteraTipo,
  saldoInicial: number,
  movimientos: T[],
): Array<T & { saldoAcumulado: number }> {
  let saldo = round2(saldoInicial);
  return movimientos.map((movimiento) => {
    const delta =
      type === "CLIENTE"
        ? movimiento.cargos - movimiento.abonos
        : movimiento.abonos - movimiento.cargos;
    saldo = round2(saldo + delta);
    return { ...movimiento, saldoAcumulado: saldo };
  });
}
