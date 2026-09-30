import type { AuxiliarEgresos, AuxiliarVentas, BalanzaPnL, TesoreriaFlujo } from "@/generated/prisma/client";
import type { AccountRoleRule, AccountRoles } from "@/services/ingest/types";
import type { MoneyLine } from "@/services/metricsTypes";
import { formatMxn, nearlyEqual, round2, toNumber } from "@/services/money";

const INVENTORY_PATTERN = /inventario|almacen|mercancia/;
const FINANCIAL_PATTERN = /interes|financiero/;
const TAX_OR_FINANCIAL_PATTERN = /isr|impuesto|iva|interes|financiero/;
const CURRENT_ASSET_NAMES = /banco|caja|cliente|cxc|deudor|anticipo|iva acreditable/;
const CURRENT_LIABILITY_NAMES = /proveedor|cxp|acreedor|iva por pagar|impuesto por pagar/;
const DEBT_PATTERN = /prestamo|credito|deuda|bancari/;
const CASH_PATTERN = /banco|caja/;
const DIVIDEND_PATTERN = /dividendo/;
const INCOME_TAX_PATTERN = /isr|impuesto sobre la renta/;

export function money(value: unknown): number {
  return toNumber(value as string | number);
}

export function line(amount: number): MoneyLine {
  const rounded = round2(amount);
  return { amount: rounded, amountFormatted: formatMxn(rounded) };
}

export function ratioPct(real: number, budget: number): number | null {
  if (Math.abs(budget) < 0.01) {
    return null;
  }
  return round2(((real - budget) / budget) * 100);
}

export function safeRatio(numerator: number, denominator: number): number | null {
  if (Math.abs(denominator) < 0.01) {
    return null;
  }
  return round2(numerator / denominator);
}

export function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function accountPrefix(idCuenta: string): number {
  const digits = idCuenta.replace(/\D/g, "").slice(0, 2);
  return Number(digits) || 0;
}

export function isInventoryAccount(idCuenta: string, nombreCuenta: string): boolean {
  return INVENTORY_PATTERN.test(normalizeText(`${idCuenta} ${nombreCuenta}`));
}

function matchesAccountRole(rule: AccountRoleRule, idCuenta: string, nombreCuenta: string): boolean {
  const digits = idCuenta.replace(/\D/g, "");
  if (rule.prefixes.some((prefix) => digits.startsWith(prefix.replace(/\D/g, "")))) {
    return true;
  }
  const name = normalizeText(nombreCuenta);
  return (rule.nameTokens ?? []).some((token) => name.includes(normalizeText(token)));
}

/**
 * Circulante por defecto (catálogo Compac/CONTPAQi): 11xx (disponible y
 * deudores) EXCEPTO 119x, que en este catálogo es activo fijo (automóviles).
 * 12xx+ = activo fijo, contra-activo (dep. acumulada), diferidos e intangibles
 * → NO circulante. Nota: 13xx/14xx no existen en el catálogo Compac; por
 * convención SAT son cargos diferidos/otros activos de largo plazo, así que el
 * default las trata como no circulantes.
 * Override por tenant vía accountRoles del perfil de ingesta: el rol
 * activoNoCirculante gana sobre activoCirculante (es lo más específico).
 */
export function isCurrentAsset(
  idCuenta: string,
  nombreCuenta: string,
  roles?: AccountRoles | null,
): boolean {
  if (roles?.activoNoCirculante && matchesAccountRole(roles.activoNoCirculante, idCuenta, nombreCuenta)) {
    return false;
  }
  if (roles?.activoCirculante && matchesAccountRole(roles.activoCirculante, idCuenta, nombreCuenta)) {
    return true;
  }
  const prefix = accountPrefix(idCuenta);
  if (prefix === 11) {
    return !idCuenta.replace(/\D/g, "").startsWith("119");
  }
  if (prefix >= 12) {
    return false;
  }
  return CURRENT_ASSET_NAMES.test(normalizeText(nombreCuenta)) || isInventoryAccount(idCuenta, nombreCuenta);
}

/**
 * CP por defecto: 21xx/22xx (proveedores, acreedores, impuestos y la agrupadora
 * 2106 de TDC + líneas de crédito + préstamos — no hay dato para separar CP/LP
 * dentro de 2106, así que todo queda CP). 23xx+ = LP (2306 anticipos de
 * clientes, 2359 impuestos diferidos). Override por tenant vía accountRoles.
 */
