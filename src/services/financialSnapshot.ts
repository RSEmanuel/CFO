import type { BalanzaPnL, TesoreriaFlujo } from "@/generated/prisma/client";
import {
  cccFromBalanza,
  deudaFinancieraFromBalanza,
  deudaFinancieraPorNombre,
  netWorkingCapital,
} from "@/services/capitalTrabajoCalcs";
import { computeErBuckets } from "@/services/estadoOperativo";
import type { AccountRoles } from "@/services/ingest/types";
import { cajaYRespiro } from "@/services/caja";
import {
  isDividendAccount,
  isInventoryAccount,
  money,
  structureFromBalanza,
  treasuryFromRows,
} from "@/services/metricsLedger";
import { round2 } from "@/services/money";

export const DEFAULT_TAX_RATE = 0.3;
export const RISK_FREE_RATE = 0.08;
export const EQUITY_RISK_PREMIUM = 0.06;
export const BETA = 1;

export type PeriodSnapshot = {
  anio: number;
  periodo: number;
  ingresos: number;
  cogs: number;
  opex: number;
  da: number;
  sga: number;
  ebit: number;
  ebitda: number;
  utilidadBruta: number;
  gastosFinancieros: number;
  impuestos: number;
  ebt: number;
  utilidadNeta: number;
  taxRate: number;
  nopat: number;
  ocf: number;
  fcf: number;
  capex: number;
  /** Tu caja (B06): saldo de caja y bancos de la balanza. Igual a cajaBancos. */
  saldoCaja: number;
  /** Salidas operativas del reporte de tesorería (detalle de movimientos). */
  salidasOperativas: number;
  /** Gasto mensual de operación (PyG oficial, promedio de hasta 3 meses). */
  gastoMensual: number | null;
  /** Meses de respiro (#28): tu caja ÷ gasto mensual. */
  mesesDeRespiro: number | null;
  activoTotal: number;
  activoCirculante: number;
  pasivoCirculante: number;
  pasivoTotal: number;
  patrimonio: number;
  inventarios: number;
  inventarioPromedio: number;
  cajaBancos: number;
  cxc: number;
  cxp: number;
  deudaBruta: number;
  deudaNeta: number;
  capitalInvertido: number;
  nwc: number;
  dividendos: number;
  dso: number;
  dio: number;
  dpo: number;
  ccc: number;
  ke: number;
  kd: number;
  wacc: number;
  /**
   * Qué fuentes respaldan las cifras. Sin tesorería, OCF/FCF/CapEx valen 0 y
   * sin inventario DIO vale 0: el catálogo los muestra N/D, nunca como dato.
   * Opcional para snapshots armados a mano (se asume todo disponible).
   */
  disponibilidad?: SnapshotDisponibilidad;
};

export type SnapshotDisponibilidad = {
  tesoreria: boolean;
  /** La balanza trae cuentas de caja y bancos. */
  caja?: boolean;
  inventario: boolean;
  dso: boolean;
  dpo: boolean;
};

