import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { mapToMasterWorkbook } from "./applyMapping";
import { COMPAC_FLUJO_EFECTIVO_PROFILE } from "./builtinProfiles";
import { parseFlujoEfectivoSheet } from "./parseFlujoEfectivo";
import { slugCategoria } from "../flujoEfectivo";
import { round2 } from "../money";

const FIXTURE = path.resolve("Data_ejemplo/03. Flujo de Efectivo 31.07.26.xlsx");

async function loadFixtureSheet(): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(FIXTURE) as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Flujo de Efectivo") ?? workbook.worksheets[0];
  assert.ok(sheet, "fixture debe tener hoja");
  return sheet;
}

function buildSyntheticSheet(mutate?: (sheet: ExcelJS.Worksheet) => void): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Flujo de Efectivo");
  sheet.addRow(["ACME SA DE CV"]);
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow(["", "M o v i m i e n t o s", "S a l d o s"]);
  sheet.addRow(["1000-0000 BANCOS"]);
  sheet.addRow(["Saldo inicial", "", 5000]);
  sheet.addRow(["Ingresos"]);
  sheet.addRow(["Ventas mostrador", 12000]);
  sheet.addRow(["Devolución SAT", 500]);
  sheet.addRow(["Total Ingresos", 12500]);
  sheet.addRow(["D i s p o n i b l e", "", 17500]);
  sheet.addRow(["Egresos"]);
  sheet.addRow(["Compras", 8000]);
  sheet.addRow(["Total Egresos", 8000]);
  sheet.addRow(["S a l d o    f i n a l", "", 9500]);
  mutate?.(sheet);
  return Promise.resolve(sheet);
}

test("fixture Publibags Jul-2026: totales y saldo final idénticos al Excel", async () => {
  const sheet = await loadFixtureSheet();
  const result = parseFlujoEfectivoSheet(sheet, COMPAC_FLUJO_EFECTIVO_PROFILE, 7, 2026);

  assert.equal(result.tesoreria.length, 1);
  const agg = result.tesoreria[0]!;
  assert.equal(agg.idBancoCaja, "1102-0000-0000-0000 BANCOS");
  assert.equal(agg.saldoInicialPeriodo, 290442.11);
  assert.equal(agg.entradasOperativas, 9058773.46);
  assert.equal(agg.salidasOperativas, 7563270.29);
  assert.equal(agg.saldoFinalPeriodo, 1785945.28);

  const ingresos = result.detalle.filter((row) => row.direccion === "ingreso");
  const egresos = result.detalle.filter((row) => row.direccion === "egreso");
  assert.equal(ingresos.length, 4);
  assert.equal(egresos.length, 9);
  assert.deepEqual(
    ingresos.map((row) => row.categoriaKey),
    ["cobranza", "prestamos", "traspasos", "diversos"],
  );
  assert.ok(egresos.some((row) => row.categoriaKey === "sueldos"));
  assert.ok(egresos.some((row) => row.categoriaKey === "proveedores"));
  assert.ok(egresos.some((row) => row.categoriaKey === "pago-prestamos"));

  const errors = result.warnings.filter((warning) => warning.severity === "ERROR");
  assert.deepEqual(errors, []);
});

test("mapToMasterWorkbook persiste agregado + detalle para flujo_efectivo", async () => {
  const buffer = readFileSync(FIXTURE);
  const mapped = await mapToMasterWorkbook({
    buffer: buffer as unknown as Buffer,
    filename: "03. Flujo de Efectivo 31.07.26.xlsx",
    documentType: "flujo_efectivo",
    sourceSystem: COMPAC_FLUJO_EFECTIVO_PROFILE.sourceSystem,
    sheetName: null,
    profile: COMPAC_FLUJO_EFECTIVO_PROFILE,
    periodo: 7,
    anio: 2026,
  });
  assert.equal(mapped.workbook.balanza.length, 0);
  assert.equal(mapped.workbook.tesoreria.length, 1);
  assert.equal(mapped.workbook.tesoreriaDetalle.length, 13);
  assert.ok(
    mapped.workbook.tesoreriaDetalle.every((row) => row.periodo === 7 && row.anio === 2026),
  );
});

