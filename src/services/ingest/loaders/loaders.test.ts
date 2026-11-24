process.env.TZ = "UTC";

import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { BUILTIN_PROFILES } from "@/services/ingest/builtinProfiles";
import { cellText, optionalNumber } from "@/services/ingest/cells";
import { detectDocument } from "@/services/ingest/detectDocument";
import { FIXTURES_SINTETICOS } from "@/services/ingest/fixtures/sinteticos";
import { getIngestLimits } from "@/services/ingest/limits";
import { buscarSeccion, hojaLegible, leerDocumento, type HojaLegible } from "@/services/ingest/loaders";
import { aCelda } from "@/services/ingest/loaders/xlsx";

/** Lo que los parsers pueden observar de una hoja, en forma comparable. */
function vista(hoja: HojaLegible | ExcelJS.Worksheet) {
  // Primero lo que cuenta la hoja: en ExcelJS, leer más allá del final crea filas.
  const { name, rowCount, columnCount } = hoja;
  const filasConValor: number[] = [];
  hoja.eachRow((_, numero) => filasConValor.push(numero));
  const cellCounts = Array.from({ length: rowCount }, (_, i) => hoja.getRow(i + 1).cellCount);
  const celdas: Array<[number, number, string, number, boolean]> = [];
  for (let numero = 1; numero <= rowCount + 1; numero += 1) {
    const fila = hoja.getRow(numero);
    const hasta = (cellCounts[numero - 1] ?? 0) + 1;
    for (let col = 1; col <= hasta; col += 1) {
      const value = fila.getCell(col).value;
      celdas.push([numero, col, cellText(value), optionalNumber(value), value instanceof Date]);
    }
  }
  return { name, rowCount, columnCount, filasConValor, cellCounts, celdas };
}

async function excel(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

async function bufferOf(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("lector xlsx: cada hoja sintética se ve igual que en ExcelJS", async () => {
  for (const fixture of FIXTURES_SINTETICOS) {
    const buffer = await fixture.build();
    const original = await excel(buffer);
    const documento = await leerDocumento(buffer, fixture.filename);
    assert.equal(documento.formato, "xlsx");
    assert.deepEqual(documento.secciones.map((s) => s.nombre), original.worksheets.map((s) => s.name));
    original.worksheets.forEach((sheet, index) => {
      assert.deepEqual(
        vista(hojaLegible(documento.secciones[index]!)),
        vista(sheet),
        `${fixture.nombre} / ${sheet.name}`,
      );
    });
  }
});

test("lector xlsx: combinadas vacías y filas solo con formato cuentan igual que en ExcelJS", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Hoja Demo");
  sheet.getCell("C4").value = "Cuenta Demo";
  sheet.mergeCells("C4:D4");
  sheet.mergeCells("A6:B6"); // combinada sin valor: ExcelJS la cuenta como fila con valor
  sheet.mergeCells("E7:E9"); // combinada vertical sin valor
  sheet.getCell("F8").value = { formula: "100+50", result: 150 };
  sheet.getCell("A11").style = { font: { bold: true } }; // solo formato, al final
  sheet.getCell("H11").style = { font: { bold: true } };
  const buffer = await bufferOf(workbook);
  const original = (await excel(buffer)).worksheets[0]!;
  const seccion = (await leerDocumento(buffer, "demo.xlsx")).secciones[0]!;
  assert.deepEqual(vista(hojaLegible(seccion)), vista(original));
  assert.equal(seccion.filas[3]![3], "Cuenta Demo", "la celda esclava trae el valor de la maestra");
  assert.deepEqual(seccion.combinadas, [
    { r1: 4, c1: 3, r2: 4, c2: 4 },
    { r1: 6, c1: 1, r2: 6, c2: 2 },
    { r1: 7, c1: 5, r2: 9, c2: 5 },
  ]);
});

test("aCelda: convierte los valores de ExcelJS a texto, número o fecha", () => {
  const fecha = new Date(Date.UTC(2026, 6, 31));
  assert.equal(aCelda(null), null);
  assert.equal(aCelda(undefined), null);
  assert.equal(aCelda("0101"), "0101");
  assert.equal(aCelda(100.5), 100.5);
  assert.equal(aCelda(fecha), fecha);
  assert.equal(aCelda(true), "true");
  assert.equal(aCelda({ formula: "100+50", result: 150 }), 150);
  assert.equal(aCelda({ sharedFormula: "A1", result: "Cuenta Demo" }), "Cuenta Demo");
  assert.equal(aCelda({ formula: "A1" }), null);
  assert.equal(aCelda({ text: "Liga Demo", hyperlink: "https://example.com" }), "Liga Demo");
  assert.equal(aCelda({ richText: [{ text: "Cuenta " }, { text: "Demo" }] }), "Cuenta Demo");
  assert.equal(aCelda({ error: "#N/A" }), null);
  assert.equal(aCelda({ formula: "1/0", result: { error: "#DIV/0!" } }), null);
});

test("lector xlsx: mismos topes y mensajes que la detección de siempre", async () => {
  const limits = getIngestLimits();
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Uno").getCell("A3").value = "x";
  workbook.addWorksheet("Dos");
  const buffer = await bufferOf(workbook);
  await assert.rejects(leerDocumento(buffer, "demo.xlsx", { ...limits, maxSheets: 1 }), {
    status: 413,
    message: "demo.xlsx: excede el máximo de hojas permitido.",
  });
  await assert.rejects(leerDocumento(buffer, "demo.xlsx", { ...limits, maxRows: 2 }), {
    status: 413,
    message: "demo.xlsx: excede los límites de filas o columnas.",
  });
  await assert.rejects(leerDocumento(Buffer.from("PK no es excel"), "roto.xlsx", limits), {
    status: 400,
    message: "roto.xlsx: el archivo Excel está cifrado, corrupto o no puede leerse.",
  });
});

test("detección: con el archivo ya leído da lo mismo que leyéndolo de nuevo", async () => {
  for (const fixture of FIXTURES_SINTETICOS) {
    const buffer = await fixture.build();
    const documento = await leerDocumento(buffer, fixture.filename);
    const { detectionId: _a, ...sinLeer } = await detectDocument(buffer, fixture.filename, BUILTIN_PROFILES);
    const { detectionId: _b, ...yaLeido } = await detectDocument(buffer, fixture.filename, BUILTIN_PROFILES, documento);
    assert.deepEqual(yaLeido, sinLeer, fixture.nombre);
  }
});

test("buscarSeccion: elige por nombre sin acentos o cae en la primera hoja", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Portada");
  workbook.addWorksheet("Diarios y Pólizas");
  const documento = await leerDocumento(await bufferOf(workbook), "demo.xlsx");
  assert.equal(buscarSeccion(documento, "polizas")?.nombre, "Diarios y Pólizas");
  assert.equal(buscarSeccion(documento, "no existe")?.nombre, "Portada");
  assert.equal(buscarSeccion(documento, null)?.nombre, "Portada");
});
