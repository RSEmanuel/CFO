import { MONEY_TOLERANCE, nearlyEqual, round2, toNumber, type MoneyValue } from "./money";

export const COMPAC_HISTORY_SEED = 20260731;
export const COMPAC_HISTORY_GROWTH = -0.006;

export type HistoryCategory =
  | "Activo"
  | "Pasivo"
  | "Patrimonio"
  | "Ingreso"
  | "COGS"
  | "OpEx";

export type CompacAnchorRow = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: HistoryCategory;
  saldoInicial: MoneyValue;
  debe: MoneyValue;
  haber: MoneyValue;
  saldoFinal: MoneyValue;
  montoPresupuestado: MoneyValue;
  depreciacionAmortizacion: boolean;
  periodo: number;
  anio: number;
};

export type CompacHistoryRow = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: HistoryCategory;
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
  montoPresupuestado: number;
  depreciacionAmortizacion: boolean;
  periodo: number;
  anio: number;
};

export type MonthSummary = {
  anio: number;
  periodo: number;
  bridgeAccountId: string;
  adjustment: number;
  deltaDebeHaber: number;
};

export type CompacHistoryResult = {
  rows: CompacHistoryRow[];
  months: MonthSummary[];
};

const BALANCE_CATEGORIES = new Set<HistoryCategory>(["Activo", "Pasivo", "Patrimonio"]);
const FLOW_CATEGORIES = new Set<HistoryCategory>(["Ingreso", "COGS", "OpEx"]);

export function historyPeriodKey(anio: number, periodo: number): string {
  return `${anio}-${String(periodo).padStart(2, "0")}`;
}

export function compacHistoryPeriods(): Array<{ anio: number; periodo: number }> {
  const periods: Array<{ anio: number; periodo: number }> = [];
  for (let anio = 2024; anio <= 2026; anio += 1) {
    const firstMonth = anio === 2024 ? 8 : 1;
    const lastMonth = anio === 2026 ? 6 : 12;
    for (let periodo = firstMonth; periodo <= lastMonth; periodo += 1) {
      periods.push({ anio, periodo });
    }
  }
  return periods;
}