export function isCurrentLiability(
  idCuenta: string,
  nombreCuenta: string,
  roles?: AccountRoles | null,
): boolean {
  if (roles?.pasivoNoCirculante && matchesAccountRole(roles.pasivoNoCirculante, idCuenta, nombreCuenta)) {
    return false;
  }
  if (roles?.pasivoCirculante && matchesAccountRole(roles.pasivoCirculante, idCuenta, nombreCuenta)) {
    return true;
  }
  const prefix = accountPrefix(idCuenta);
  if (prefix === 21 || prefix === 22) {
    return true;
  }
  if (prefix >= 23) {
    return false;
  }
  return CURRENT_LIABILITY_NAMES.test(normalizeText(nombreCuenta));
}

export function isFinancialExpenseAccount(nombreCuenta: string): boolean {
  return FINANCIAL_PATTERN.test(normalizeText(nombreCuenta));
}

export function isCashAccount(idCuenta: string, nombreCuenta: string): boolean {
  return CASH_PATTERN.test(normalizeText(`${idCuenta} ${nombreCuenta}`));
}

export function isInterestBearingDebt(nombreCuenta: string): boolean {
  return DEBT_PATTERN.test(normalizeText(nombreCuenta));
}

export function isDividendAccount(nombreCuenta: string): boolean {
  return DIVIDEND_PATTERN.test(normalizeText(nombreCuenta));
}

export function isIncomeTaxAccount(nombreCuenta: string): boolean {
  const text = normalizeText(nombreCuenta);
  if (/iva/.test(text)) {
    return false;
  }
  return INCOME_TAX_PATTERN.test(text) || /impuesto/.test(text);
}

export function isTaxOrFinancialAccount(nombreCuenta: string): boolean {
  return TAX_OR_FINANCIAL_PATTERN.test(normalizeText(nombreCuenta));
}

export type PnlTotals = {
  ingresos: number;
  cogs: number;
  opex: number;
  da: number;
  ebit: number;
  ebitda: number;
  utilidadBruta: number;
  gastosFinancierosPnl: number;
  impuestosFinancierosPnl: number;
};

/** Movimiento de PyG: Ingresos = haber − debe; costos/gastos = debe − haber. */
export function pnlFromBalanza(rows: BalanzaPnL[]): PnlTotals {
  const ingresos = round2(
    rows
      .filter((fila) => fila.categoriaMaestra === "Ingreso")
      .reduce((acc, fila) => acc + (money(fila.haber) - money(fila.debe)), 0),
  );
  const cogs = round2(
    rows
      .filter((fila) => fila.categoriaMaestra === "COGS")
      .reduce((acc, fila) => acc + (money(fila.debe) - money(fila.haber)), 0),
  );
  const opex = round2(
    rows
      .filter((fila) => fila.categoriaMaestra === "OpEx")
      .reduce((acc, fila) => acc + (money(fila.debe) - money(fila.haber)), 0),
  );
  const da = round2(
    rows
      .filter((fila) => fila.depreciacionAmortizacion)
      .reduce((acc, fila) => acc + (money(fila.debe) - money(fila.haber)), 0),
  );
  const gastosFinancierosPnl = round2(
    rows
      .filter((fila) => fila.categoriaMaestra === "OpEx" && isFinancialExpenseAccount(fila.nombreCuenta))
      .reduce((acc, fila) => acc + (money(fila.debe) - money(fila.haber)), 0),
  );
  const impuestosFinancierosPnl = round2(
    rows
      .filter((fila) => isTaxOrFinancialAccount(fila.nombreCuenta) && !fila.depreciacionAmortizacion)
      .filter((fila) => fila.categoriaMaestra === "OpEx" || fila.categoriaMaestra === "COGS")
      .reduce((acc, fila) => acc + (money(fila.debe) - money(fila.haber)), 0),
  );

  return {
    ingresos,
    cogs,
    opex,
    da,
    ebit: round2(ingresos - cogs - opex),
    ebitda: round2(ingresos - cogs - opex + da),
    utilidadBruta: round2(ingresos - cogs),
    gastosFinancierosPnl,
    impuestosFinancierosPnl,
  };
}

/**
 * Resultado del ejercicio YTD con signo contable de cuenta de capital
 * (utilidad = acreedor/negativo; pérdida = deudor/positivo, igual que una
 * 3105 de pérdidas). La balanza CONTPAQi cierra en cero por periodo, así que
 * el saldoFinal acumulado de las cuentas de PyG ES el resultado YTD. Es la
 * misma línea calculada del árbol B3 (`buildPosicionTree`): fuente única.
 */
export function resultadoEjercicioYtd(rows: BalanzaPnL[]): number {
  return round2(
    rows
      .filter(
        (fila) =>
          fila.categoriaMaestra === "Ingreso" ||
          fila.categoriaMaestra === "COGS" ||
          fila.categoriaMaestra === "OpEx",
      )
      .reduce((acc, fila) => acc + money(fila.saldoFinal), 0),
  );
}

