import type ExcelJS from "exceljs";
import { cellText, normalizeToken, optionalNumber } from "@/services/ingest/cells";
import type { FlujoSectionTokens, MappingProfileShape } from "@/services/ingest/types";
import type { QualityIssue, TesoreriaDetalleRow, TesoreriaRow } from "@/services/ingestionTypes";
import { conciliarFlujo, slugCategoria } from "@/services/flujoEfectivo";
import { round2 } from "@/services/money";

type Section = "none" | "ingresos" | "egresos";

export type FlujoEfectivoParseResult = {
  tesoreria: TesoreriaRow[];
  detalle: TesoreriaDetalleRow[];
  warnings: QualityIssue[];
};

type AccountAcc = {
  row: number;
  idBancoCaja: string;
  saldoInicial: number | null;
  totalIngresos: number | null;
  disponible: number | null;
  totalEgresos: number | null;
  saldoFinal: number | null;
  detalle: TesoreriaDetalleRow[];
  usedKeys: Map<string, number>;
};

function headerMap(worksheet: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const map = new Map<string, number>();
  const current = worksheet.getRow(headerRow);
  const previous = headerRow > 1 ? worksheet.getRow(headerRow - 1) : null;
  current.eachCell({ includeEmpty: true }, (cell, col) => {
    const here = normalizeToken(cellText(cell.value));
    const above = previous ? normalizeToken(cellText(previous.getCell(col).value)) : "";
    if (here) map.set(here, col);
    if (above) map.set(above, col);
    if (above && here) map.set(`${above}_${here}`, col);
  });
  return map;
}

function resolveColumn(headers: Map<string, number>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const colMatch = alias.match(/^__col:(\d+)$/);
    if (colMatch) {
      return Number(colMatch[1]);
    }
    const idx = headers.get(alias) ?? headers.get(normalizeToken(alias));
    if (idx) {
      return idx;
    }
  }
  return null;
}

function matchesToken(normalizedConcept: string, tokens: string[]): boolean {
  const squashedConcept = normalizedConcept.replace(/_/g, "");
  return tokens.some((token) => {
    const needle = normalizeToken(token);
    return (
      needle !== "" &&
      (normalizedConcept.includes(needle) ||
        squashedConcept.includes(needle.replace(/_/g, "")))
    );
  });
}

function looksLikeAccountHeader(concepto: string, hasAmount: boolean): boolean {
  return !hasAmount && /^\d[\d-]*\s+\S/.test(concepto);
}

function directionFromPrefix(
  normalizedConcept: string,
  tokens: FlujoSectionTokens,
): "ingreso" | "egreso" | null {
  const firstWord = normalizedConcept.split("_")[0] ?? "";
  if (tokens.ingresoPrefix.some((token) => firstWord === normalizeToken(token))) {
    return "ingreso";
  }
  if (tokens.egresoPrefix.some((token) => firstWord === normalizeToken(token))) {
    return "egreso";
  }
  return null;
}

