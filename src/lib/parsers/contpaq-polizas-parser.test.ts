import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";
import { nearlyEqual, round2 } from "@/services/money";
import {
  parseContpaqPolizas,
  persistPolizasContpaq,
  type ContpaqPolizasParseResult,
  type PolizasPersistenceClient,
} from "./contpaq-polizas-parser";

const FIXTURE_JUL = path.resolve("Data_ejemplo/08. Diarios y Polizas 31.07.26.xlsx");
const FIXTURE_JUN = path.resolve("Data_ejemplo/08.23 Diarios y Polizas 300626.xlsx");

function parseFixture(file: string): ContpaqPolizasParseResult {
  return parseContpaqPolizas(readFileSync(file), { filename: path.basename(file) });
}

type GridCell = string | number | null;

function buildBuffer(rows: GridCell[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Diarios y Pólizas");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function createMockClient() {
  const polizas: Array<Record<string, unknown>> = [];
  const movimientos: Array<Record<string, unknown>> = [];
  const deleteCalls: Array<{ delegate: string; tenantId: string; anio: number; periodo: number }> = [];

  const scopedDelete = (store: Array<Record<string, unknown>>, delegate: string) =>
    async (args: { where: { tenantId: string; anio: number; periodo: number } }) => {
      deleteCalls.push({
        delegate,
        tenantId: args.where.tenantId,
        anio: args.where.anio,
        periodo: args.where.periodo,
      });
      for (let index = store.length - 1; index >= 0; index -= 1) {
        const row = store[index]!;
        if (
          row.tenantId === args.where.tenantId &&
          row.anio === args.where.anio &&
          row.periodo === args.where.periodo
        ) {
          store.splice(index, 1);
        }
      }
    };

  const client: PolizasPersistenceClient = {
    poliza: {
      deleteMany: scopedDelete(polizas, "poliza"),
      async createMany(args) {
        polizas.push(...args.data);
      },
    },
    polizaMovimiento: {
      deleteMany: scopedDelete(movimientos, "polizaMovimiento"),
      async createMany(args) {
        movimientos.push(...args.data);
      },
    },
    $transaction(fn) {
      return fn(client);
    },
  };

  return { client, polizas, movimientos, deleteCalls };
}

test("fixture jul-2026: periodo, conteos y totales contra el pie del reporte", () => {
  const result = parseFixture(FIXTURE_JUL);
  assert.equal(result.periodo, 7);
  assert.equal(result.anio, 2026);
  assert.equal(result.polizas.length, 112);
  assert.equal(result.movimientos.length, 749);
  assert.equal(result.esperadasPolizas, 112);
  assert.equal(result.esperadosMovimientos, 749);
  assert.equal(result.descuadradas, 0);
  assert.deepEqual(
    result.warnings.filter((warning) => warning.severity === "ERROR"),
    [],
  );
  // El "Total General" del reporte es 24,829,130.74 por lado.
  const sumCargos = round2(result.polizas.reduce((sum, row) => sum + row.totalCargos, 0));
  const sumAbonos = round2(result.polizas.reduce((sum, row) => sum + row.totalAbonos, 0));
  assert.ok(nearlyEqual(sumCargos, 24829130.74));
  assert.ok(nearlyEqual(sumAbonos, 24829130.74));
});

test("bloques: encabezado, movimientos y concepto de la primera póliza", () => {
  const result = parseFixture(FIXTURE_JUL);
  const primera = result.polizas[0]!;
  assert.equal(primera.tipo, "Ingresos");
  assert.equal(primera.numero, 1);
  assert.equal(primera.fecha.toISOString().slice(0, 10), "2026-07-01");
  assert.ok(primera.concepto.startsWith("Cobro F-471da135"));
  assert.equal(primera.movimientosCount, 4);
  assert.ok(nearlyEqual(primera.totalCargos, 139040.51));
  assert.ok(nearlyEqual(primera.totalAbonos, 139040.51));
  assert.equal(primera.cuadrada, true);

  const movimientos = result.movimientos.filter(
    (row) => row.tipoPoliza === "Ingresos" && row.numeroPoliza === 1,
  );
  assert.equal(movimientos.length, 4);
  const cobro = movimientos.find((row) => row.numeroMovimiento === 1)!;
  assert.equal(cobro.codigoCuenta, "1105-0001-0040-0000");
  assert.equal(cobro.nombreCuenta, "BANKAOOL SA INSTITUCION");
  assert.equal(cobro.referencia, "P-2867");
  assert.ok(cobro.concepto.startsWith("Cobro F-471da135"));
  assert.ok(nearlyEqual(cobro.cargo, 0));
  assert.ok(nearlyEqual(cobro.abono, 122187.11));
});

test("totales: cada póliza cuadra sus movimientos contra el Total póliza reportado", () => {
  const result = parseFixture(FIXTURE_JUL);
  const sumas = new Map<string, { cargos: number; abonos: number; count: number }>();
  for (const mov of result.movimientos) {
    const key = `${mov.tipoPoliza}:${mov.numeroPoliza}`;
    const entry = sumas.get(key) ?? { cargos: 0, abonos: 0, count: 0 };
    entry.cargos = round2(entry.cargos + mov.cargo);
    entry.abonos = round2(entry.abonos + mov.abono);
    entry.count += 1;
    sumas.set(key, entry);
  }
  for (const poliza of result.polizas) {
    const entry = sumas.get(`${poliza.tipo}:${poliza.numero}`)!;
    assert.ok(entry, `faltan movimientos de ${poliza.tipo} ${poliza.numero}`);
    assert.ok(nearlyEqual(entry.cargos, poliza.totalCargos), `cargos de ${poliza.tipo} ${poliza.numero}`);
    assert.ok(nearlyEqual(entry.abonos, poliza.totalAbonos), `abonos de ${poliza.tipo} ${poliza.numero}`);
    assert.equal(entry.count, poliza.movimientosCount);
  }
  // Las filas CFDI ("Nómina" 2026 con folio numérico) no deben colarse como pólizas.
  assert.ok(!result.polizas.some((row) => row.tipo === "Nómina"));
});

test("fixture jun-2026: incluye la póliza vacía Egresos 6 (total 0/0)", () => {
  const result = parseFixture(FIXTURE_JUN);
  assert.equal(result.periodo, 6);
  assert.equal(result.anio, 2026);
  assert.equal(result.polizas.length, 95);
  assert.equal(result.esperadasPolizas, 95);
  const vacia = result.polizas.find((row) => row.tipo === "Egresos" && row.numero === 6);
  assert.ok(vacia, "la póliza vacía Egresos 6 debe persistirse");
  assert.equal(vacia.movimientosCount, 0);
  assert.ok(nearlyEqual(vacia.totalCargos, 0));
  assert.ok(nearlyEqual(vacia.totalAbonos, 0));
  assert.equal(vacia.cuadrada, true);
});

test("póliza descuadrada: se marca cuadrada=false, se reporta y se conserva", () => {
  const buffer = buildBuffer([
    ["EMPRESA SA DE CV"],
    ["Impreso de pólizas del 01/Jul/2026 al 31/Jul/2026"],
    ["Moneda: Peso Mexicano"],
    [],
    ["Fecha", "Tipo", "Número", "Concepto"],
    ["01/Jul/2026", "Diario", 7, "Ajuste descuadrado"],
    [1, "X-1", "1101-01-001", "Bancos", null, null, 100, null],
    [null, null, null, "Cargo sin contraparte"],
    [null, "Cifra de Control", 999, null, null, "Total póliza :", 100, 0],
    [" "],
    [null, null, null, null, null, "Total al 01/Jul/2026 :", 100, 0],
    ["       Total de pólizas impresas          : 1       "],
    ["       Total de movimientos impresos : 1       "],
  ]);
  const result = parseContpaqPolizas(buffer, { filename: "sintetico.xlsx" });
  assert.equal(result.polizas.length, 1);
  assert.equal(result.movimientos.length, 1);
  assert.equal(result.polizas[0]!.cuadrada, false);
  assert.equal(result.descuadradas, 1);
  assert.equal(result.movimientos[0]!.concepto, "Cargo sin contraparte");
  assert.ok(
    result.warnings.some(
      (warning) => warning.rule === "PARTIDA_DOBLE" && warning.message.includes("Diario 7"),
    ),
  );
});

test("las filas de la sección CFDI no se parsean como pólizas", () => {
  const buffer = buildBuffer([
    ["EMPRESA SA DE CV"],
    ["Impreso de pólizas del 01/Jul/2026 al 31/Jul/2026"],
    ["Moneda: Peso Mexicano"],
    [],
    ["Fecha", "Tipo", "Número", "Concepto"],
    ["02/Jul/2026", "Ingresos", 3, "Cobro factura"],
    [1, "F-9", "1105-01-001", "Cliente", null, null, null, 50],
    [2, "F-9", "1102-01-001", "Bancos", null, null, 50, null],
    [null, "Cifra de Control", 111, null, null, "Total póliza :", 50, 50],
    [" "],
    ["CFD/CFDI ASOCIADOS A LA PÓLIZA"],
    ["Emisión", "Tipo", "Serie", "Folio", "UUID", "RFC", "Razón Social", "Total"],
    // Falso positivo clásico: fecha + tipo + folio numérico dentro de la sección CFDI.
    ["16/Jul/2026", "Nómina", 2026, 13, "uuid", "RFC", "EMPLEADO", 100],
    ["16/Jul/2026", "Nómina", 2026, 13, "uuid2", "RFC2", "EMPLEADO2", 200],
    [null, null, null, null, null, null, "Total CFD/CFDI :", 300],
    ["       Total de pólizas impresas          : 1       "],
    ["       Total de movimientos impresos : 2       "],
  ]);
  const result = parseContpaqPolizas(buffer, { filename: "cfdi.xlsx" });
  assert.equal(result.polizas.length, 1);
  assert.equal(result.polizas[0]!.tipo, "Ingresos");
  assert.equal(result.movimientos.length, 2);
  assert.deepEqual(
    result.warnings.filter((warning) => warning.severity === "ERROR"),
    [],
  );
});

test("persistPolizasContpaq es idempotente: segunda ejecución no duplica", async () => {
  const result = parseFixture(FIXTURE_JUL);
  const mock = createMockClient();
  const tenantId = "tenant-test";

  const first = await persistPolizasContpaq(mock.client, tenantId, result);
  assert.equal(first.polizas, 112);
  assert.equal(first.movimientos, 749);
  assert.equal(first.descuadradas, 0);
  assert.equal(mock.polizas.length, 112);
  assert.equal(mock.movimientos.length, 749);

  const second = await persistPolizasContpaq(mock.client, tenantId, result);
  assert.equal(second.polizas, first.polizas);
  assert.equal(second.movimientos, first.movimientos);
  assert.equal(mock.polizas.length, 112, "no debe duplicar pólizas");
  assert.equal(mock.movimientos.length, 749, "no debe duplicar movimientos");

  // Cada corrida borra primero el periodo completo (movimientos y luego pólizas).
  assert.equal(mock.deleteCalls.length, 4);
  assert.equal(mock.deleteCalls[0]!.delegate, "polizaMovimiento");
  assert.equal(mock.deleteCalls[1]!.delegate, "poliza");
  for (const call of mock.deleteCalls) {
    assert.equal(call.tenantId, tenantId);
    assert.equal(call.anio, 2026);
    assert.equal(call.periodo, 7);
  }

  // Otro tenant no se ve afectado por el borrado scoped.
  await persistPolizasContpaq(mock.client, "tenant-otro", result);
  assert.equal(
    mock.polizas.filter((row) => row.tenantId === tenantId).length,
    112,
    "el tenant original conserva sus pólizas",
  );
  assert.equal(
    mock.polizas.filter((row) => row.tenantId === "tenant-otro").length,
    112,
  );
});