function monthsBeforeJuly2026(anio: number, periodo: number): number {
  return (2026 - anio) * 12 + (7 - periodo);
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicNoise(idCuenta: string, anio: number, periodo: number, side: "debe" | "haber"): number {
  const unit = hash32(`${COMPAC_HISTORY_SEED}|${idCuenta}|${anio}|${periodo}|${side}`) / 4294967295;
  return 0.96 + unit * 0.08;
}

function seasonality(category: HistoryCategory, periodo: number): number {
  let factor = periodo >= 7 && periodo <= 9 ? 1.04 : periodo >= 10 ? 1.12 : 1;
  if (periodo === 12) {
    factor *= 1.05;
  }
  if ((category === "COGS" || category === "OpEx") && (periodo === 3 || periodo === 9)) {
    factor *= 1.08;
  }
  return factor;
}

function scaledMovement(
  anchorValue: MoneyValue,
  account: Pick<CompacAnchorRow, "idCuenta" | "categoriaMaestra">,
  anio: number,
  periodo: number,
  side: "debe" | "haber",
): number {
  const base = Math.max(0, toNumber(anchorValue));
  const trend = Math.pow(1 + COMPAC_HISTORY_GROWTH, monthsBeforeJuly2026(anio, periodo));
  return round2(Math.max(0, base * trend * seasonality(account.categoriaMaestra, periodo) * deterministicNoise(account.idCuenta, anio, periodo, side)));
}

function selectBridgeAccount(rows: CompacHistoryRow[]): CompacHistoryRow {
  const candidates = rows.filter((row) => row.categoriaMaestra === "Patrimonio");
  const fallback = candidates.length > 0 ? candidates : rows.filter((row) => row.categoriaMaestra === "OpEx");
  const bridge = fallback.sort((a, b) => b.debe + b.haber - (a.debe + a.haber) || a.idCuenta.localeCompare(b.idCuenta))[0];
  if (!bridge) {
    throw new Error("No existe una cuenta puente en Patrimonio ni OpEx para cuadrar el periodo.");
  }
  return bridge;
}

function balanceMonth(rows: CompacHistoryRow[]): MonthSummary {
  const totalDebe = round2(rows.reduce((sum, row) => sum + row.debe, 0));
  const totalHaber = round2(rows.reduce((sum, row) => sum + row.haber, 0));
  const delta = round2(totalDebe - totalHaber);
  const bridge = selectBridgeAccount(rows);

  if (delta > 0) {
    bridge.haber = round2(bridge.haber + delta);
  } else if (delta < 0) {
    bridge.debe = round2(bridge.debe + Math.abs(delta));
  }

  const finalDebe = round2(rows.reduce((sum, row) => sum + row.debe, 0));
  const finalHaber = round2(rows.reduce((sum, row) => sum + row.haber, 0));
  const finalDelta = round2(finalDebe - finalHaber);
  if (!nearlyEqual(finalDebe, finalHaber)) {
    throw new Error(
      `No fue posible cuadrar ${historyPeriodKey(rows[0]!.anio, rows[0]!.periodo)}: Debe=${finalDebe.toFixed(2)} Haber=${finalHaber.toFixed(2)}.`,
    );
  }

  return {
    anio: rows[0]!.anio,
    periodo: rows[0]!.periodo,
    bridgeAccountId: bridge.idCuenta,
    adjustment: Math.abs(delta),
    deltaDebeHaber: finalDelta,
  };
}

function assertAnchor(anchorRows: CompacAnchorRow[]): void {
  if (anchorRows.length === 0) {
    throw new Error("No hay balanza julio 2026 en el tenant Compac. Carga el archivo 05 primero.");
  }
  const ids = new Set<string>();
  for (const row of anchorRows) {
    if (row.anio !== 2026 || row.periodo !== 7) {
      throw new Error(`La cuenta ${row.idCuenta} no pertenece al ancla 2026-07.`);
    }
    if (ids.has(row.idCuenta)) {
      throw new Error(`La cuenta ${row.idCuenta} está duplicada en el ancla 2026-07.`);
    }
    ids.add(row.idCuenta);
    if (!BALANCE_CATEGORIES.has(row.categoriaMaestra) && !FLOW_CATEGORIES.has(row.categoriaMaestra)) {
      throw new Error(`Categoría maestra no soportada en ${row.idCuenta}: ${row.categoriaMaestra}.`);
    }
    for (const [field, value] of Object.entries({
      saldoInicial: row.saldoInicial,
      debe: row.debe,
      haber: row.haber,
      saldoFinal: row.saldoFinal,
    })) {
      if (!Number.isFinite(toNumber(value))) {
        throw new Error(`Valor monetario inválido en ${row.idCuenta}.${field}.`);
      }
    }
  }
}

export function assertGeneratedCompacHistory(
  anchorRows: CompacAnchorRow[],
  result: CompacHistoryResult,
): void {
  const expectedIds = new Set(anchorRows.map((row) => row.idCuenta));
  const periods = compacHistoryPeriods();
  if (result.months.length !== periods.length || result.rows.length !== periods.length * anchorRows.length) {
    throw new Error("El historial generado no contiene 23 meses completos.");
  }

  const anchorById = new Map(anchorRows.map((row) => [row.idCuenta, row]));
  const rowsByPeriod = new Map<string, CompacHistoryRow[]>();
  for (const row of result.rows) {
    const key = historyPeriodKey(row.anio, row.periodo);
    const bucket = rowsByPeriod.get(key) ?? [];
    bucket.push(row);
    rowsByPeriod.set(key, bucket);

    const anchor = anchorById.get(row.idCuenta);
    if (!anchor) {
      throw new Error(`El historial inventó la cuenta ${row.idCuenta}.`);
    }
    if (
      row.nombreCuenta !== anchor.nombreCuenta ||
      row.categoriaMaestra !== anchor.categoriaMaestra ||
      row.depreciacionAmortizacion !== anchor.depreciacionAmortizacion
    ) {
      throw new Error(`La identidad de la cuenta ${row.idCuenta} no coincide con julio 2026.`);
    }
    if (row.montoPresupuestado !== 0) {
      throw new Error(`La cuenta ${row.idCuenta} tiene presupuesto simulado distinto de cero.`);
    }
    const expectedFinal = round2(row.saldoInicial + row.debe - row.haber);
    if (!nearlyEqual(expectedFinal, row.saldoFinal)) {
      throw new Error(`La cuenta ${row.idCuenta} no cumple la identidad contable en ${key}.`);
    }
    if (FLOW_CATEGORIES.has(row.categoriaMaestra) && row.saldoInicial !== 0) {
      throw new Error(`La cuenta PyG ${row.idCuenta} arrastra saldo inicial en ${key}.`);
    }
  }

  for (const { anio, periodo } of periods) {
    const key = historyPeriodKey(anio, periodo);
    const rows = rowsByPeriod.get(key) ?? [];
    const ids = new Set(rows.map((row) => row.idCuenta));
    if (rows.length !== expectedIds.size || ids.size !== expectedIds.size || [...ids].some((id) => !expectedIds.has(id))) {
      throw new Error(`El set de cuentas de ${key} no coincide con julio 2026.`);
    }
    const totalDebe = round2(rows.reduce((sum, row) => sum + row.debe, 0));
    const totalHaber = round2(rows.reduce((sum, row) => sum + row.haber, 0));
    if (Math.abs(totalDebe - totalHaber) > MONEY_TOLERANCE) {
      throw new Error(`Partida doble inválida en ${key}.`);
    }
  }

  const chronological = [...periods, { anio: 2026, periodo: 7 }];
  for (let index = 0; index < chronological.length - 1; index += 1) {
    const current = rowsByPeriod.get(historyPeriodKey(chronological[index]!.anio, chronological[index]!.periodo)) ?? [];
    const nextPeriod = chronological[index + 1]!;
    const nextRows =
      nextPeriod.anio === 2026 && nextPeriod.periodo === 7
        ? anchorRows
        : rowsByPeriod.get(historyPeriodKey(nextPeriod.anio, nextPeriod.periodo)) ?? [];
    const nextById = new Map(nextRows.map((row) => [row.idCuenta, row]));
    for (const row of current.filter((item) => BALANCE_CATEGORIES.has(item.categoriaMaestra))) {
      const next = nextById.get(row.idCuenta);
      if (!next || !nearlyEqual(row.saldoFinal, toNumber(next.saldoInicial))) {
        throw new Error(`Saldo no encadenado para ${row.idCuenta} entre ${historyPeriodKey(row.anio, row.periodo)} y el periodo siguiente.`);
      }
    }
  }
}

export function generateCompacHistory(anchorRows: CompacAnchorRow[]): CompacHistoryResult {
  assertAnchor(anchorRows);
  const periods = compacHistoryPeriods();
  const rowsByPeriod = new Map<string, CompacHistoryRow[]>();
  const months: MonthSummary[] = [];

  for (const { anio, periodo } of periods) {
    const rows = anchorRows.map<CompacHistoryRow>((anchor) => ({
      idCuenta: anchor.idCuenta,
      nombreCuenta: anchor.nombreCuenta,
      categoriaMaestra: anchor.categoriaMaestra,
      saldoInicial: 0,
      debe: scaledMovement(anchor.debe, anchor, anio, periodo, "debe"),
      haber: scaledMovement(anchor.haber, anchor, anio, periodo, "haber"),
      saldoFinal: 0,
      montoPresupuestado: 0,
      depreciacionAmortizacion: anchor.depreciacionAmortizacion,
      periodo,
      anio,
    }));
    months.push(balanceMonth(rows));
    rowsByPeriod.set(historyPeriodKey(anio, periodo), rows);
  }

  const nextOpening = new Map(anchorRows.map((row) => [row.idCuenta, round2(toNumber(row.saldoInicial))]));
  for (const period of [...periods].reverse()) {
    const rows = rowsByPeriod.get(historyPeriodKey(period.anio, period.periodo))!;
    for (const row of rows) {
      if (BALANCE_CATEGORIES.has(row.categoriaMaestra)) {
        row.saldoFinal = nextOpening.get(row.idCuenta)!;
        row.saldoInicial = round2(row.saldoFinal - row.debe + row.haber);
        nextOpening.set(row.idCuenta, row.saldoInicial);
      } else {
        row.saldoInicial = 0;
        row.saldoFinal = round2(row.debe - row.haber);
      }
    }
  }

  const result = { rows: periods.flatMap((period) => rowsByPeriod.get(historyPeriodKey(period.anio, period.periodo))!), months };
  assertGeneratedCompacHistory(anchorRows, result);
  return result;
}