/**
 * Convención de almacenamiento de la balanza, detectada con la identidad
 * contable del cierre: devuelve -1 cuando la balanza cuadra con acreedores en
 * negativo (CONTPAQi: A = −(P + C)) y +1 cuando cuadra con magnitudes
 * (A = P + C) o no hay datos para distinguir (fallback neutro).
 */
export function balanceSignConvention(rows: BalanzaPnL[]): 1 | -1 {
  const sum = (categoria: BalanzaPnL["categoriaMaestra"]) =>
    rows.filter((fila) => fila.categoriaMaestra === categoria).reduce((acc, fila) => acc + money(fila.saldoFinal), 0);
  const activo = sum("Activo");
  const pasivo = sum("Pasivo");
  const capitalConResultado = sum("Patrimonio") + resultadoEjercicioYtd(rows);
  return nearlyEqual(activo, -(pasivo + capitalConResultado)) ? -1 : 1;
}

/**
 * Capital contable NIF con signo ECONÓMICO (positivo = capital; negativo =
 * déficit patrimonial): cuentas 3xxx + resultado del ejercicio YTD, con el
 * signo corregido según la convención de almacenamiento detectada. Es el
 * denominador canónico del ROE (#11) y del endeudamiento |P|/C.
 */
export function capitalContableNif(rows: BalanzaPnL[]): number {
  const capitalRaw = round2(
    rows
      .filter((fila) => fila.categoriaMaestra === "Patrimonio")
      .reduce((acc, fila) => acc + money(fila.saldoFinal), 0),
  );
  return round2((capitalRaw + resultadoEjercicioYtd(rows)) * balanceSignConvention(rows));
}

export type BalanceStructure = {
  activoCirculante: number;
  pasivoCirculante: number;
  inventarios: number;
  pasivoTotal: number;
  /** Suma cruda 3xxx con signo de almacenamiento (acreedor negativo en Compac). */
  patrimonioNeto: number;
  /** Capital contable NIF con signo económico: 3xxx + resultado YTD; ≤ 0 = déficit. */
  patrimonioNif: number;
};

/** Estructura de balance: usa saldos finales (punto en el tiempo). */
export function structureFromBalanza(rows: BalanzaPnL[], roles?: AccountRoles | null): BalanceStructure {
  const activoCirculante = round2(
    rows
      .filter(
        (fila) => fila.categoriaMaestra === "Activo" && isCurrentAsset(fila.idCuenta, fila.nombreCuenta, roles),
      )
      .reduce((acc, fila) => acc + money(fila.saldoFinal), 0),
  );
  const pasivoCirculante = round2(
    rows
      .filter(
        (fila) =>
          fila.categoriaMaestra === "Pasivo" && isCurrentLiability(fila.idCuenta, fila.nombreCuenta, roles),
      )
      .reduce((acc, fila) => acc + money(fila.saldoFinal), 0),
  );
  const inventarios = round2(
    rows
      .filter(
        (fila) =>
          fila.categoriaMaestra === "Activo" && isInventoryAccount(fila.idCuenta, fila.nombreCuenta),
      )
      .reduce((acc, fila) => acc + money(fila.saldoFinal), 0),
  );
  const pasivoTotal = round2(
    rows.filter((fila) => fila.categoriaMaestra === "Pasivo").reduce((acc, fila) => acc + money(fila.saldoFinal), 0),
  );
  const patrimonioNeto = round2(
    rows
      .filter((fila) => fila.categoriaMaestra === "Patrimonio")
      .reduce((acc, fila) => acc + money(fila.saldoFinal), 0),
  );

  return { activoCirculante, pasivoCirculante, inventarios, pasivoTotal, patrimonioNeto, patrimonioNif: capitalContableNif(rows) };
}

export type TreasuryTotals = {
  saldoInicial: number;
  entradasOperativas: number;
  salidasOperativas: number;
  salidasCapex: number;
  servicioDeuda: number;
  saldoFinal: number;
  freeCashFlow: number;
};

export function treasuryFromRows(rows: TesoreriaFlujo[]): TreasuryTotals {
  const entradasOperativas = round2(rows.reduce((acc, fila) => acc + money(fila.entradasOperativas), 0));
  const salidasOperativas = round2(rows.reduce((acc, fila) => acc + money(fila.salidasOperativas), 0));
  const salidasCapex = round2(rows.reduce((acc, fila) => acc + money(fila.salidasCapex), 0));
  const servicioDeuda = round2(rows.reduce((acc, fila) => acc + money(fila.servicioDeuda), 0));
  const saldoInicial = round2(rows.reduce((acc, fila) => acc + money(fila.saldoInicialPeriodo), 0));
  const saldoFinal = round2(rows.reduce((acc, fila) => acc + money(fila.saldoFinalPeriodo), 0));
  return {
    saldoInicial,
    entradasOperativas,
    salidasOperativas,
    salidasCapex,
    servicioDeuda,
    saldoFinal,
    freeCashFlow: round2(entradasOperativas - salidasOperativas - salidasCapex),
  };
}

