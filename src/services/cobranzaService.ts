import { prisma } from "@/lib/prisma";
import {
  buildAntiguedad,
  type AntiguedadDocumento,
  type AntiguedadModel,
} from "@/services/antiguedad";
import {
  buildCobranza,
  saldoDe,
  type CobranzaFactura,
  type CobranzaModel,
} from "@/services/cobranzaTransformer";
import {
  getCommittedIngestPeriods,
  resolvePeriodOrigins,
  type PeriodOrigins,
} from "@/services/dataOrigin";
import { toNumber } from "@/services/money";

export type CobranzaPayload = {
  tenantId: string;
  hasData: boolean;
  asOf: string | null;
  model: CobranzaModel | null;
  antiguedadCxc: AntiguedadModel | null;
  antiguedadCxp: AntiguedadModel | null;
  periodOrigins: PeriodOrigins;
};

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getCobranza(tenantId: string): Promise<CobranzaPayload> {
  const [ventas, ingresos, egresos, committedPeriods] = await Promise.all([
    prisma.auxiliarVentas.findMany({
      where: { tenantId },
      orderBy: { fechaEmision: "asc" },
    }),
    prisma.balanzaPnL.findMany({
      where: { tenantId, categoriaMaestra: "Ingreso" },
      orderBy: [{ anio: "desc" }, { periodo: "desc" }],
    }),
    prisma.auxiliarEgresos.findMany({
      where: { tenantId },
      orderBy: { fechaEmision: "asc" },
    }),
    getCommittedIngestPeriods(tenantId),
  ]);
  if (ventas.length === 0 && egresos.length === 0) {
    return {
      tenantId,
      hasData: false,
      asOf: null,
      model: null,
      antiguedadCxc: null,
      antiguedadCxp: null,
      periodOrigins: {},
    };
  }
  const fechas = [
    ...ventas.map((row) => row.fechaEmision),
    ...egresos.map((row) => row.fechaEmision),
  ];
  const asOf = iso(
    fechas.reduce((latest, fecha) => (fecha > latest ? fecha : latest), fechas[0]),
  );
  const facturas: CobranzaFactura[] = ventas.map((row) => ({
    cliente: row.nombreCliente,
    fechaEmision: iso(row.fechaEmision),
    fechaVencimiento: iso(row.fechaVencimiento),
    monto: toNumber(row.montoSubtotal) + toNumber(row.iva),
    cobrado: toNumber(row.montoCobrado),
  }));
  const incomePeriods = Array.from(
    new Set(ingresos.map((row) => `${row.anio}-${String(row.periodo).padStart(2, "0")}`)),
  )
    .filter((periodo) => periodo <= asOf.slice(0, 7))
    .sort()
    .slice(-12);
  const ingresoTtm = ingresos
    .filter((row) => incomePeriods.includes(`${row.anio}-${String(row.periodo).padStart(2, "0")}`))
    .reduce((sum, row) => sum + toNumber(row.haber) - toNumber(row.debe), 0);

  const documentosCxc: AntiguedadDocumento[] = facturas
    .map((factura) => ({
      tercero: factura.cliente,
      fechaVencimiento: factura.fechaVencimiento,
      saldo: saldoDe(factura),
    }))
    .filter((documento) => documento.saldo > 0);
  const documentosCxp: AntiguedadDocumento[] = egresos
    .filter((row) => row.estatusPago === "Pendiente")
    .map((row) => ({
      tercero: row.nombreProveedor,
      fechaVencimiento: iso(row.fechaVencimiento),
      saldo: toNumber(row.montoSubtotal),
    }));

  const auxiliarPeriods = [
    ...new Set(fechas.map((fecha) => iso(fecha).slice(0, 7))),
  ];
  return {
    tenantId,
    hasData: true,
    asOf,
    model: ventas.length > 0 ? buildCobranza(facturas, asOf, ingresoTtm) : null,
    antiguedadCxc: ventas.length > 0 ? buildAntiguedad(documentosCxc, asOf) : null,
    antiguedadCxp: egresos.length > 0 ? buildAntiguedad(documentosCxp, asOf) : null,
    periodOrigins: resolvePeriodOrigins(auxiliarPeriods, committedPeriods),
  };
}
