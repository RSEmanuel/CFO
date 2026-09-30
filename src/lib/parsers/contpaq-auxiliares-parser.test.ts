import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { nearlyEqual, round2 } from "@/services/money";
import {
  parseContpaqAuxiliares,
  persistCarteraContpaq,
  type CarteraPersistenceClient,
  type ContpaqAuxiliaresParseResult,
} from "./contpaq-auxiliares-parser";

const FIXTURE_MXN = path.resolve(
  "Data_ejemplo/06. Movimientos auxiliares del catalogo 31.07.26 (MXN).xlsx",
);
const FIXTURE_USD = path.resolve(
  "Data_ejemplo/07. Movimientos auxiliares del catalogo 31.07.26 (USD).xlsx",
);

function parseFixture(file: string): ContpaqAuxiliaresParseResult {
  return parseContpaqAuxiliares(readFileSync(file), { filename: path.basename(file) });
}

function createMockClient() {
  const movimientos: Array<Record<string, unknown>> = [];
  const resumen = new Map<string, Record<string, unknown>>();
  const deleteManyCalls: Array<{ tenantId: string; anio: number; periodo: number; moneda: string; idCuentaIn: string[] }> = [];
  let upsertCalls = 0;

  const client: CarteraPersistenceClient = {
    auxiliarMovimiento: {
      async deleteMany(args) {
        deleteManyCalls.push({
          tenantId: args.where.tenantId,
          anio: args.where.anio,
          periodo: args.where.periodo,
          moneda: args.where.moneda,
          idCuentaIn: args.where.idCuenta.in,
        });
        const ids = new Set(args.where.idCuenta.in);
        for (let index = movimientos.length - 1; index >= 0; index -= 1) {
          const row = movimientos[index]!;
          if (
            row.tenantId === args.where.tenantId &&
            row.anio === args.where.anio &&
            row.periodo === args.where.periodo &&
            row.moneda === args.where.moneda &&
            ids.has(row.idCuenta as string)
          ) {
            movimientos.splice(index, 1);
          }
        }
      },
      async createMany(args) {
        movimientos.push(...args.data);
      },
    },
    auxiliarCuentaResumen: {
      async upsert(args) {
        upsertCalls += 1;
        const key = Object.values(args.where.tenantId_anio_periodo_moneda_idCuenta).join("|");
        resumen.set(key, { ...(resumen.get(key) ?? {}), ...args.create, ...args.update });
      },
    },
    $transaction(fn) {
      return fn(client);
    },
  };

  return { client, movimientos, resumen, deleteManyCalls, upsertCalls: () => upsertCalls };
}

test("fixture MXN: detecta periodo 2026-07 y moneda MXN del encabezado", () => {
  const result = parseFixture(FIXTURE_MXN);
  assert.equal(result.moneda, "MXN");
  assert.equal(result.periodo, 7);
  assert.equal(result.anio, 2026);
  assert.equal(result.summary?.moneda, "MXN");
  assert.equal(result.summary?.periodo, 7);
  assert.equal(result.summary?.anio, 2026);
  assert.deepEqual(
    result.warnings.filter((warning) => warning.severity === "ERROR"),
    [],
  );
});

test("fixture USD: detecta moneda USD del encabezado", () => {
  const result = parseFixture(FIXTURE_USD);
  assert.equal(result.moneda, "USD");
  assert.equal(result.periodo, 7);
  assert.equal(result.anio, 2026);
  assert.ok(result.items.length > 0);
});

test("items solo incluyen cuentas hoja 1105-* CLIENTE y 2101-* PROVEEDOR", () => {
  const result = parseFixture(FIXTURE_MXN);
  assert.ok(result.items.length > 0);
  for (const item of result.items) {
    const segments = item.accountNumber.split("-");
    if (item.type === "CLIENTE") {
      assert.equal(segments[0], "1105", `${item.accountNumber} no es subcuenta de clientes`);
    } else {
      assert.equal(segments[0], "2101", `${item.accountNumber} no es subcuenta de proveedores`);
    }
    // Nunca cuentas de mayor: algún segmento tras el primero es distinto de cero.
    assert.ok(
      segments.slice(1).some((segment) => !/^0+$/.test(segment)),
      `${item.accountNumber} es cuenta de mayor`,
    );
  }
  assert.ok(!result.items.some((item) => item.accountNumber === "1105-0000-0000-0000"));
  assert.ok(!result.items.some((item) => item.accountNumber === "2101-0000-0000-0000"));
  // Cuentas con "cliente" en el nombre pero fuera del prefijo (IVA retenido, anticipos) no son cartera.
  assert.ok(!result.items.some((item) => item.accountNumber.startsWith("1108-")));
  assert.ok(!result.items.some((item) => item.accountNumber.startsWith("2306-")));

  const clientes = result.items.filter((item) => item.type === "CLIENTE");
  const proveedores = result.items.filter((item) => item.type === "PROVEEDOR");
  assert.equal(clientes.length, 98);
  assert.equal(proveedores.length, 9);
  const gemalto = proveedores.find((item) => item.accountNumber === "2101-0001-0002-0000");
  assert.ok(gemalto, "GEMALTO debe aparecer como proveedor");
  assert.equal(gemalto.entityName, "GEMALTO MÉXICO S.A. DE C.V.");
  assert.ok(nearlyEqual(gemalto.saldoPendiente, 4318493.02));
});