test("tenant sintético con categorías distintas se parsea sin tocar código", async () => {
  const sheet = await buildSyntheticSheet();
  const result = parseFlujoEfectivoSheet(sheet, COMPAC_FLUJO_EFECTIVO_PROFILE, 8, 2026);

  const keys = result.detalle.map((row) => row.categoriaKey);
  assert.deepEqual(keys, ["ventas-mostrador", "devolucion-sat", "compras"]);
  const labels = result.detalle.map((row) => row.labelOrigen);
  assert.deepEqual(labels, ["Ventas mostrador", "Devolución SAT", "Compras"]);

  const agg = result.tesoreria[0]!;
  assert.equal(agg.saldoInicialPeriodo, 5000);
  assert.equal(agg.entradasOperativas, 12500);
  assert.equal(agg.salidasOperativas, 8000);
  assert.equal(agg.saldoFinalPeriodo, 9500);
  assert.deepEqual(result.warnings.filter((warning) => warning.severity === "ERROR"), []);
});

test("categoría desconocida se conserva y suma al total", async () => {
  const sheet = await buildSyntheticSheet((sheet) => {
    sheet.spliceRows(10, 0, ["Anticipo de clientes", 300]);
    sheet.getRow(11).getCell(2).value = 12800; // Total Ingresos
    sheet.getRow(12).getCell(3).value = 17800; // Disponible
    sheet.getRow(16).getCell(3).value = 9800; // Saldo final
  });
  const result = parseFlujoEfectivoSheet(sheet, COMPAC_FLUJO_EFECTIVO_PROFILE, 8, 2026);

  const desconocida = result.detalle.find((row) => row.categoriaKey === "anticipo-de-clientes");
  assert.ok(desconocida, "la categoría desconocida debe conservarse");
  assert.equal(desconocida.labelOrigen, "Anticipo de clientes");
  assert.equal(desconocida.direccion, "ingreso");
  assert.equal(result.tesoreria[0]!.entradasOperativas, 12800);
  assert.equal(result.tesoreria[0]!.saldoFinalPeriodo, 9800);
});

test("traspasos marcados y excluirlos no cambia el saldo final", async () => {
  const sheet = await loadFixtureSheet();
  const result = parseFlujoEfectivoSheet(sheet, COMPAC_FLUJO_EFECTIVO_PROFILE, 7, 2026);

  const traspasos = result.detalle.filter((row) => row.esTraspaso);
  assert.equal(traspasos.length, 2);
  const ingresoTraspaso = traspasos.find((row) => row.direccion === "ingreso")!;
  const egresoTraspaso = traspasos.find((row) => row.direccion === "egreso")!;
  assert.equal(ingresoTraspaso.monto, 1728080);
  assert.equal(egresoTraspaso.monto, 1728080);

  const agg = result.tesoreria[0]!;
  const sinTraspasosIn = agg.entradasOperativas - ingresoTraspaso.monto;
  const sinTraspasosOut = agg.salidasOperativas - egresoTraspaso.monto;
  const saldoSinTraspasos = round2(
    agg.saldoInicialPeriodo + sinTraspasosIn - sinTraspasosOut,
  );
  assert.equal(saldoSinTraspasos, agg.saldoFinalPeriodo);
});

test("conciliación: mismatch genera warning, no throw", async () => {
  const sheet = await buildSyntheticSheet((sheet) => {
    sheet.getRow(10).getCell(2).value = 13000; // Total Ingresos inflado
  });
  const result = parseFlujoEfectivoSheet(sheet, COMPAC_FLUJO_EFECTIVO_PROFILE, 8, 2026);

  assert.equal(result.tesoreria.length, 1);
  const warnings = result.warnings.filter((warning) => warning.severity === "WARNING");
  assert.ok(warnings.length >= 1, "debe haber warning de conciliación");
  assert.ok(warnings.some((warning) => warning.message.includes("difiere")));
  assert.deepEqual(result.warnings.filter((warning) => warning.severity === "ERROR"), []);
});

test("slugCategoria: acentos, prefijos Ingr/Egr y fallback", () => {
  assert.equal(slugCategoria("Ingr cobranza"), "cobranza");
  assert.equal(slugCategoria("Egr sueldos y salarios"), "sueldos-y-salarios");
  assert.equal(slugCategoria("Ingr devolución SAT"), "devolucion-sat");
  assert.equal(slugCategoria("Ingr. Cobranza"), "cobranza");
  assert.equal(slugCategoria("Ventas mostrador"), "ventas-mostrador");
  assert.equal(slugCategoria("Egr pago préstamos"), "pago-prestamos");
  assert.equal(slugCategoria("   "), "categoria");
});