export function groupTreasuryByPeriod(rows: TesoreriaFlujo[]): Map<number, TreasuryTotals> {
  const byPeriod = new Map<number, TesoreriaFlujo[]>();
  for (const fila of rows) {
    const list = byPeriod.get(fila.periodo) ?? [];
    list.push(fila);
    byPeriod.set(fila.periodo, list);
  }
  const result = new Map<number, TreasuryTotals>();
  for (const [periodo, list] of byPeriod) {
    result.set(periodo, treasuryFromRows(list));
  }
  return result;
}

export function averageMonthlyTreasury(byPeriod: Map<number, TreasuryTotals>): TreasuryTotals {
  const months = [...byPeriod.values()];
  const n = months.length || 1;
  const sum = months.reduce(
    (acc, mes) => ({
      saldoInicial: acc.saldoInicial + mes.saldoInicial,
      entradasOperativas: acc.entradasOperativas + mes.entradasOperativas,
      salidasOperativas: acc.salidasOperativas + mes.salidasOperativas,
      salidasCapex: acc.salidasCapex + mes.salidasCapex,
      servicioDeuda: acc.servicioDeuda + mes.servicioDeuda,
      saldoFinal: acc.saldoFinal + mes.saldoFinal,
      freeCashFlow: acc.freeCashFlow + mes.freeCashFlow,
    }),
    {
      saldoInicial: 0,
      entradasOperativas: 0,
      salidasOperativas: 0,
      salidasCapex: 0,
      servicioDeuda: 0,
      saldoFinal: 0,
      freeCashFlow: 0,
    },
  );
  return {
    saldoInicial: round2(sum.saldoInicial / n),
    entradasOperativas: round2(sum.entradasOperativas / n),
    salidasOperativas: round2(sum.salidasOperativas / n),
    salidasCapex: round2(sum.salidasCapex / n),
    servicioDeuda: round2(sum.servicioDeuda / n),
    saldoFinal: round2(sum.saldoFinal / n),
    freeCashFlow: round2(sum.freeCashFlow / n),
  };
}

export function cashRunwayDays(saldoFinal: number, salidasOperativas: number): number | null {
  return salidasOperativas > 0.01 ? round2((saldoFinal / salidasOperativas) * 30) : null;
}

export function netReceivable(fila: AuxiliarVentas): number {
  return round2(money(fila.montoSubtotal) + money(fila.iva) - money(fila.montoCobrado));
}

export function daysPastDue(fechaVencimiento: Date, asOf: Date): number {
  const due = new Date(fechaVencimiento);
  due.setHours(0, 0, 0, 0);
  const close = new Date(asOf);
  close.setHours(0, 0, 0, 0);
  return Math.floor((close.getTime() - due.getTime()) / 86_400_000);
}

export function inCalendarPeriod(fecha: Date, anio: number, periodo: number): boolean {
  return fecha.getFullYear() === anio && fecha.getMonth() + 1 === periodo;
}

export function inYtd(fecha: Date, anio: number, periodo: number): boolean {
  if (fecha.getFullYear() !== anio) {
    return false;
  }
  return fecha.getMonth() + 1 <= periodo;
}

export function activeSales(rows: AuxiliarVentas[]): AuxiliarVentas[] {
  return rows.filter((fila) => fila.estatusPago !== "Cancelado");
}

export function activeExpenses(rows: AuxiliarEgresos[]): AuxiliarEgresos[] {
  return rows.filter((fila) => fila.estatusPago !== "Cancelado");
}

export const DASHBOARD_ASSUMPTIONS: string[] = [
  "El activo y pasivo circulante se infieren por prefijo de cuenta (11xx circulante excepto 119x; 12xx+ no circulante; 21–22 CP, 23+ LP) y nombre, porque el catálogo no marca circulante; el tenant puede sobreescribirlo con su perfil de ingesta.",
  "DSO/DPO/CCC se calculan desde la balanza (promedio de saldos del rubro sobre ventas/COGS anualizados ×365); los auxiliares solo alimentan el aging de CxC y el top de proveedores. Sin rubro de inventario, DIO = 0 y CCC = DSO − DPO.",
  "Si no hay cuentas de interés en PyG, la cobertura de intereses usa el servicio de deuda de tesorería.",
  "Impuestos/financiero de la cascada usa cuentas de ISR/impuesto/IVA o, en su defecto, el servicio de deuda.",
  "El COGS por línea de negocio se prorratea según el mix de facturación neta (no hay costo por producto).",
  "El presupuesto por centro de costos se prorratea del budget de OpEx de la balanza según el mix de gasto real.",
];
