import type { BalanzaPnL } from "@/generated/prisma/client";
import { DEFAULT_ACCOUNT_ROLES, findRoleLeaves } from "@/services/ingest/accountRoles";
import type { AccountRoles, AccountRoleRule } from "@/services/ingest/types";
import { isInterestBearingDebt, money } from "@/services/metricsLedger";
import { round2 } from "@/services/money";

/**
 * Capital de trabajo desde la balanza de comprobación (auditoría C1/C3).
 *
 * Fuente estable: la balanza. Los auxiliares aportan granularidad (aging de
 * CxC, top de proveedores) pero NO se mezclan criterios: DSO, DIO, DPO y CCC
 * salen siempre de la balanza para que el módulo de capital de trabajo, las
 * hero metrics y el catálogo (#30 CCC, #31 DSO, #32 DPO, #33 DIO) reporten
 * exactamente el mismo número.
 *
 * Convenciones:
 * - Saldos por rubro: promedio simple del periodo de cierre,
 *   (saldoInicial + saldoFinal) / 2, sumado sobre las cuentas hoja del rol.
 * - Signos: el tenant persiste pasivos acreedores con signo NEGATIVO, así que
 *   CxP y deuda financiera se reportan como valor absoluto de la suma neta del
 *   rubro. CxC e inventario son deudores (positivos); un rubro neto negativo
 *   se clampea a 0 para los ratios.
 * - Ventas = cuentas del rol ingresos (haber − debe, naturaleza acreedora);
 *   COGS = rol costos (debe − haber).
 * - Anualización: flujo del periodo × 12 / meses cubiertos. Vista mensual →
 *   ventas del mes × 12 (meses = 1); vista YTD → YTD × 12 / meses con datos.
 * - DIO: sin rubro de inventario (o saldo 0) → DIO = 0 legítimo y
 *   CCC = DSO − DPO.
 */

const DAYS_IN_YEAR = 365;
const MONTHS_IN_YEAR = 12;

type BalanceRoleKey = "clientes" | "proveedores" | "inventario" | "ingresos" | "costos" | "deudaFinanciera";

function ruleFor(roles: AccountRoles | null | undefined, key: BalanceRoleKey): AccountRoleRule | undefined {
  return roles?.[key] ?? DEFAULT_ACCOUNT_ROLES[key];
}

/** Suma neta del campo sobre las hojas del rol (cubre perfiles leafOnly y perfiles con padres). */
function sumRoleBalance(
  rows: BalanzaPnL[],
  rule: AccountRoleRule | undefined,
  field: "saldoInicial" | "saldoFinal",
): number {
  if (!rule) {
    return 0;
  }
  return findRoleLeaves(rows, rule).reduce((acc, fila) => acc + money(fila[field]), 0);
}

/** Flujo del periodo sobre las hojas del rol: credit = haber − debe; debit = debe − haber. */
function sumRoleFlow(rows: BalanzaPnL[], rule: AccountRoleRule | undefined, direction: "credit" | "debit"): number {
  if (!rule) {
    return 0;
  }
  return findRoleLeaves(rows, rule).reduce(
    (acc, fila) =>
      acc + (direction === "credit" ? money(fila.haber) - money(fila.debe) : money(fila.debe) - money(fila.haber)),
    0,
  );
}

function averageBalance(rows: BalanzaPnL[], rule: AccountRoleRule | undefined): number {
  return (sumRoleBalance(rows, rule, "saldoInicial") + sumRoleBalance(rows, rule, "saldoFinal")) / 2;
}

/**
 * Guarda de categoría: el rol se aplica solo dentro de su categoría maestra.
 * Sin ella, los nameTokens del rol ingresos ("ventas") matchean "COSTO DE
 * VENTAS" (5101) y contaminan el flujo; igualmente un pasivo con nombre de
 * cliente inflaría CxC.
 */
function inCategoria(rows: BalanzaPnL[], categoria: BalanzaPnL["categoriaMaestra"]): BalanzaPnL[] {
  return rows.filter((fila) => fila.categoriaMaestra === categoria);
}

/** Meses cubiertos por las filas de movimiento (para anualizar YTD). */
export function monthsCovered(rows: BalanzaPnL[]): number {
  return new Set(rows.map((fila) => `${fila.anio}-${fila.periodo}`)).size;
}

export type CccBalanza = {
  dso: number;
  dio: number;
  dpo: number;
  /** CCC = DSO + DIO − DPO. */
  days: number;
  /** Promedio (si+sf)/2 del rubro clientes, clampeado a ≥ 0. */
  cxcPromedio: number;
  /** Promedio (si+sf)/2 del rubro proveedores, valor absoluto (pasivos negativos). */
  cxpPromedio: number;
  /** Promedio (si+sf)/2 del rubro inventario, clampeado a ≥ 0. */
  inventarioPromedio: number;
  /** Ventas del movimiento (mes o YTD), haber − debe del rol ingresos. */
  ventas: number;
  /** COGS del movimiento (mes o YTD), debe − haber del rol costos. */
  cogs: number;
  ventasAnualizadas: number;
  cogsAnualizado: number;
  /** Meses que cubren ventas/COGS (1 = mensual, N = YTD). */
  meses: number;
};

