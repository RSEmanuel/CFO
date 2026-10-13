import { computeErBuckets, type ErBuckets } from "@/services/estadoOperativo";
import { findCashLeaves } from "@/services/ingest/accountRoles";
import type { AccountRoles } from "@/services/ingest/types";
import { round2 } from "@/services/money";

/**
 * Definición única de "tu caja" y "meses de respiro" (B06). Sale solo de la
 * balanza, que cualquier sistema contable genera; tesorería y auxiliares de
 * bancos se usan para el detalle de movimientos, nunca para estas dos cifras.
 *
 * - Tu caja: saldo final de las cuentas de caja y bancos (hojas, rol bancos +
 *   caja) al cierre del mes.
 * - Gasto mensual: lo que cuesta operar un mes según el PyG oficial
 *   (computeErBuckets): costo de ventas + gastos de operación sin depreciación
 *   + gastos financieros + ISR y PTU. Promedio de hasta 3 meses del año.
 * - Meses de respiro: tu caja ÷ gasto mensual. Cuánto aguantas si dejara de
 *   entrar dinero.
 */

export const MESES_RITMO = 3;

type BalanzaFila = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: string;
  saldoFinal: unknown;
  debe: unknown;
  haber: unknown;
  periodo: number;
};

export type CajaYRespiro = {
  caja: number;
  /** Cuántas cuentas de caja y bancos sumaron (0 = la balanza no trae caja). */
  cuentas: number;
  gastoMensual: number | null;
  /** Meses de PyG promediados para el gasto mensual (1 a 3). */
  mesesRitmo: number;
  mesesDeRespiro: number | null;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function cajaDeBalanza(
  balanzaCierre: BalanzaFila[],
  roles?: AccountRoles | null,
): { caja: number; cuentas: number } {
  const activo = balanzaCierre.filter((fila) => fila.categoriaMaestra === "Activo");
  const cuentas = findCashLeaves(activo, roles);
  return { caja: round2(cuentas.reduce((acc, fila) => acc + num(fila.saldoFinal), 0)), cuentas: cuentas.length };
}

/** Lo que sale cada mes para operar, con el PyG oficial. */
export function gastoMensualDeOperacion(er: ErBuckets): number {
  return round2(er.costo + Math.max(er.totalOpex - er.da, 0) + er.gastosFinancieros + er.ptu + er.isr);
}

/** Promedio del gasto mensual en los últimos MESES_RITMO meses con balanza (≤ periodo). */
export function ritmoGastoMensual(
  balanzaHistorial: BalanzaFila[],
  periodo: number,
): { gastoMensual: number | null; meses: number } {
  const porMes = new Map<number, BalanzaFila[]>();
  for (const fila of balanzaHistorial) {
    if (fila.periodo > periodo) continue;
    const list = porMes.get(fila.periodo) ?? [];
    list.push(fila);
    porMes.set(fila.periodo, list);
  }
  const meses = [...porMes.keys()].sort((a, b) => b - a).slice(0, MESES_RITMO);
  if (meses.length === 0) {
    return { gastoMensual: null, meses: 0 };
  }
  const total = meses.reduce((acc, mes) => {
    const er = computeErBuckets(
      (porMes.get(mes) ?? []).map((fila) => ({
        idCuenta: fila.idCuenta,
        nombreCuenta: fila.nombreCuenta,
        debe: num(fila.debe),
        haber: num(fila.haber),
      })),
    );
    return acc + gastoMensualDeOperacion(er);
  }, 0);
  return { gastoMensual: round2(total / meses.length), meses: meses.length };
}

export function mesesDeRespiro(caja: number, gastoMensual: number | null): number | null {
  if (gastoMensual == null || gastoMensual <= 0.01) {
    return null;
  }
  return round2(Math.max(caja, 0) / gastoMensual);
}

/**
 * Tu caja al cierre de `periodo` y sus meses de respiro. `balanzaHistorial`
 * trae los meses del año hasta el periodo (incluido); sin historial se usa
 * solo el mes de cierre.
 */
export function cajaYRespiro(input: {
  periodo: number;
  balanzaCierre: BalanzaFila[];
  balanzaHistorial?: BalanzaFila[];
  roles?: AccountRoles | null;
}): CajaYRespiro {
  const { caja, cuentas } = cajaDeBalanza(input.balanzaCierre, input.roles);
  const historial = input.balanzaHistorial && input.balanzaHistorial.length > 0 ? input.balanzaHistorial : input.balanzaCierre;
  const ritmo = ritmoGastoMensual(historial, input.periodo);
  return {
    caja,
    cuentas,
    gastoMensual: ritmo.gastoMensual,
    mesesRitmo: ritmo.meses,
    mesesDeRespiro: cuentas > 0 ? mesesDeRespiro(caja, ritmo.gastoMensual) : null,
  };
}
