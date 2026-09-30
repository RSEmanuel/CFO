import { prisma } from "@/lib/prisma";
import { cccFromBalanza } from "@/services/capitalTrabajoCalcs";
import {
  EMPTY_PLAZOS_COMERCIALES,
  plazosComercialesFromCcc,
  type PlazosComerciales,
} from "@/services/cobranzaPlazosComerciales";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import { resolveAccountRoles } from "@/services/ingresoMixService";
import { round2, toNumber } from "@/services/money";

export type CarteraTipo = "CLIENTE" | "PROVEEDOR";

export type CarteraItemPayload = {
  accountId: string;
  accountNumber: string;
  entityName: string;
  type: CarteraTipo;
  saldoInicial: number;
  /** Clientes: facturado en el mes. Proveedores: comprado a crédito en el mes. */
  facturadoOCompradoEnMes: number;
  /** Clientes: cobrado en el mes. Proveedores: pagado en el mes. */
  pagadoEnMes: number;
  saldoPendiente: number;
  movimientosCount: number;
};

export type CarteraClientesPayload = {
  totalPendiente: number;
  cobradoEnMes: number;
  facturadoEnMes: number;
  items: CarteraItemPayload[];
};

export type CarteraProveedoresPayload = {
  totalPendiente: number;
  pagadoEnMes: number;
  compradoEnMes: number;
  items: CarteraItemPayload[];
};

export type CobranzaCarteraPayload = {
  tenantId: string;
  anio: number;
  periodo: number;
  moneda: string;
  monedasDisponibles: string[];
  hasData: boolean;
  clientes: CarteraClientesPayload;
  proveedores: CarteraProveedoresPayload;
  /**
   * DSO/DPO/brecha canónicos de la balanza (cccFromBalanza, vista mensual).
   * Independientes de la moneda del auxiliar: el ledger es MXN. Siempre se
   * exponen (también en el subtab de proveedores) porque la historia es la
   * brecha comercial, no un lado aislado.
   */
  plazos: PlazosComerciales;
};

const CLIENTE_SEGMENTS = new Set(COMPAC_ACCOUNT_ROLES.clientes?.prefixes ?? ["1105", "105"]);
const PROVEEDOR_SEGMENTS = new Set(COMPAC_ACCOUNT_ROLES.proveedores?.prefixes ?? ["2101", "201"]);

/** Match estricto del primer segmento: 105/1105 → CLIENTE, 201/2101 → PROVEEDOR. */
export function clasificaCuentaCartera(idCuenta: string): CarteraTipo | null {
  const segment = idCuenta.split("-")[0] ?? idCuenta;
  if (CLIENTE_SEGMENTS.has(segment)) return "CLIENTE";
  if (PROVEEDOR_SEGMENTS.has(segment)) return "PROVEEDOR";
  return null;
}

const EMPTY_CLIENTES: CarteraClientesPayload = {
  totalPendiente: 0,
  cobradoEnMes: 0,
  facturadoEnMes: 0,
  items: [],
};
const EMPTY_PROVEEDORES: CarteraProveedoresPayload = {
  totalPendiente: 0,
  pagadoEnMes: 0,
  compradoEnMes: 0,
  items: [],
};

/**
 * Cartera CxC/CxP desde el auxiliar de cuentas CONTPAQi (reportes 06/07).
 *
 * Multi-moneda: se sirve UNA moneda por petición (query `moneda`, default MXN,
 * igual que flujo-operativo) y nunca se suman importes entre monedas;
 * `monedasDisponibles` permite a la UI ofrecer el toggle MXN/USD.
 *
 * Sin anio/periodo válidos se cae al último periodo con auxiliar persistido.
 */