function uniqueCategoriaKey(base: string, used: Map<string, number>): string {
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

export function parseFlujoEfectivoSheet(
  worksheet: ExcelJS.Worksheet,
  profile: MappingProfileShape,
  periodo: number,
  anio: number,
): FlujoEfectivoParseResult {
  const warnings: QualityIssue[] = [];
  const tokens = profile.flujoConfig;
  if (!tokens) {
    warnings.push({
      rule: "PARSEO",
      severity: "ERROR",
      message: "El perfil de flujo de efectivo no define flujoConfig (tokens de sección).",
      sheet: worksheet.name,
    });
    return { tesoreria: [], detalle: [], warnings };
  }

  const headers = headerMap(worksheet, profile.headerRow);
  const conceptoCol = resolveColumn(headers, profile.columnMap.concepto ?? []);
  const movimientosCol = resolveColumn(headers, profile.columnMap.movimientos ?? []);
  const saldosCol = resolveColumn(headers, profile.columnMap.saldos ?? []);
  if (!conceptoCol || !movimientosCol) {
    warnings.push({
      rule: "PARSEO",
      severity: "ERROR",
      message: "No se resolvieron las columnas concepto/movimientos del reporte de flujo.",
      sheet: worksheet.name,
    });
    return { tesoreria: [], detalle: [], warnings };
  }

  const accounts: AccountAcc[] = [];
  let current: AccountAcc | null = null;
  let section: Section = "none";
  let orden = 0;
  // CONTPAQi puede agregar al pie una tabla "Precaución: movimientos sin
  // diario asignado" (Fecha/Tipo/Cuenta/...); no es una categoría de flujo.
  let precaucion = false;

  const ensureAccount = (rowNumber: number): AccountAcc => {
    if (!current) {
      current = {
        row: rowNumber,
        idBancoCaja: "cuenta",
        saldoInicial: null,
        totalIngresos: null,
        disponible: null,
        totalEgresos: null,
        saldoFinal: null,
        detalle: [],
        usedKeys: new Map<string, number>(),
      };
      accounts.push(current);
    }
    return current;
  };

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= profile.headerRow) {
      return;
    }
    const rawConcepto = cellText(row.getCell(conceptoCol).value);
    if (!rawConcepto) {
      return;
    }
    const concepto = rawConcepto.replace(/\s+/g, " ").trim();
    const normalized = normalizeToken(rawConcepto);
    if (precaucion) {
      return;
    }
    if (normalized.startsWith("precaucion")) {
      precaucion = true;
      return;
    }
    const movRaw = row.getCell(movimientosCol).value;
    const salRaw = saldosCol ? row.getCell(saldosCol).value : null;
    const hasMov = cellText(movRaw) !== "";
    const hasSal = saldosCol ? cellText(salRaw) !== "" : false;
    const movimientos = optionalNumber(movRaw);
    const saldos = optionalNumber(salRaw);

    if (matchesToken(normalized, tokens.saldoInicial)) {
      ensureAccount(rowNumber).saldoInicial = hasSal ? saldos : movimientos;
      return;
    }
    if (matchesToken(normalized, tokens.totalIngresos)) {
      ensureAccount(rowNumber).totalIngresos = hasMov ? movimientos : saldos;
      return;
    }
    if (matchesToken(normalized, tokens.totalEgresos)) {
      ensureAccount(rowNumber).totalEgresos = hasMov ? movimientos : saldos;
      return;
    }
    if (matchesToken(normalized, tokens.disponible)) {
      ensureAccount(rowNumber).disponible = hasSal ? saldos : movimientos;
      return;
    }
    if (matchesToken(normalized, tokens.saldoFinal)) {
      ensureAccount(rowNumber).saldoFinal = hasSal ? saldos : movimientos;
      return;
    }
    if (matchesToken(normalized, tokens.ingresos)) {
      ensureAccount(rowNumber);
      section = "ingresos";
      return;
    }
    if (matchesToken(normalized, tokens.egresos)) {
      ensureAccount(rowNumber);
      section = "egresos";
      return;
    }
    if (looksLikeAccountHeader(concepto, hasMov || hasSal)) {
      current = {
        row: rowNumber,
        idBancoCaja: concepto,
        saldoInicial: null,
        totalIngresos: null,
        disponible: null,
        totalEgresos: null,
        saldoFinal: null,
        detalle: [],
        usedKeys: new Map<string, number>(),
      };
      accounts.push(current);
      section = "none";
      return;
    }

    const direccion =
      section === "ingresos"
        ? "ingreso"
        : section === "egresos"
          ? "egreso"
          : directionFromPrefix(normalized, tokens);
    if (!direccion || (!hasMov && !hasSal)) {
      return;
    }
    const account = ensureAccount(rowNumber);
    orden += 1;
    account.detalle.push({
      row: rowNumber,
      idBancoCaja: account.idBancoCaja,
      direccion,
      categoriaKey: uniqueCategoriaKey(slugCategoria(concepto), account.usedKeys),
      labelOrigen: concepto,
      monto: round2(hasMov ? movimientos : saldos),
      esTraspaso: matchesToken(normalized, tokens.traspaso),
      orden,
      periodo,
      anio,
    });
  });

  const tesoreria: TesoreriaRow[] = [];
  const detalle: TesoreriaDetalleRow[] = [];
  for (const account of accounts) {
    const sumIngresos = round2(
      account.detalle
        .filter((linea) => linea.direccion === "ingreso")
        .reduce((sum, linea) => sum + linea.monto, 0),
    );
    const sumEgresos = round2(
      account.detalle
        .filter((linea) => linea.direccion === "egreso")
        .reduce((sum, linea) => sum + linea.monto, 0),
    );
    const totalIngresos = account.totalIngresos ?? sumIngresos;
    const totalEgresos = account.totalEgresos ?? sumEgresos;
    if (account.totalIngresos != null && Math.abs(account.totalIngresos - sumIngresos) > 0.01) {
      warnings.push({
        rule: "PARSEO",
        severity: "WARNING",
        message: `${account.idBancoCaja}: la suma de ingresos por categoría (${sumIngresos.toFixed(2)}) difiere del Total Ingresos reportado (${account.totalIngresos.toFixed(2)}).`,
        sheet: worksheet.name,
        row: account.row,
      });
    }
    if (account.totalEgresos != null && Math.abs(account.totalEgresos - sumEgresos) > 0.01) {
      warnings.push({
        rule: "PARSEO",
        severity: "WARNING",
        message: `${account.idBancoCaja}: la suma de egresos por categoría (${sumEgresos.toFixed(2)}) difiere del Total Egresos reportado (${account.totalEgresos.toFixed(2)}).`,
        sheet: worksheet.name,
        row: account.row,
      });
    }
    const saldoInicial = account.saldoInicial ?? 0;
    for (const message of conciliarFlujo({
      saldoInicial,
      totalIngresos,
      disponible: account.disponible,
      totalEgresos,
      saldoFinal: account.saldoFinal,
    })) {
      warnings.push({
        rule: "PARSEO",
        severity: "WARNING",
        message: `${account.idBancoCaja}: ${message}`,
        sheet: worksheet.name,
        row: account.row,
      });
    }
    tesoreria.push({
      row: account.row,
      idBancoCaja: account.idBancoCaja,
      saldoInicialPeriodo: saldoInicial,
      entradasOperativas: totalIngresos,
      salidasOperativas: totalEgresos,
      salidasCapex: 0,
      servicioDeuda: 0,
      saldoFinalPeriodo: round2(saldoInicial + totalIngresos - totalEgresos),
      periodo,
      anio,
    });
    detalle.push(...account.detalle);
  }

  if (detalle.length === 0) {
    warnings.push({
      rule: "PARSEO",
      severity: "ERROR",
      message: "El reporte de flujo de efectivo no produjo categorías.",
      sheet: worksheet.name,
    });
  }
  return { tesoreria, detalle, warnings };
}
