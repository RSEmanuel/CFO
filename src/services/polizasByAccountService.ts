import { AppError } from "@/auth/errors";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/services/money";

/**
 * Drill-down de auditoría por cuenta contable: todos los movimientos de
 * póliza de una cuenta (o de sus subcuentas) dentro de un periodo.
 *
 * Convenciones:
 * - Prefijo por segmentos: "501" matchea "501-01-002" pero NO "5010" ni
 *   "5101". La cuenta matchea si es igual al prefijo o si continúa con un
 *   separador de segmento ("-" o "."). El catálogo real del tenant usa
 *   segmentos de 4 dígitos ("6101-0001-0000-0000"), así que "6101" cubre
 *   todas sus subcuentas.
 * - `codigoCuenta` acepta varios prefijos separados por coma
 *   ("4101,4103,4201") para rubros del ER que agregan más de un segmento.
 * - saldoNeto = cargos − abonos: positivo = saldo deudor del periodo para
 *   esa cuenta (convención de balanza: debe − haber).
 * - Orden cronológico por fecha de póliza; desempates deterministas por
 *   tipo, número de póliza y número de movimiento.
 */

export type PolizaMovimientoAuditDTO = {
  id: string;
  fecha: string;
  tipoPoliza: string;
  numeroPoliza: number;
  numeroMovimiento: number;
  conceptoGeneral: string;
  conceptoMov: string;
  referencia: string;
  codigoCuenta: string;
  nombreCuenta: string;
  cargo: number;
  abono: number;
};

export type PolizasByAccountResumen = {
  totalCargos: number;
  totalAbonos: number;
  /** cargos − abonos; positivo = saldo deudor del periodo. */
  saldoNeto: number;
  movimientos: number;
};

export type PolizasByAccountResponse = {
  codigoCuenta: string;
  anio: number;
  periodo: number;
  resumen: PolizasByAccountResumen;
  movimientos: PolizaMovimientoAuditDTO[];
};

const PREFIX_ITEM_RE = /^\d+([-.]\d+)*$/;

/** La cuenta matchea si es igual al prefijo o cuelga de él por segmento. */
export function matchesCuentaPrefix(codigoCuenta: string, prefix: string): boolean {
  if (!prefix) {
    return false;
  }
  return (
    codigoCuenta === prefix ||
    codigoCuenta.startsWith(`${prefix}-`) ||
    codigoCuenta.startsWith(`${prefix}.`)
  );
}

/** Normaliza la lista de prefijos (coma), valida y deduplica. */
export function parseCuentaPrefixes(raw: string): string[] {
  const items = [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
  if (items.length === 0) {
    throw new AppError("VALIDATION_ERROR", "El parámetro codigoCuenta es obligatorio.", 400);
  }
  for (const item of items) {
    if (!PREFIX_ITEM_RE.test(item)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `El código de cuenta "${item}" no es válido; usa dígitos y separadores "-" o ".".`,
        400,
      );
    }
  }
  return items;
}

export type MovimientosWhere = {
  tenantId: string;
  anio: number;
  periodo: number;
  OR: Array<{ codigoCuenta: string } | { codigoCuenta: { startsWith: string } }>;
};

/**
 * Where de Prisma para los movimientos. El tenantId siempre va inyectado
 * aquí: un tenant ajeno no puede filtrar movimientos fuera de su scope.
 */
export function buildMovimientosWhere(
  tenantId: string,
  anio: number,
  periodo: number,
  prefixes: string[],
): MovimientosWhere {
  return {
    tenantId,
    anio,
    periodo,
    OR: prefixes.flatMap((prefix) => [
      { codigoCuenta: prefix },
      { codigoCuenta: { startsWith: `${prefix}-` } },
      { codigoCuenta: { startsWith: `${prefix}.` } },
    ]),
  };
}

type SortableMovimiento = Pick<
  PolizaMovimientoAuditDTO,
  "fecha" | "tipoPoliza" | "numeroPoliza" | "numeroMovimiento"
>;

/** Cronológico por fecha de póliza; desempata tipo, póliza y número de movimiento. */
export function orderMovimientosCronologico<T extends SortableMovimiento>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      a.tipoPoliza.localeCompare(b.tipoPoliza, "es") ||
      a.numeroPoliza - b.numeroPoliza ||
      a.numeroMovimiento - b.numeroMovimiento,
  );
}

export function summarizeMovimientos(
  rows: Array<Pick<PolizaMovimientoAuditDTO, "cargo" | "abono">>,
): PolizasByAccountResumen {
  const totalCargos = round2(rows.reduce((sum, row) => sum + row.cargo, 0));
  const totalAbonos = round2(rows.reduce((sum, row) => sum + row.abono, 0));
  return {
    totalCargos,
    totalAbonos,
    saldoNeto: round2(totalCargos - totalAbonos),
    movimientos: rows.length,
  };
}

export async function getPolizasByAccount(
  tenantId: string,
  anio: number,
  periodo: number,
  codigoCuentaRaw: string,
): Promise<PolizasByAccountResponse> {
  const prefixes = parseCuentaPrefixes(codigoCuentaRaw);

  const [movimientos, polizas] = await Promise.all([
    prisma.polizaMovimiento.findMany({
      where: buildMovimientosWhere(tenantId, anio, periodo, prefixes),
    }),
    // Sin FK directa por convención del proyecto: el encabezado (fecha y
    // concepto general) se resuelve por la clave compuesta tipo+número.
    prisma.poliza.findMany({
      where: { tenantId, anio, periodo },
      select: { tipo: true, numero: true, fecha: true, concepto: true },
    }),
  ]);

  const encabezadoPorLlave = new Map(
    polizas.map((poliza) => [`${poliza.tipo}:${poliza.numero}`, poliza] as const),
  );

  const rows: PolizaMovimientoAuditDTO[] = movimientos.map((mov) => {
    const encabezado = encabezadoPorLlave.get(`${mov.tipoPoliza}:${mov.numeroPoliza}`);
    return {
      id: mov.id,
      fecha: encabezado ? encabezado.fecha.toISOString().slice(0, 10) : "",
      tipoPoliza: mov.tipoPoliza,
      numeroPoliza: mov.numeroPoliza,
      numeroMovimiento: mov.numeroMovimiento,
      conceptoGeneral: encabezado?.concepto ?? "",
      conceptoMov: mov.concepto,
      referencia: mov.referencia,
      codigoCuenta: mov.codigoCuenta,
      nombreCuenta: mov.nombreCuenta,
      cargo: Number(mov.cargo),
      abono: Number(mov.abono),
    };
  });

  const ordered = orderMovimientosCronologico(rows);

  return {
    codigoCuenta: prefixes.join(","),
    anio,
    periodo,
    resumen: summarizeMovimientos(ordered),
    movimientos: ordered,
  };
}