test("summary cuadra con la suma de los items", () => {
  const result = parseFixture(FIXTURE_MXN);
  const summary = result.summary;
  assert.ok(summary, "el fixture debe producir summary");
  const clientes = result.items.filter((item) => item.type === "CLIENTE");
  const proveedores = result.items.filter((item) => item.type === "PROVEEDOR");

  const sum = (rows: typeof result.items, pick: (item: (typeof result.items)[number]) => number) =>
    round2(rows.reduce((total, item) => total + pick(item), 0));

  assert.ok(nearlyEqual(summary.totalCxCPendientes, sum(clientes, (item) => item.saldoPendiente)));
  assert.ok(nearlyEqual(summary.totalCobradoEnMes, sum(clientes, (item) => item.pagadoEnMes)));
  assert.ok(nearlyEqual(summary.totalCxPPendientes, sum(proveedores, (item) => item.saldoPendiente)));
  assert.ok(
    nearlyEqual(summary.totalPagadoProveedoresEnMes, sum(proveedores, (item) => item.pagadoEnMes)),
  );
  assert.equal(summary.clientesCount, clientes.length);
  assert.equal(summary.proveedoresCount, proveedores.length);

  // Clientes: facturado = cargos, cobrado = abonos. Proveedores: al revés.
  const resumenPorCuenta = new Map(result.resumen.map((row) => [row.idCuenta, row]));
  for (const item of result.items) {
    const row = resumenPorCuenta.get(item.accountNumber);
    assert.ok(row, `falta ${item.accountNumber} en resumen`);
    if (item.type === "CLIENTE") {
      assert.ok(nearlyEqual(item.facturadoOCompradoEnMes, row.cargos));
      assert.ok(nearlyEqual(item.pagadoEnMes, row.abonos));
    } else {
      assert.ok(nearlyEqual(item.facturadoOCompradoEnMes, row.abonos));
      assert.ok(nearlyEqual(item.pagadoEnMes, row.cargos));
    }
    assert.ok(nearlyEqual(item.saldoPendiente, row.saldoFinal));
  }
});

test("movimientosCount por cuenta coincide con los movimientos parseados", () => {
  const result = parseFixture(FIXTURE_MXN);
  const countByAccount = new Map<string, number>();
  for (const movimiento of result.movimientos) {
    countByAccount.set(movimiento.idCuenta, (countByAccount.get(movimiento.idCuenta) ?? 0) + 1);
  }
  for (const item of result.items) {
    assert.equal(
      item.movimientosCount,
      countByAccount.get(item.accountNumber) ?? 0,
      `movimientosCount de ${item.accountNumber}`,
    );
  }
  // Toda cuenta con movimientos debe ser de cartera (el parser solo conserva 1105/2101).
  for (const idCuenta of countByAccount.keys()) {
    assert.ok(result.items.some((item) => item.accountNumber === idCuenta));
  }
});

test("persistCarteraContpaq es idempotente: segunda ejecución no duplica", async () => {
  const result = parseFixture(FIXTURE_MXN);
  const mock = createMockClient();
  const tenantId = "tenant-test";

  const first = await persistCarteraContpaq(mock.client, tenantId, result);
  assert.equal(first.movimientos, result.movimientos.length);
  assert.equal(first.cuentas, result.items.length);
  const movimientosTrasPrimera = mock.movimientos.length;
  const resumenTrasPrimera = mock.resumen.size;
  assert.equal(movimientosTrasPrimera, result.movimientos.length);
  assert.equal(resumenTrasPrimera, result.resumen.length);

  const second = await persistCarteraContpaq(mock.client, tenantId, result);
  assert.equal(second.movimientos, first.movimientos);
  assert.equal(second.cuentas, first.cuentas);
  assert.equal(mock.movimientos.length, movimientosTrasPrimera, "no debe duplicar movimientos");
  assert.equal(mock.resumen.size, resumenTrasPrimera, "no debe duplicar resúmenes");

  // deleteMany se scopia a las cuentas del archivo en cada corrida (una por ejecución).
  assert.equal(mock.deleteManyCalls.length, 2);
  const expectedIds = [...new Set(result.items.map((item) => item.accountNumber))].sort();
  for (const call of mock.deleteManyCalls) {
    assert.equal(call.tenantId, tenantId);
    assert.equal(call.anio, 2026);
    assert.equal(call.periodo, 7);
    assert.equal(call.moneda, "MXN");
    assert.deepEqual([...call.idCuentaIn].sort(), expectedIds);
  }

  // Un upsert por cuenta por ejecución.
  assert.equal(mock.upsertCalls(), result.resumen.length * 2);
});
