import { prisma } from "@/lib/prisma";
import { parsePeriodo } from "@/services/flujoService";
import {
  buildFlujoOperativoPuntos,
  esCuentaEfectivo,
  toDiasCalendario,
  type FlujoOperativoPayload,
} from "@/services/flujoOperativo";
import { round2, toNumber } from "@/services/money";

const EMPTY_TOTALES = { entradas: 0, salidas: 0, neto: 0, traspasos: 0 };

function emptyPayload(
  tenantId: string,
  periodo: string,
  moneda: string,
  availablePeriods: string[],
): FlujoOperativoPayload {
  return {
    tenantId,
    periodo,
    moneda,
    hasData: false,
    cuentas: [],
    saldoInicial: 0,
    saldoFinal: 0,
    totales: { ...EMPTY_TOTALES },
    puntos: [],
    availablePeriods,
  };
}

/**
 * Flujo operativo diario desde los movimientos reales del auxiliar de cuentas
 * (reportes CONTPAQi 06/07), limitado a cuentas de caja y bancos. Si el periodo
 * no tiene auxiliar persistido, devuelve hasData=false: la UI muestra el estado
 * vacío y nunca cifras estimadas.
 */
export async function getFlujoOperativo(
  tenantId: string,
  periodo: string,
  moneda = "MXN",
): Promise<FlujoOperativoPayload> {
  const target = parsePeriodo(periodo);
  const periodoLabel = target ? `${target.anio}-${String(target.periodo).padStart(2, "0")}` : periodo;

  const available = await prisma.auxiliarCuentaResumen.findMany({
    where: { tenantId, moneda },
    distinct: ["anio", "periodo"],
    select: { anio: true, periodo: true },
    orderBy: [{ anio: "asc" }, { periodo: "asc" }],
  });
  const availablePeriods = available.map(
    (row) => `${row.anio}-${String(row.periodo).padStart(2, "0")}`,
  );

  if (!target) {
    return emptyPayload(tenantId, periodoLabel, moneda, availablePeriods);
  }

  const [resumen, movimientos] = await Promise.all([
    prisma.auxiliarCuentaResumen.findMany({
      where: { tenantId, anio: target.anio, periodo: target.periodo, moneda },
      orderBy: { idCuenta: "asc" },
    }),
    prisma.auxiliarMovimiento.findMany({
      where: { tenantId, anio: target.anio, periodo: target.periodo, moneda },
      orderBy: [{ fecha: "asc" }, { idCuenta: "asc" }],
    }),
  ]);

  const cuentasEfectivo = resumen.filter((row) => esCuentaEfectivo(row.idCuenta));
  const efectivoIds = new Set(cuentasEfectivo.map((row) => row.idCuenta));
  const movimientosEfectivo = movimientos.filter((row) => efectivoIds.has(row.idCuenta));

  if (cuentasEfectivo.length === 0 && movimientosEfectivo.length === 0) {
    return emptyPayload(tenantId, periodoLabel, moneda, availablePeriods);
  }

  const saldoInicial = round2(
    cuentasEfectivo.reduce((sum, row) => sum + toNumber(row.saldoInicial), 0),
  );
  const { puntos, totales, saldoFinal } = buildFlujoOperativoPuntos(
    movimientosEfectivo.map((row) => ({
      fecha: row.fecha,
      idCuenta: row.idCuenta,
      concepto: row.concepto,
      referencia: row.referencia,
      cargos: toNumber(row.cargos),
      abonos: toNumber(row.abonos),
    })),
    saldoInicial,
  );

  return {
    tenantId,
    periodo: periodoLabel,
    moneda,
    hasData: true,
    cuentas: cuentasEfectivo.map((row) => row.nombreCuenta),
    saldoInicial,
    saldoFinal,
    totales,
    // Eje X continuo: día 1 → último del mes; los días sin movimiento quedan
    // en cero con el saldo plano (el tablero diario no salta fechas).
    puntos: toDiasCalendario(puntos, saldoInicial, target.anio, target.periodo),
    availablePeriods,
  };
}