export function cccFromBalanza(input: {
  /** Filas del periodo de cierre: saldos si/sf para los promedios. */
  balanzaCierre: BalanzaPnL[];
  /** Filas cuyo debe/haber representan el flujo (mes = 1 periodo; YTD = N). */
  balanzaMov: BalanzaPnL[];
  /** Override de meses cubiertos; default = periodos distintos en balanzaMov. */
  mesesMov?: number;
  roles?: AccountRoles | null;
}): CccBalanza {
  const roles = input.roles ?? null;
  const meses = Math.max(1, input.mesesMov ?? monthsCovered(input.balanzaMov));

  const activoCierre = inCategoria(input.balanzaCierre, "Activo");
  const pasivoCierre = inCategoria(input.balanzaCierre, "Pasivo");
  const ingresoMov = inCategoria(input.balanzaMov, "Ingreso");
  const cogsMov = inCategoria(input.balanzaMov, "COGS");

  const cxcPromedio = round2(Math.max(averageBalance(activoCierre, ruleFor(roles, "clientes")), 0));
  const cxpPromedio = round2(Math.abs(averageBalance(pasivoCierre, ruleFor(roles, "proveedores"))));
  const inventarioPromedio = round2(Math.max(averageBalance(activoCierre, ruleFor(roles, "inventario")), 0));

  const ventas = round2(sumRoleFlow(ingresoMov, ruleFor(roles, "ingresos"), "credit"));
  const cogs = round2(sumRoleFlow(cogsMov, ruleFor(roles, "costos"), "debit"));
  const factor = MONTHS_IN_YEAR / meses;
  const ventasAnualizadas = round2(ventas * factor);
  const cogsAnualizado = round2(cogs * factor);

  const dso = ventasAnualizadas > 0.01 && cxcPromedio > 0.01 ? round2((cxcPromedio / ventasAnualizadas) * DAYS_IN_YEAR) : 0;
  const dpo = cogsAnualizado > 0.01 && cxpPromedio > 0.01 ? round2((cxpPromedio / cogsAnualizado) * DAYS_IN_YEAR) : 0;
  const dio =
    cogsAnualizado > 0.01 && inventarioPromedio > 0.01 ? round2((inventarioPromedio / cogsAnualizado) * DAYS_IN_YEAR) : 0;

  return {
    dso,
    dio,
    dpo,
    days: round2(dso + dio - dpo),
    cxcPromedio,
    cxpPromedio,
    inventarioPromedio,
    ventas,
    cogs,
    ventasAnualizadas,
    cogsAnualizado,
    meses,
  };
}

/**
 * NWC = activo circulante − |pasivo circulante|.
 *
 * `structureFromBalanza` suma pasivos con signo crudo (negativo en Compac).
 * Restar el valor absoluto hace imposible que el NWC sume en vez de restar,
 * tanto si el tenant persiste pasivos en haber (negativo) como en positivo.
 * No se muta la estructura del ledger: las razones AC/PC aplican el abs
 * solo en el denominador (#25–#27 / salud financiera).
 */
export function netWorkingCapital(activoCirculante: number, pasivoCirculante: number): number {
  return round2(activoCirculante - Math.abs(pasivoCirculante));
}

/**
 * Deuda financiera = pasivos con costo CP+LP del rol deudaFinanciera (default
 * Compac: 2106 + 2306 + 2359). Valor absoluto de la suma neta de saldoFinal:
 * el tenant persiste pasivos con signo negativo. Devuelve null si no hay rol
 * configurado — el caller decide el fallback (p. ej. inferencia por nombre).
 */
export function deudaFinancieraFromBalanza(rows: BalanzaPnL[], roles?: AccountRoles | null): number | null {
  const rule = ruleFor(roles, "deudaFinanciera");
  if (!rule) {
    return null;
  }
  const pasivos = rows.filter((fila) => fila.categoriaMaestra === "Pasivo");
  const neta = sumRoleBalance(pasivos, rule, "saldoFinal");
  return round2(Math.abs(neta));
}

/**
 * Fallback legado de deuda financiera por nombre (préstamo, crédito, deuda,
 * bancari) para cuando no hay rol deudaFinanciera configurado. Mismo criterio
 * de magnitud que el rol: valor absoluto de la suma neta de saldoFinal, porque
 * el tenant persiste pasivos acreedores con signo negativo.
 */
export function deudaFinancieraPorNombre(rows: BalanzaPnL[]): number {
  const neta = rows
    .filter((fila) => fila.categoriaMaestra === "Pasivo" && isInterestBearingDebt(fila.nombreCuenta))
    .reduce((acc, fila) => acc + money(fila.saldoFinal), 0);
  return round2(Math.abs(neta));
}