export async function getCobranzaCartera(
  tenantId: string,
  anio?: number | null,
  periodo?: number | null,
  moneda = "MXN",
): Promise<CobranzaCarteraPayload> {
  const monedasRows = await prisma.auxiliarCuentaResumen.findMany({
    where: { tenantId },
    distinct: ["moneda"],
    select: { moneda: true },
    orderBy: { moneda: "asc" },
  });
  const monedasDisponibles = monedasRows.map((row) => row.moneda);

  let target =
    anio && periodo && periodo >= 1 && periodo <= 12 ? { anio, periodo } : null;
  if (!target) {
    target = await prisma.auxiliarCuentaResumen.findFirst({
      where: { tenantId, moneda },
      orderBy: [{ anio: "desc" }, { periodo: "desc" }],
      select: { anio: true, periodo: true },
    });
  }
  if (!target) {
    return {
      tenantId,
      anio: anio ?? 0,
      periodo: periodo ?? 0,
      moneda,
      monedasDisponibles,
      hasData: false,
      clientes: { ...EMPTY_CLIENTES },
      proveedores: { ...EMPTY_PROVEEDORES },
      plazos: { ...EMPTY_PLAZOS_COMERCIALES },
    };
  }

  const [resumen, movimientosPorCuenta, balanzaMes, accountRoles] = await Promise.all([
    prisma.auxiliarCuentaResumen.findMany({
      where: { tenantId, anio: target.anio, periodo: target.periodo, moneda },
      orderBy: { idCuenta: "asc" },
    }),
    prisma.auxiliarMovimiento.groupBy({
      by: ["idCuenta"],
      where: { tenantId, anio: target.anio, periodo: target.periodo, moneda },
      _count: { _all: true },
    }),
    prisma.balanzaPnL.findMany({
      where: { tenantId, anio: target.anio, periodo: target.periodo },
    }),
    resolveAccountRoles(tenantId),
  ]);
  const movimientosCount = new Map(
    movimientosPorCuenta.map((row) => [row.idCuenta, row._count._all]),
  );

  const items: CarteraItemPayload[] = [];
  for (const row of resumen) {
    const type = clasificaCuentaCartera(row.idCuenta);
    if (!type) continue;
    const cargos = toNumber(row.cargos);
    const abonos = toNumber(row.abonos);
    items.push({
      accountId: row.idCuenta,
      accountNumber: row.idCuenta,
      entityName: row.nombreCuenta,
      type,
      saldoInicial: toNumber(row.saldoInicial),
      // Clientes: cargos = facturado, abonos = cobrado. Proveedores: al revés.
      facturadoOCompradoEnMes: type === "CLIENTE" ? cargos : abonos,
      pagadoEnMes: type === "CLIENTE" ? abonos : cargos,
      saldoPendiente: toNumber(row.saldoFinal),
      movimientosCount: movimientosCount.get(row.idCuenta) ?? 0,
    });
  }
  items.sort((a, b) => b.saldoPendiente - a.saldoPendiente);

  const clientes = items.filter((item) => item.type === "CLIENTE");
  const proveedores = items.filter((item) => item.type === "PROVEEDOR");
  const sum = (rows: CarteraItemPayload[], pick: (item: CarteraItemPayload) => number) =>
    round2(rows.reduce((total, item) => total + pick(item), 0));

  const plazos =
    balanzaMes.length > 0
      ? plazosComercialesFromCcc(
          cccFromBalanza({
            balanzaCierre: balanzaMes,
            balanzaMov: balanzaMes,
            roles: accountRoles,
          }),
        )
      : { ...EMPTY_PLAZOS_COMERCIALES };

  return {
    tenantId,
    anio: target.anio,
    periodo: target.periodo,
    moneda,
    monedasDisponibles,
    hasData: items.length > 0,
    plazos,
    clientes: {
      totalPendiente: sum(clientes, (item) => item.saldoPendiente),
      cobradoEnMes: sum(clientes, (item) => item.pagadoEnMes),
      facturadoEnMes: sum(clientes, (item) => item.facturadoOCompradoEnMes),
      items: clientes,
    },
    proveedores: {
      totalPendiente: sum(proveedores, (item) => item.saldoPendiente),
      pagadoEnMes: sum(proveedores, (item) => item.pagadoEnMes),
      compradoEnMes: sum(proveedores, (item) => item.facturadoOCompradoEnMes),
      items: proveedores,
    },
  };
}
