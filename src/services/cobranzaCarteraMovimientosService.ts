import { AppError } from "@/auth/errors";
import { prisma } from "@/lib/prisma";
import {
  computeRunningBalance,
  type CobranzaCarteraMovimientosPayload,
} from "@/services/cobranzaCarteraMovimientos";
import { clasificaCuentaCartera } from "@/services/cobranzaCarteraService";
import { toNumber } from "@/services/money";

/**
 * Detalle de movimientos del auxiliar (CONTPAQi reportes 06/07) para UNA cuenta
 * de cartera en un periodo. Solo servidor; la lógica de acumulado y el orden
 * viven en `cobranzaCarteraMovimientos.ts` (módulo puro, testeable).
 */
export async function getCobranzaCarteraMovimientos(
  tenantId: string,
  cuenta: string,
  anio: number,
  periodo: number,
  moneda = "MXN",
): Promise<CobranzaCarteraMovimientosPayload> {
  const type = clasificaCuentaCartera(cuenta);
  if (!type) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La cuenta no pertenece a la cartera de clientes ni de proveedores.",
      400,
    );
  }

  const resumen = await prisma.auxiliarCuentaResumen.findFirst({
    where: { tenantId, anio, periodo, moneda, idCuenta: cuenta },
  });
  if (!resumen) {
    throw new AppError(
      "NOT_FOUND",
      "No hay saldo de cartera para esa cuenta en el periodo seleccionado.",
      404,
    );
  }

  const movimientosRows = await prisma.auxiliarMovimiento.findMany({
    where: { tenantId, anio, periodo, moneda, idCuenta: cuenta },
    orderBy: [{ fecha: "asc" }, { tipoPoliza: "asc" }, { numeroPoliza: "asc" }],
  });

  const movimientos = computeRunningBalance(
    type,
    toNumber(resumen.saldoInicial),
    movimientosRows.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      tipoPoliza: row.tipoPoliza,
      numeroPoliza: row.numeroPoliza,
      concepto: row.concepto,
      referencia: row.referencia,
      cargos: toNumber(row.cargos),
      abonos: toNumber(row.abonos),
    })),
  ).map((movimiento) => ({
    id: movimiento.id,
    fecha: movimiento.fecha.toISOString().slice(0, 10),
    tipoPoliza: movimiento.tipoPoliza,
    numeroPoliza: movimiento.numeroPoliza,
    concepto: movimiento.concepto,
    referencia: movimiento.referencia,
    cargos: movimiento.cargos,
    abonos: movimiento.abonos,
    saldoAcumulado: movimiento.saldoAcumulado,
  }));

  return {
    tenantId,
    anio,
    periodo,
    moneda,
    cuenta,
    nombreCuenta: resumen.nombreCuenta,
    type,
    saldoInicial: toNumber(resumen.saldoInicial),
    saldoFinal: toNumber(resumen.saldoFinal),
    movimientos,
  };
}
