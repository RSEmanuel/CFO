import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { mapToMasterWorkbook } from "./applyMapping";
import { COMPAC_AUXILIAR_PROFILE } from "./builtinProfiles";
import { parseAuxiliarCuentasSheet } from "./parseAuxiliarCuentas";

const FIXTURE_MXN = path.resolve("Data_ejemplo/06. Movimientos auxiliares del catalogo 31.07.26 (MXN).xlsx");
const FIXTURE_USD = path.resolve("Data_ejemplo/07. Movimientos auxiliares del catalogo 31.07.26 (USD).xlsx");

async function loadSheet(file: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  assert.ok(sheet, "fixture debe tener hoja");
  return sheet;
}

test("fixture MXN Jul-2026: moneda, movimientos y resumen por cuenta", async () => {
  const sheet = await loadSheet(FIXTURE_MXN);
  const result = parseAuxiliarCuentasSheet(
    sheet,
    COMPAC_AUXILIAR_PROFILE,
    7,
    2026,
    "06. Movimientos auxiliares del catalogo 31.07.26 (MXN).xlsx",
  );

  assert.equal(result.moneda, "MXN");
  assert.ok(result.movimientos.length > 100, "el auxiliar real tiene cientos de movimientos");
  assert.ok(
    result.movimientos.every((row) => row.periodo === 7 && row.anio === 2026 && row.moneda === "MXN"),
  );

  const bbva = result.movimientos.filter((row) => row.idCuenta === "1102-0001-0001-0000");
  assert.ok(bbva.length > 0, "BBVA debe tener movimientos");
  const primero = bbva[0]!;
  assert.equal(primero.fecha.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(primero.tipoPoliza, "Ingresos");
  assert.equal(primero.referencia, "P-2867");
  assert.equal(primero.cargos, 122187.11);
  assert.equal(primero.saldo, 248511.71);

  // El resumen solo incluye cuentas hoja: BBVA sí, los mayores BANCOS/CAJA no.
  const resumenBbva = result.resumen.find((row) => row.idCuenta === "1102-0001-0001-0000");
  assert.ok(resumenBbva, "resumen debe incluir la cuenta hoja BBVA");
  assert.equal(resumenBbva.saldoInicial, 126324.6);
  assert.ok(!result.resumen.some((row) => row.idCuenta === "1102-0000-0000-0000"));
  assert.ok(!result.resumen.some((row) => row.idCuenta === "1101-0000-0000-0000"));

  // Conciliación contra las filas "Total:" del propio reporte: sin diferencias.
  const difiere = result.warnings.filter((warning) => warning.message.includes("difiere"));
  assert.deepEqual(difiere, []);
  assert.deepEqual(result.warnings.filter((warning) => warning.severity === "ERROR"), []);
});

test("fixture USD: la moneda se detecta del encabezado", async () => {
  const sheet = await loadSheet(FIXTURE_USD);
  const result = parseAuxiliarCuentasSheet(
    sheet,
    COMPAC_AUXILIAR_PROFILE,
    7,
    2026,
    "07. Movimientos auxiliares del catalogo 31.07.26 (USD).xlsx",
  );
  assert.equal(result.moneda, "USD");
  assert.ok(result.movimientos.length > 0);
  assert.ok(result.movimientos.every((row) => row.moneda === "USD"));
});

test("mapToMasterWorkbook persiste movimientos y resumen para auxiliar_cuentas", async () => {
  const buffer = readFileSync(FIXTURE_MXN);
  const mapped = await mapToMasterWorkbook({
    buffer: buffer as unknown as Buffer,
    filename: "06. Movimientos auxiliares del catalogo 31.07.26 (MXN).xlsx",
    documentType: "auxiliar_cuentas",
    sourceSystem: COMPAC_AUXILIAR_PROFILE.sourceSystem,
    sheetName: null,
    profile: COMPAC_AUXILIAR_PROFILE,
    periodo: 7,
    anio: 2026,
  });
  assert.equal(mapped.workbook.balanza.length, 0);
  assert.ok(mapped.workbook.auxiliarMovimientos.length > 100);
  assert.ok(mapped.workbook.auxiliarResumen.length > 0);
});

test("movimientos fuera del periodo generan warning PERIODO", async () => {
  const sheet = await loadSheet(FIXTURE_MXN);
  const result = parseAuxiliarCuentasSheet(
    sheet,
    COMPAC_AUXILIAR_PROFILE,
    8,
    2026,
    "06. Movimientos auxiliares del catalogo 31.07.26 (MXN).xlsx",
  );
  const periodoWarnings = result.warnings.filter((warning) => warning.rule === "PERIODO");
  assert.equal(periodoWarnings.length, 1);
  assert.ok(periodoWarnings[0]!.message.includes("8/2026"));
});