export const CATALOG_ASSUMPTIONS: string[] = [
  "Ventas, costos, OpEx, EBIT, EBITDA, RIF, impuestos (PTU+ISR) y utilidad neta son CANÓNICOS del ER Operativo (computeErBuckets, prefijos 4xxx–8xxx): las ventas excluyen productos financieros (van al RIF) y los gastos financieros 8101 se descuentan una sola vez, vía RIF.",
  "Si no hay PTU/ISR (6405/6406) en PyG, la tasa para NOPAT es 30% (ISR corporativo México).",
  "Los gastos financieros se toman del 8101 (ER); si no hay, se usa el servicio de deuda de tesorería.",
  "La deuda financiera sale del rol deudaFinanciera del perfil de ingesta (default Compac: 2106 + 2306 + 2359, pasivos con costo CP/LP) en valor absoluto, porque la balanza persiste pasivos con signo negativo; sin rol configurado se infiere por nombre (préstamo, crédito, deuda), también en valor absoluto.",
  "DSO/DPO/CCC se calculan desde la balanza: promedio (saldo inicial + final)/2 del rubro sobre ventas o COGS anualizados (×12 en vista mensual; ×12/meses en YTD), ×365 días. Sin rubro de inventario, DIO queda N/D y CCC = DSO − DPO.",
  "Tu caja es el saldo final de las cuentas de caja y bancos de la balanza (rol bancos + caja, por prefijo; por nombre solo si el catálogo no trae esos prefijos). Meses de respiro (#28) = tu caja ÷ gasto mensual de operación del PyG oficial (costo + gastos sin depreciación + gastos financieros + ISR y PTU), promedio de hasta 3 meses del año.",
  "Sin tesorería cargada, las métricas de flujo (#6, #7, #15, #22, #29) quedan N/D en lugar de 0.",
  "El NWC (#21) es activo circulante − |pasivo circulante|: la balanza persiste pasivos con signo negativo y restar el valor absoluto evita que el capital de trabajo sume en vez de restar. Las razones de liquidez (#25–#27) usan |pasivo circulante| en el denominador (misma convención de magnitud).",
  "El patrimonio del snapshot es el capital contable NIF con signo económico: cuentas 3xxx + resultado del ejercicio YTD (misma fuente que el árbol B3). Con déficit (capital ≤ 0), los ratios sobre capital (#9 ROIC, #10 ROCE, #11 ROE, #15 Cash ROIC, #20 IC turnover, #36 apalancamiento, #48/#49) quedan N/D: no son significativos.",
  "El ROCE (#10) usa capital empleado = activo total − |pasivo circulante| y la razón de pasivos (#37) es |pasivo total| / activo total: misma convención de magnitud sobre pasivos persistidos en negativo.",
  "WACC y Ke usan Rf=8%, ERP=6% y beta=1 (no hay curva de mercado en el ledger); con capital contable ≤ 0 la ponderación patrimonio/deuda no es significativa y el WACC (#46) queda N/D, igual que los ratios sobre capital.",
  "Sin cuenta de dividendos, el payout queda N/D.",
];

function sumSaldo(
  rows: BalanzaPnL[],
  match: (fila: BalanzaPnL) => boolean,
  field: "saldoFinal" | "saldoInicial",
): number {
  return round2(rows.filter(match).reduce((acc, fila) => acc + money(fila[field]), 0));
}

