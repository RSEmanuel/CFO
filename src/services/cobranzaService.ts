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
import { cccFromBalanza } from "@/services/capitalTrabajoCalcs";
import { plazosComercialesFromCcc } from "@/services/cobranzaPlazosComerciales";
import { resolveAccountRoles } from "@/services/ingresoMixService";
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

/**
 * Días de cobro con la definición única (B06): cccFromBalanza sobre la última
 * balanza hasta la fecha de corte, igual que el catálogo #31 y Cartera.
 */
async function dsoDeBalanza(tenantId: string, asOf: string): Promise<number | null> {
  const anio = Number(asOf.slice(0, 4));
  const mes = Number(asOf.slice(5, 7));
  const ultima = await prisma.balanzaPnL.findFirst({
    where: { tenantId, OR: [{ anio: { lt: anio } }, { anio, periodo: { lte: mes } }] },
    orderBy: [{ anio: "desc" }, { periodo: "desc" }],
    select: { anio: true, periodo: true },
  });
  if (!ultima) {
    return null;
  }
  const [balanzaMes, roles] = await Promise.all([
    prisma.balanzaPnL.findMany({ where: { tenantId, anio: ultima.anio, periodo: ultima.periodo } }),
    resolveAccountRoles(tenantId),
  ]);
  const plazos = plazosComercialesFromCcc(cccFromBalanza({ balanzaCierre: balanzaMes, balanzaMov: balanzaMes, roles }));
  return plazos.dso == null ? null : Math.round(plazos.dso);
}

export async function getCobranza(tenantId: string): Promise<CobranzaPayload> {
  const [ventas, egresos, committedPeriods] = await Promise.all([
    prisma.auxiliarVentas.findMany({
      where: { tenantId },
      orderBy: { fechaEmision: "asc" },
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
  const dso = ventas.length > 0 ? await dsoDeBalanza(tenantId, asOf) : null;

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
    model: ventas.length > 0 ? buildCobranza(facturas, asOf, dso) : null,
    antiguedadCxc: ventas.length > 0 ? buildAntiguedad(documentosCxc, asOf) : null,
    antiguedadCxp: egresos.length > 0 ? buildAntiguedad(documentosCxp, asOf) : null,
    periodOrigins: resolvePeriodOrigins(auxiliarPeriods, committedPeriods),
  };
}
