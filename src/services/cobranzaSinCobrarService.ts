import { prisma } from "@/lib/prisma";
import {
  buildClientesSinCobrar,
  type ClientesSinCobrarModel,
  type CuentaCartera,
  type MovimientoCartera,
} from "@/services/carteraSinCobrar";
import { clasificaCuentaCartera } from "@/services/cobranzaCarteraService";
import { toNumber } from "@/services/money";

const MONEDA = "MXN";

export type SinCobrarPayload = {
  /** YYYY-MM-DD: último día del periodo más reciente con auxiliar de clientes. */
  corte: string;
  model: ClientesSinCobrarModel;
};

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inicioDePeriodo(anio: number, periodo: number): string {
  return `${anio}-${String(periodo).padStart(2, "0")}-01`;
}

function finDePeriodo(anio: number, periodo: number): string {
  return iso(new Date(Date.UTC(anio, periodo, 0)));
}

/**
 * Clientes con facturas sin cobrar a partir de los movimientos auxiliares de
 * CONTPAQi (cuentas de clientes), para empresas sin auxiliar de ventas con
 * fecha de vencimiento. Solo MXN: nunca se suman monedas. Null sin auxiliar.
 */
export async function getClientesSinCobrar(tenantId: string): Promise<SinCobrarPayload | null> {
  const resumenes = (
    await prisma.auxiliarCuentaResumen.findMany({
      where: { tenantId, moneda: MONEDA },
      orderBy: [{ anio: "asc" }, { periodo: "asc" }],
    })
  ).filter((row) => clasificaCuentaCartera(row.idCuenta) === "CLIENTE");
  const ultimo = resumenes[resumenes.length - 1];
  if (!ultimo) {
    return null;
  }

  // Primera y última fila de cada cuenta: saldo con el que empiezan los datos y saldo de hoy.
  const primera = new Map<string, (typeof resumenes)[number]>();
  const ultima = new Map<string, (typeof resumenes)[number]>();
  for (const row of resumenes) {
    if (!primera.has(row.idCuenta)) {
      primera.set(row.idCuenta, row);
    }
    ultima.set(row.idCuenta, row);
  }

  const movimientosRows = await prisma.auxiliarMovimiento.findMany({
    where: { tenantId, moneda: MONEDA, idCuenta: { in: [...primera.keys()] } },
    select: { idCuenta: true, fecha: true, cargos: true, abonos: true },
  });
  const movimientosPorCuenta = new Map<string, MovimientoCartera[]>();
  for (const row of movimientosRows) {
    const lista = movimientosPorCuenta.get(row.idCuenta) ?? [];
    lista.push({ fecha: iso(row.fecha), cargos: toNumber(row.cargos), abonos: toNumber(row.abonos) });
    movimientosPorCuenta.set(row.idCuenta, lista);
  }

  const corte = finDePeriodo(ultimo.anio, ultimo.periodo);
  const cuentas: CuentaCartera[] = [];
  for (const [idCuenta, inicial] of primera) {
    const final = ultima.get(idCuenta);
    // Sin fila en el último periodo no se sabe cuánto debe hoy: no se inventa.
    if (!final || final.anio !== ultimo.anio || final.periodo !== ultimo.periodo) {
      continue;
    }
    cuentas.push({
      cliente: final.nombreCuenta,
      inicio: inicioDePeriodo(inicial.anio, inicial.periodo),
      saldoInicial: toNumber(inicial.saldoInicial),
      saldoFinal: toNumber(final.saldoFinal),
      movimientos: movimientosPorCuenta.get(idCuenta) ?? [],
    });
  }
  return { corte, model: buildClientesSinCobrar(cuentas, corte) };
}