export function buildPeriodSnapshot(input: {
  anio: number;
  periodo: number;
  balanza: BalanzaPnL[];
  tesoreria: TesoreriaFlujo[];
  accountRoles?: AccountRoles | null;
  /** Meses del año hasta el periodo, para el ritmo de gasto de meses de respiro. */
  balanzaHistorial?: BalanzaPnL[];
}): PeriodSnapshot {
  // PyG canónico del ER Operativo: una sola aritmética (ventas netas sin
  // productos financieros, 8101 descontado una sola vez vía RIF, impuestos =
  // PTU 6405 + ISR 6406). Prohibido recomputar aquí con otra clasificación.
  const er = computeErBuckets(
    input.balanza.map((fila) => ({
      idCuenta: fila.idCuenta,
      nombreCuenta: fila.nombreCuenta,
      debe: money(fila.debe),
      haber: money(fila.haber),
    })),
  );
  const structure = structureFromBalanza(input.balanza, input.accountRoles);
  const treasury = treasuryFromRows(input.tesoreria);

  const gastosFinancieros = er.gastosFinancieros > 0.01 ? er.gastosFinancieros : treasury.servicioDeuda;
  const impuestos = round2(er.ptu + er.isr);
  const ebt = er.ebt;
  const utilidadNeta = er.utilidadNeta;
  const taxRate = ebt > 0.01 && impuestos > 0.01 ? round2(impuestos / ebt) : DEFAULT_TAX_RATE;
  const nopat = round2(er.ebit * (1 - taxRate));
  const ocfFromOps = round2(treasury.entradasOperativas - treasury.salidasOperativas);
  const ocf =
    Math.abs(ocfFromOps) > 0.01 ? ocfFromOps : round2(treasury.freeCashFlow + treasury.salidasCapex);
  const sga = round2(Math.max(er.totalOpex - er.da, 0));

  const activoTotal = sumSaldo(input.balanza, (fila) => fila.categoriaMaestra === "Activo", "saldoFinal");
  const respiro = cajaYRespiro({
    periodo: input.periodo,
    balanzaCierre: input.balanza,
    balanzaHistorial: input.balanzaHistorial,
    roles: input.accountRoles,
  });
  const cajaBancos = respiro.caja;
  // Deuda financiera: rol deudaFinanciera del perfil (2106 + 2306 + 2359 en
  // Compac), en valor absoluto. Fallback legado por nombre, también en
  // magnitud (misma convención: los pasivos se persisten en negativo).
  const deudaPorRol = deudaFinancieraFromBalanza(input.balanza, input.accountRoles);
  const deudaBruta = deudaPorRol ?? deudaFinancieraPorNombre(input.balanza);
  const deudaNeta = round2(deudaBruta - cajaBancos);
  // Capital invertido sobre capital NIF: con déficit puede quedar ≤ 0 y los
  // ratios sobre capital quedan N/D en el motor del catálogo.
  const capitalInvertido = round2(structure.patrimonioNif + Math.max(deudaNeta, 0));
  const inventarioInicial = sumSaldo(
    input.balanza,
    (fila) => fila.categoriaMaestra === "Activo" && isInventoryAccount(fila.idCuenta, fila.nombreCuenta),
    "saldoInicial",
  );
  const inventarioPromedio = round2((inventarioInicial + structure.inventarios) / 2);
  const dividendos = round2(
    input.balanza
      .filter((fila) => isDividendAccount(fila.nombreCuenta))
      .reduce((acc, fila) => acc + (money(fila.debe) - money(fila.haber)), 0),
  );

  // CCC desde balanza (vista mensual: el snapshot opera sobre el periodo de
  // cierre, así que ventas/COGS se anualizan ×12). Mismo helper que el módulo
  // de capital de trabajo → catálogo #30-#33 idéntico al módulo.
  const ccc = cccFromBalanza({
    balanzaCierre: input.balanza,
    balanzaMov: input.balanza,
    roles: input.accountRoles,
  });
  const cxc = ccc.cxcPromedio;
  const cxp = ccc.cxpPromedio;

  const ke = round2(RISK_FREE_RATE + BETA * EQUITY_RISK_PREMIUM);
  const kd = deudaBruta > 0.01 ? round2(gastosFinancieros / deudaBruta) : 0;
  const equity = Math.max(structure.patrimonioNif, 0);
  const debtForWacc = Math.max(deudaBruta, 0);
  const firm = equity + debtForWacc;
  const wacc =
    firm > 0.01
      ? round2(ke * (equity / firm) + kd * (1 - taxRate) * (debtForWacc / firm))
      : ke;

  return {
    anio: input.anio,
    periodo: input.periodo,
    ingresos: er.ventas,
    cogs: er.costo,
    opex: er.totalOpex,
    da: er.da,
    sga,
    ebit: er.ebit,
    ebitda: er.ebitda,
    utilidadBruta: er.utilidadBruta,
    gastosFinancieros,
    impuestos,
    ebt,
    utilidadNeta,
    taxRate,
    nopat,
    ocf,
    fcf: treasury.freeCashFlow,
    capex: treasury.salidasCapex,
    saldoCaja: cajaBancos,
    salidasOperativas: treasury.salidasOperativas,
    gastoMensual: respiro.gastoMensual,
    mesesDeRespiro: respiro.mesesDeRespiro,
    activoTotal,
    activoCirculante: structure.activoCirculante,
    pasivoCirculante: structure.pasivoCirculante,
    pasivoTotal: structure.pasivoTotal,
    // Capital contable NIF con signo económico (3xxx + resultado YTD); con
    // déficit es negativo y los ratios sobre capital quedan N/D.
    patrimonio: structure.patrimonioNif,
    inventarios: structure.inventarios,
    inventarioPromedio: inventarioPromedio > 0.01 ? inventarioPromedio : structure.inventarios,
    cajaBancos,
    cxc,
    cxp,
    deudaBruta,
    deudaNeta,
    capitalInvertido,
    nwc: netWorkingCapital(structure.activoCirculante, structure.pasivoCirculante),
    dividendos,
    dso: ccc.dso,
    dio: ccc.dio,
    dpo: ccc.dpo,
    ccc: ccc.days,
    ke,
    kd,
    wacc,
    disponibilidad: {
      tesoreria: input.tesoreria.length > 0,
      caja: respiro.cuentas > 0,
      inventario: ccc.disponible.dio,
      dso: ccc.disponible.dso,
      dpo: ccc.disponible.dpo,
    },
  };
}
