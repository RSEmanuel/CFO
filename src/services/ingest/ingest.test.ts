import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { mapToMasterWorkbook } from "./applyMapping";
import { BUILTIN_PROFILES, COMPAC_BALANZA_PROFILE, COMPAC_FLUJO_EFECTIVO_PROFILE } from "./builtinProfiles";
import { detectDocument } from "./detectDocument";
import { selectLeafCodes } from "./leafAccounts";
import { collectPartidaDobleIssues } from "../financialValidations";
import { parseMasterWorkbook } from "../workbookParser";
import { InMemoryIngestionRepository } from "./inMemoryIngestionRepository";
import { getIngestLimits, validateWorkbookContainer } from "./limits";
import { combineEffectiveProfiles } from "./effectiveProfiles";
import { resolveBatchPeriod } from "./batchPolicy";
import { normalizeToken } from "./cells";
import { classifyCommitOutcome } from "./outcome";
import type { DetectResult } from "./types";

async function bufferOf(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function preview(
  overrides: Partial<DetectResult> = {},
): DetectResult {
  return {
    sha256: "a".repeat(64),
    filename: "anonimo.xlsx",
    sourceSystem: "compac",
    documentType: "balanza",
    headerStartRow: 4,
    headerRow: 5,
    sheetName: "Reporte",
    headers: ["cuenta", "nombre", "cargos", "abonos"],
    confidence: 0.95,
    persistable: true,
    inferredPeriodo: 7,
    inferredAnio: 2026,
    rowCountEstimate: 4,
    missingCanonical: [],
    notes: [],
    selectedProfileId: COMPAC_BALANZA_PROFILE.id,
    profileCandidates: [],
    evidence: {
      sheetsScanned: ["Reporte"],
      rowsScanned: 10,
      columnsScanned: 8,
      matchedTokens: [],
      contentPeriod: "7/2026",
    },
    ...overrides,
  };
}

function addMasterSheets(wb: ExcelJS.Workbook) {
  const balanza = wb.addWorksheet("balanza_pnl");
  balanza.addRow([
    "id_cuenta",
    "nombre_cuenta",
    "categoria_maestra",
    "saldo_inicial",
    "debe",
    "haber",
    "saldo_final",
    "monto_presupuestado",
    "depreciacion_amortizacion",
    "periodo",
    "anio",
  ]);
  balanza.addRow(["1101", "Bancos", "Activo", 100, 50, 50, 100, 0, false, 7, 2026]);
  balanza.addRow(["2101", "Proveedores", "Pasivo", 100, 50, 50, 100, 0, false, 7, 2026]);

  const ventas = wb.addWorksheet("auxiliar_ventas");
  ventas.addRow([
    "id_cliente",
    "nombre_cliente",
    "folio_factura",
    "fecha_emision",
    "fecha_vencimiento",
    "monto_subtotal",
    "iva",
    "monto_cobrado",
    "estatus_pago",
    "linea_negocio",
  ]);
  ventas.addRow(["C1", "Cliente Demo", "F-1", new Date(2026, 6, 2), new Date(2026, 7, 1), 100, 16, 116, "Pagado", "Demo"]);

  const egresos = wb.addWorksheet("auxiliar_egresos");
  egresos.addRow([
    "id_proveedor",
    "nombre_proveedor",
    "folio_documento",
    "fecha_emision",
    "fecha_vencimiento",
    "monto_subtotal",
    "centro_de_costos",
    "clasificacion_gasto",
    "tipo_inversion",
    "estatus_pago",
  ]);
  egresos.addRow(["P1", "Proveedor Demo", "E-1", new Date(2026, 6, 3), new Date(2026, 6, 20), 80, "Admin", "Fijo", "OpEx", "Pagado"]);

  const tesoreria = wb.addWorksheet("tesoreria_flujo");
  tesoreria.addRow([
    "id_banco_caja",
    "saldo_inicial_periodo",
    "entradas_operativas",
    "salidas_operativas",
    "salidas_capex",
    "servicio_deuda",
    "saldo_final_periodo",
    "periodo",
    "anio",
  ]);
  tesoreria.addRow(["1101", 100, 50, 50, 0, 0, 100, 7, 2026]);
}

describe("ingest detect/map", () => {
  it("clasifica una carga parcial válida como éxito con advertencias", () => {
    assert.equal(classifyCommitOutcome(0, 0), "COMMITTED");
    assert.equal(classifyCommitOutcome(0, 3), "COMMITTED_WITH_WARNINGS");
    assert.equal(classifyCommitOutcome(1, 0), "COMMITTED_WITH_WARNINGS");
  });

  it("normaliza acentos, separadores, saltos y letras espaciadas", () => {
    assert.equal(normalizeToken("C u e n t a"), "cuenta");
    assert.equal(normalizeToken("N o m b r e"), "nombre");
    assert.equal(normalizeToken("Saldos-Iniciales"), "saldos_iniciales");
    assert.equal(normalizeToken("Balanza de\nComprobación"), "balanza_de_comprobacion");
  });

  it("master_template: detecta las 4 hojas y el parser conserva counts", async () => {
    const buf = await bufferOf(addMasterSheets);
    const detected = await detectDocument(buf, "master.xlsx");
    assert.equal(detected.documentType, "master_workbook");
    assert.equal(detected.sourceSystem, "master_template");
    assert.equal(detected.persistable, true);
    const parsed = await parseMasterWorkbook(buf, "master.xlsx");
    assert.equal(parsed.balanza.length, 2);
    assert.equal(parsed.ventas.length, 1);
    assert.equal(parsed.egresos.length, 1);
    assert.equal(parsed.tesoreria.length, 1);
  });

  it("detecta y mapea el encabezado Compac multinivel anonimizado", async () => {
    const buf = await bufferOf((wb) => {
      const sheet = wb.addWorksheet("Balanza de Comprobación");
      sheet.addRow(["Empresa Demo"]);
      sheet.addRow(["Balanza de comprobación al 31/Jul/2026"]);
      sheet.addRow([]);
      sheet.addRow(["C u e n t a", "N o m b r e", "Saldos Iniciales", "Saldos Iniciales", "", "", "Saldos Actuales", "Saldos Actuales"]);
      sheet.addRow(["", "", "Deudor", "Acreedor", "Cargos", "Abonos", "Deudor", "Acreedor"]);
      sheet.addRow([]);
      sheet.addRow(["1102-0000-0000-0000", "BANCOS", 100, 0, 80, 30, 150, 0]);
      sheet.addRow(["1102-0001-0001-0000", "BBVA", 100, 0, 80, 30, 150, 0]);
      sheet.addRow(["4101-0001-0000-0000", "Ventas", 0, 0, 0, 100, 0, 100]);
      sheet.addRow(["5101-0001-0000-0000", "Costo de ventas", 0, 0, 50, 0, 50, 0]);
      for (let index = 1; index <= 60; index += 1) {
        sheet.addRow([`Pie auxiliar ${index}`]);
      }
    });
    const detected = await detectDocument(buf, "archivo_sin_pistas.xlsx");
    assert.equal(detected.documentType, "balanza");
    assert.equal(detected.sourceSystem, "compac");
    assert.equal(detected.selectedProfileId, COMPAC_BALANZA_PROFILE.id);
    assert.equal(detected.headerStartRow, 4);
    assert.equal(detected.headerRow, 5);
    assert.deepEqual(detected.missingCanonical, []);
    assert.ok(detected.confidence >= 0.7);
    assert.equal(detected.inferredPeriodo, 7);
    assert.equal(detected.inferredAnio, 2026);
    assert.equal(detected.rowCountEstimate, 65);
    const mapped = await mapToMasterWorkbook({
      buffer: buf,
      filename: "archivo_sin_pistas.xlsx",
      documentType: "balanza",
      sourceSystem: "compac",
      sheetName: detected.sheetName,
      profile: COMPAC_BALANZA_PROFILE,
      periodo: 7,
      anio: 2026,
    });
    assert.equal(mapped.workbook.balanza.length, 3);
    assert.ok(mapped.workbook.balanza.length >= 2);
    for (const row of mapped.workbook.balanza) {
      assert.ok(row.idCuenta);
      assert.equal(typeof row.saldoInicial, "number");
      assert.equal(typeof row.saldoFinal, "number");
      assert.equal(row.periodo, 7);
      assert.equal(row.anio, 2026);
      assert.ok(!Number.isNaN(row.debe));
    }
    assert.equal(
      mapped.workbook.balanza.some((row) => row.idCuenta === "1102-0000-0000-0000"),
      false,
    );
    const banco = mapped.workbook.balanza.find(
      (row) => row.idCuenta === "1102-0001-0001-0000",
    );
    assert.equal(banco?.debe, 80);
    assert.equal(banco?.haber, 30);
    assert.equal(banco?.saldoInicial, 100);
    assert.equal(banco?.saldoFinal, 150);
    const ventas = mapped.workbook.balanza.find((row) => row.idCuenta.startsWith("4101"));
    assert.equal(ventas?.categoriaMaestra, "Ingreso");
    assert.equal(ventas?.saldoInicial, 0);
    assert.equal(ventas?.saldoFinal, -100);
    assert.deepEqual(mapped.workbook.cuentasCatalogo, [
      { idCuenta: "1102-0000-0000-0000", nombreCuenta: "BANCOS" },
    ]);
  });

  it("guarda el nombre de la cuenta de mayor sin sumar su monto", async () => {
    const buf = await bufferOf((wb) => {
      const sheet = wb.addWorksheet("Balanza de Comprobación");
      sheet.addRow(["Empresa Demo"]);
      sheet.addRow(["Balanza de comprobación al 31/Jul/2026"]);
      sheet.addRow([]);
      sheet.addRow(["C u e n t a", "N o m b r e", "Saldos Iniciales", "Saldos Iniciales", "", "", "Saldos Actuales", "Saldos Actuales"]);
      sheet.addRow(["", "", "Deudor", "Acreedor", "Cargos", "Abonos", "Deudor", "Acreedor"]);
      sheet.addRow([]);
      sheet.addRow(["6101-0000-0000-0000", "GASTOS GENERALES", 0, 0, 150, 0, 150, 0]);
      sheet.addRow(["6101-0001-0000-0000", "Sueldos y Salarios", 0, 0, 100, 0, 100, 0]);
      sheet.addRow(["6101-0002-0000-0000", "Compensaciones", 0, 0, 50, 0, 50, 0]);
      sheet.addRow(["4101-0000-0000-0000", "4101-0000-0000-0000", 0, 0, 0, 200, 0, 200]);
      sheet.addRow(["4101-0001-0001-0000", "Ventas", 0, 0, 0, 200, 0, 200]);
    });
    const mapped = await mapToMasterWorkbook({
      buffer: buf,
      filename: "balanza.xlsx",
      documentType: "balanza",
      sourceSystem: "compac",
      sheetName: "Balanza de Comprobación",
      profile: COMPAC_BALANZA_PROFILE,
      periodo: 7,
      anio: 2026,
    });
    assert.deepEqual(
      mapped.workbook.balanza.map((row) => row.idCuenta),
      ["6101-0001-0000-0000", "6101-0002-0000-0000", "4101-0001-0001-0000"],
    );
    const gastos = mapped.workbook.balanza
      .filter((row) => row.idCuenta.startsWith("6101"))
      .reduce((sum, row) => sum + row.debe, 0);
    assert.equal(gastos, 150);
    // La fila sin nombre real (el nombre es el mismo código) no entra al catálogo.
    assert.deepEqual(mapped.workbook.cuentasCatalogo, [
      { idCuenta: "6101-0000-0000-0000", nombreCuenta: "GASTOS GENERALES" },
    ]);
  });

  it("documento desconocido no es persistible", async () => {
    const buf = await bufferOf((wb) => {
      const sheet = wb.addWorksheet("Notas");
      sheet.addRow(["hola", "mundo"]);
      sheet.addRow(["1", "2"]);
    });
    const detected = await detectDocument(buf, "notas.xlsx");
    assert.equal(detected.documentType, "desconocido");
    assert.equal(detected.persistable, false);
    const mapped = await mapToMasterWorkbook({
      buffer: buf,
      filename: "notas.xlsx",
      documentType: detected.documentType,
      sourceSystem: detected.sourceSystem,
      sheetName: detected.sheetName,
      profile: null,
      periodo: 7,
      anio: 2026,
    });
    assert.equal(mapped.workbook.balanza.length, 0);
    assert.ok(mapped.warnings.some((item) => item.rule === "PARSEO"));
  });

  it("repositorio transaccional preserva datos y revierte una carga fallida", async () => {
    const repository = new InMemoryIngestionRepository();
    const workbook = {
      balanza: [{
        row: 2,
        idCuenta: "1101",
        nombreCuenta: "Bancos",
        categoriaMaestra: "Activo" as const,
        saldoInicial: 100,
        debe: 10,
        haber: 10,
        saldoFinal: 100,
        montoPresupuestado: 0,
        depreciacionAmortizacion: false,
        periodo: 7,
        anio: 2026,
      }],
      ventas: [],
      egresos: [],
      tesoreria: [],
      tesoreriaDetalle: [],
      auxiliarMovimientos: [],
      auxiliarResumen: [],
      polizas: [],
      polizaMovimientos: [],
    };
    await repository.replaceBalance("tenant-a", 7, 2026, workbook);
    await repository.replaceBalance("tenant-a", 7, 2026, workbook);
    assert.equal(repository.balances.get("tenant-a:2026:7")?.length, 1);
    repository.failAfterDelete = true;
    await assert.rejects(repository.replaceBalance("tenant-a", 7, 2026, { ...workbook, balanza: [] }));
    assert.equal(repository.balances.get("tenant-a:2026:7")?.length, 1);
    assert.deepEqual(repository.preserved, { ventas: ["venta"], egresos: ["egreso"], tesoreria: ["flujo"] });
  });

  it("dos perfiles Compac cercanos producen AMBIGUOUS_MAPPING", async () => {
    const buf = await bufferOf((wb) => {
      const sheet = wb.addWorksheet("Reporte");
      sheet.addRow(["Balanza de comprobación Julio 2026"]);
      sheet.addRow([]);
      sheet.addRow(["Cuenta", "Nombre", "Saldos Iniciales", "", "", "", "Saldos Actuales"]);
      sheet.addRow(["", "", "Deudor", "Acreedor", "Cargos", "Abonos", "Deudor", "Acreedor"]);
      sheet.addRow(["1101", "Bancos", 1, 0, 1, 1, 1, 0]);
    });
    const competitor = {
      ...COMPAC_BALANZA_PROFILE,
      id: "tenant_compac_v2",
      origin: "TENANT" as const,
      tenantId: "tenant-a",
      profileKey: "compac/balanza-alternativa",
      version: 2,
      fingerprintHash: "b".repeat(64),
    };
    const detected = await detectDocument(buf, "archivo.xlsx", [COMPAC_BALANZA_PROFILE, competitor]);
    assert.equal(detected.errorCode, "AMBIGUOUS_MAPPING");
    assert.equal(detected.persistable, false);
    assert.equal(detected.profileCandidates.length, 2);
  });

  it("built-ins create-only no pisan perfiles TENANT y hay aislamiento", () => {
    const customA = {
      ...COMPAC_BALANZA_PROFILE,
      id: "custom-a",
      origin: "TENANT" as const,
      tenantId: "tenant-a",
      profileKey: "compac/custom",
      version: 3,
      name: "Nombre editado por tenant A",
    };
    const customB = { ...customA, id: "custom-b", tenantId: "tenant-b", name: "Tenant B" };
    const effectiveA = combineEffectiveProfiles(
      "tenant-a",
      [COMPAC_BALANZA_PROFILE],
      [customA, customB],
    );
    assert.equal(effectiveA.find((profile) => profile.id === "custom-a")?.name, "Nombre editado por tenant A");
    assert.equal(effectiveA.some((profile) => profile.id === "custom-b"), false);
    assert.equal(effectiveA.some((profile) => profile.id === COMPAC_BALANZA_PROFILE.id), true);
  });

  it("periodo y clasificación se infieren del contenido, no del nombre", async () => {
    const buf = await bufferOf((wb) => {
      wb.addWorksheet("Notas").addRow(["Documento sin periodo"]);
    });
    const detected = await detectDocument(buf, "balanza-julio-2026.xlsx");
    assert.equal(detected.documentType, "desconocido");
    assert.equal(detected.inferredPeriodo, null);
    assert.equal(detected.inferredAnio, null);
  });

  it("un documento no persistible de otro periodo no cambia el periodo", () => {
    const result = resolveBatchPeriod(
      [
        preview(),
        preview({
          sha256: "b".repeat(64),
          documentType: "diarios_polizas",
          persistable: false,
          inferredPeriodo: 8,
        }),
      ],
      { periodo: 7, anio: 2026 },
      true,
    );
    assert.deepEqual(result, { periodo: 7, anio: 2026 });
  });

  it("rechaza dos balanzas antes de persistir, aunque tengan otro periodo", () => {
    assert.throws(
      () =>
        resolveBatchPeriod(
          [preview(), preview({ sha256: "b".repeat(64), inferredPeriodo: 8 })],
          { periodo: 7, anio: 2026 },
          true,
        ),
      /dos balanzas/,
    );
  });

  it("usa el periodo del archivo aunque la sesión sea otro mes", () => {
    assert.deepEqual(
      resolveBatchPeriod(
        [preview({ inferredPeriodo: 8 })],
        { periodo: 7, anio: 2026 },
        false,
      ),
      { periodo: 8, anio: 2026 },
    );
  });

  it("detecta el reporte de flujo de efectivo con los perfiles default", async () => {
    const buf = readFileSync(path.resolve("Data_ejemplo/03. Flujo de Efectivo 31.07.26.xlsx"));
    const detected = await detectDocument(
      buf as unknown as Buffer,
      "03. Flujo de Efectivo 31.07.26.xlsx",
    );
    assert.equal(detected.documentType, "flujo_efectivo");
    assert.equal(detected.persistable, true);
    assert.equal(detected.selectedProfileId, COMPAC_FLUJO_EFECTIVO_PROFILE.id);
    assert.equal(detected.inferredPeriodo, 7);
    assert.equal(detected.inferredAnio, 2026);
    assert.match(detected.notes[0] ?? "", /se persistirá tesorería/);
  });

  it("el auxiliar de cuentas infiere el periodo del rango, no la fecha de impresión", async () => {
    const buf = readFileSync(
      path.resolve("Data_ejemplo/06. Movimientos auxiliares del catalogo 31.07.26 (MXN).xlsx"),
    );
    const detected = await detectDocument(
      buf as unknown as Buffer,
      "06. Movimientos auxiliares del catalogo 31.07.26 (MXN).xlsx",
    );
    assert.equal(detected.documentType, "auxiliar_cuentas");
    assert.equal(detected.persistable, true);
    // El encabezado trae "Fecha: 25/Ago/2026" (impresión) antes del rango del reporte.
    assert.equal(detected.inferredPeriodo, 7);
    assert.equal(detected.inferredAnio, 2026);
  });

  it("BUILTIN_PROFILES incluye el perfil de flujo de efectivo con sus tokens", () => {
    const flujo = BUILTIN_PROFILES.find((profile) => profile.profileKey === "compac/flujo-efectivo");
    assert.ok(flujo, "falta compac/flujo-efectivo en BUILTIN_PROFILES");
    assert.equal(flujo.documentType, "flujo_efectivo");
    assert.ok(flujo.flujoConfig, "el perfil de flujo requiere flujoConfig");
  });

  it("el builtin Compac declara roles de cuenta y 4101 nunca es cliente", () => {
    const balanza = BUILTIN_PROFILES.find((profile) => profile.profileKey === "compac/balanza");
    assert.ok(balanza, "falta compac/balanza en BUILTIN_PROFILES");
    const roles = balanza.accountRoles;
    assert.ok(roles?.clientes, "el perfil Compac requiere accountRoles.clientes");
    assert.deepEqual(roles.clientes.prefixes, ["1105", "105"]);
    assert.ok(roles.clientes.nameTokens?.includes("clientes"));
    assert.ok(
      roles.clientes.prefixes.every((prefix) => !"4101".startsWith(prefix) && !prefix.startsWith("4")),
      "ningún prefijo de clientes puede cubrir cuentas 4xxx (ingreso)",
    );
    assert.ok(roles.ingresos?.prefixes.includes("4"));
  });

  it("resolveBatchPeriod: un flujo solo maneja el periodo del archivo", () => {
    const flujo = preview({
      documentType: "flujo_efectivo",
      inferredPeriodo: 7,
      inferredAnio: 2026,
      selectedProfileId: COMPAC_FLUJO_EFECTIVO_PROFILE.id,
    });
    assert.deepEqual(
      resolveBatchPeriod([flujo], { periodo: 5, anio: 2026 }, true),
      { periodo: 7, anio: 2026 },
    );
    assert.deepEqual(
      resolveBatchPeriod([flujo], { periodo: 5, anio: 2026 }, false),
      { periodo: 7, anio: 2026 },
    );
    assert.deepEqual(
      resolveBatchPeriod([flujo], { periodo: 7, anio: 2026 }, false),
      { periodo: 7, anio: 2026 },
    );
  });

  it("rechaza extensión o firma OOXML falsa", () => {
    assert.throws(
      () => validateWorkbookContainer(Buffer.from("PK archivo falso"), "falso.xlsx"),
      /corrupto|OOXML/,
    );
    assert.throws(
      () => validateWorkbookContainer(Buffer.from("texto"), "falso.csv"),
      /xlsx/,
    );
    assert.throws(
      () => validateWorkbookContainer(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        "cifrado.xlsx",
      ),
      /cifrado/,
    );
    assert.throws(
      () => validateWorkbookContainer(
        Buffer.from("PK00"),
        "grande.xlsx",
        { ...getIngestLimits(), maxFileBytes: 1 },
      ),
      /límite/,
    );
  });

  it("partida doble full vs balance_only", () => {
    const rows = [
      { row: 2, debe: 100, haber: 0, categoriaMaestra: "Activo" as const },
      { row: 3, debe: 0, haber: 100, categoriaMaestra: "Pasivo" as const },
      { row: 4, debe: 40, haber: 0, categoriaMaestra: "OpEx" as const },
    ];
    assert.equal(collectPartidaDobleIssues(rows, "full").length, 1);
    assert.equal(collectPartidaDobleIssues(rows, "balance_only").length, 0);
    assert.equal(collectPartidaDobleIssues(rows, "off")[0]?.severity, "WARNING");
  });

  it("leafOnly descarta cuentas padre", () => {
    const leaves = selectLeafCodes([
      "1102-0000-0000-0000",
      "1102-0001-0001-0000",
      "4101-0001-0000-0000",
    ]);
    assert.equal(leaves.has("1102-0000-0000-0000"), false);
    assert.equal(leaves.has("1102-0001-0001-0000"), true);
  });
});
