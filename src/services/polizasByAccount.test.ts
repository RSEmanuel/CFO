import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../auth/errors";
import {
  buildMovimientosWhere,
  matchesCuentaPrefix,
  orderMovimientosCronologico,
  parseCuentaPrefixes,
  summarizeMovimientos,
} from "./polizasByAccountService";

describe("matchesCuentaPrefix: prefijo por segmentos", () => {
  it("matchea la cuenta exacta y sus subcuentas con separador", () => {
    assert.equal(matchesCuentaPrefix("501", "501"), true);
    assert.equal(matchesCuentaPrefix("501-01-002", "501"), true);
    assert.equal(matchesCuentaPrefix("501.01.002", "501"), true);
    assert.equal(matchesCuentaPrefix("6101-0001-0000-0000", "6101"), true);
    assert.equal(matchesCuentaPrefix("1102-0001-0001-0000", "1102-0001"), true);
  });

  it("no matchea prefijos de dígitos ajenos (501 ≠ 5010 ni 5101)", () => {
    assert.equal(matchesCuentaPrefix("5010", "501"), false);
    assert.equal(matchesCuentaPrefix("5010-01", "501"), false);
    assert.equal(matchesCuentaPrefix("5101-0001-0000-0000", "501"), false);
    assert.equal(matchesCuentaPrefix("5011-01", "501"), false);
  });

  it("no matchea padres ni cuentas ajenas; prefijo vacío nunca matchea", () => {
    assert.equal(matchesCuentaPrefix("501", "501-01"), false);
    assert.equal(matchesCuentaPrefix("6101-0001-0000-0000", "6201"), false);
    assert.equal(matchesCuentaPrefix("501-01", ""), false);
  });
});

describe("parseCuentaPrefixes", () => {
  it("acepta un prefijo simple y listas separadas por coma", () => {
    assert.deepEqual(parseCuentaPrefixes("6101"), ["6101"]);
    assert.deepEqual(parseCuentaPrefixes("4101, 4103 ,4201"), ["4101", "4103", "4201"]);
  });

  it("deduplica y descarta entradas vacías", () => {
    assert.deepEqual(parseCuentaPrefixes("6101,,6101, 6101 "), ["6101"]);
  });

  it("rechaza entradas vacías o con caracteres no contables", () => {
    assert.throws(() => parseCuentaPrefixes(""), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.equal(error.status, 400);
      return true;
    });
    assert.throws(() => parseCuentaPrefixes("  ,  "), AppError);
    assert.throws(() => parseCuentaPrefixes("6101; DROP TABLE"), AppError);
    assert.throws(() => parseCuentaPrefixes("ABC"), AppError);
  });
});

describe("buildMovimientosWhere: aislamiento por tenant", () => {
  it("siempre inyecta tenantId, anio y periodo en el where", () => {
    const where = buildMovimientosWhere("tenant-a", 2026, 7, ["6101"]);
    assert.equal(where.tenantId, "tenant-a");
    assert.equal(where.anio, 2026);
    assert.equal(where.periodo, 7);
    // Un tenant ajeno produce un where distinto: sus filas nunca se mezclan.
    const otro = buildMovimientosWhere("tenant-b", 2026, 7, ["6101"]);
    assert.notEqual(where.tenantId, otro.tenantId);
  });

  it("cubre exacta y subcuentas con ambos separadores por cada prefijo", () => {
    const where = buildMovimientosWhere("t", 2026, 7, ["501"]);
    assert.deepEqual(where.OR, [
      { codigoCuenta: "501" },
      { codigoCuenta: { startsWith: "501-" } },
      { codigoCuenta: { startsWith: "501." } },
    ]);
  });

  it("expande listas de prefijos (rubros multi-segmento del ER)", () => {
    const where = buildMovimientosWhere("t", 2026, 7, ["7102", "7104"]);
    assert.equal(where.OR.length, 6);
    assert.deepEqual(where.OR[0], { codigoCuenta: "7102" });
    assert.deepEqual(where.OR[3], { codigoCuenta: "7104" });
  });
});

describe("orderMovimientosCronologico", () => {
  const mov = (
    fecha: string,
    tipoPoliza: string,
    numeroPoliza: number,
    numeroMovimiento: number,
  ) => ({ fecha, tipoPoliza, numeroPoliza, numeroMovimiento });

  it("ordena por fecha de póliza y desempata por tipo, póliza y movimiento", () => {
    const rows = [
      mov("2026-07-15", "Diario", 3, 2),
      mov("2026-07-02", "Egresos", 5, 1),
      mov("2026-07-15", "Diario", 3, 1),
      mov("2026-07-15", "Diario", 2, 4),
      mov("2026-07-15", "Egresos", 1, 1),
    ];
    const ordered = orderMovimientosCronologico(rows);
    assert.deepEqual(
      ordered.map((row) => `${row.fecha}|${row.tipoPoliza}|${row.numeroPoliza}|${row.numeroMovimiento}`),
      [
        "2026-07-02|Egresos|5|1",
        "2026-07-15|Diario|2|4",
        "2026-07-15|Diario|3|1",
        "2026-07-15|Diario|3|2",
        "2026-07-15|Egresos|1|1",
      ],
    );
  });

  it("no muta el arreglo de entrada", () => {
    const rows = [mov("2026-07-15", "Diario", 3, 2), mov("2026-07-02", "Egresos", 5, 1)];
    const copia = [...rows];
    orderMovimientosCronologico(rows);
    assert.deepEqual(rows, copia);
  });
});

describe("summarizeMovimientos", () => {
  it("saldoNeto = cargos − abonos (positivo = saldo deudor del periodo)", () => {
    const resumen = summarizeMovimientos([
      { cargo: 100.1, abono: 0 },
      { cargo: 50.05, abono: 0 },
      { cargo: 0, abono: 30 },
    ]);
    assert.equal(resumen.totalCargos, 150.15);
    assert.equal(resumen.totalAbonos, 30);
    assert.equal(resumen.saldoNeto, 120.15);
    assert.equal(resumen.movimientos, 3);
  });

  it("saldoNeto negativo = saldo acreedor; redondea a centavos", () => {
    const resumen = summarizeMovimientos([
      { cargo: 0, abono: 200.005 },
      { cargo: 99.999, abono: 0 },
    ]);
    assert.equal(resumen.saldoNeto, -100.01);
  });

  it("cuenta sin movimientos devuelve ceros", () => {
    const resumen = summarizeMovimientos([]);
    assert.deepEqual(resumen, { totalCargos: 0, totalAbonos: 0, saldoNeto: 0, movimientos: 0 });
  });
});
