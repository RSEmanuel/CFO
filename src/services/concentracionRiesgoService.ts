import { prisma } from "@/lib/prisma";
import { clasificaCuentaCartera } from "@/services/cobranzaCarteraService";
import {
  buildConcentracion,
  type ConcentracionCuentaInput,
  type ConcentracionModel,
} from "@/services/concentracionRiesgo";
import { toNumber } from "@/services/money";

export type ConcentracionTipo = "clientes" | "proveedores";

export type ConcentracionRiesgoPayload = {
  tenantId: string;
  anio: number;
  periodo: number;
  moneda: string;
  monedasDisponibles: string[];
  tipo: ConcentracionTipo;
  /** Días naturales del periodo (base del plazo medio DSO/DPO individual). */
  diasPeriodo: number;
  hasData: boolean;
  model: ConcentracionModel;
};

const EMPTY_MODEL: ConcentracionModel = {
  total: 0,
  cuentas: 0,
  hhi: null,
  hhiNivel: null,
  paretoN: null,
  top3Share: null,
  rows: [],
};

function diasDelPeriodo(anio: number, periodo: number): number {
  return new Date(Date.UTC(anio, periodo, 0)).getUTCDate();
}

/**
 * Concentración & Riesgo desde el auxiliar de cuentas CONTPAQi
 * (`AuxiliarCuentaResumen`, misma fuente que la cartera CxC/CxP).
 *
 * Multi-moneda: UNA moneda por petición (query `moneda`, default MXN); el
 * HHI/Pareto se calculan por moneda por separado porque mezclar divisas
 * distorsiona las participaciones. `monedasDisponibles` alimenta el toggle.
 *
 * Universo: cuentas del lado pedido (`tipo`) con actividad en el periodo
 * (clientes: cargos = facturado; proveedores: abonos = comprado) o, en su
 * defecto, con saldo pendiente > 0 (fallback documentado en
 * `concentracionRiesgo.ts`).
 *
 * Sin anio/periodo válidos se cae al último periodo con auxiliar persistido.
 */
export async function getConcentracionRiesgo(
  tenantId: string,
  anio?: number | null,
  periodo?: number | null,
  moneda = "MXN",
  tipo: ConcentracionTipo = "clientes",
): Promise<ConcentracionRiesgoPayload> {
  const monedasRows = await prisma.auxiliarCuentaResumen.findMany({
    where: { tenantId },
    distinct: ["moneda"],
    select: { moneda: true },
    orderBy: { moneda: "asc" },
  });
  const monedasDisponibles = monedasRows.map((row) => row.moneda);

  let target = anio && periodo && periodo >= 1 && periodo <= 12 ? { anio, periodo } : null;
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
      tipo,
      diasPeriodo: 0,
      hasData: false,
      model: { ...EMPTY_MODEL },
    };
  }

  const resumen = await prisma.auxiliarCuentaResumen.findMany({
    where: { tenantId, anio: target.anio, periodo: target.periodo, moneda },
    orderBy: { idCuenta: "asc" },
  });

  const esperado = tipo === "clientes" ? "CLIENTE" : "PROVEEDOR";
  const inputs: ConcentracionCuentaInput[] = [];
  for (const row of resumen) {
    if (clasificaCuentaCartera(row.idCuenta) !== esperado) continue;
    const cargos = toNumber(row.cargos);
    const abonos = toNumber(row.abonos);
    inputs.push({
      accountId: row.idCuenta,
      entityName: row.nombreCuenta,
      // Clientes: cargos = facturado en el mes. Proveedores: abonos = comprado.
      montoPeriodo: tipo === "clientes" ? cargos : abonos,
      saldoInicial: toNumber(row.saldoInicial),
      saldoFinal: toNumber(row.saldoFinal),
    });
  }

  const diasPeriodo = diasDelPeriodo(target.anio, target.periodo);
  const model = buildConcentracion(inputs, diasPeriodo);

  return {
    tenantId,
    anio: target.anio,
    periodo: target.periodo,
    moneda,
    monedasDisponibles,
    tipo,
    diasPeriodo,
    hasData: model.cuentas > 0,
    model,
  };
}
