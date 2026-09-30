import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compacHistoryPeriods,
  generateCompacHistory,
  historyPeriodKey,
  type CompacAnchorRow,
} from "./compacHistoryGenerator";
import { MONEY_TOLERANCE, round2 } from "./money";

const ANCHOR: CompacAnchorRow[] = [
  {
    idCuenta: "A-001",
    nombreCuenta: "Activo prueba",
    categoriaMaestra: "Activo",
    saldoInicial: 5_000,
    debe: 1_000,
    haber: 200,
    saldoFinal: 5_800,
    montoPresupuestado: 99,
    depreciacionAmortizacion: false,
    periodo: 7,
    anio: 2026,
  },
  {
    idCuenta: "P-001",
    nombreCuenta: "Patrimonio prueba",
    categoriaMaestra: "Patrimonio",
    saldoInicial: -4_200,
    debe: 100,
    haber: 700,
    saldoFinal: -4_800,
    montoPresupuestado: 0,
    depreciacionAmortizacion: false,
    periodo: 7,
    anio: 2026,
  },
  {
    idCuenta: "G-001",
    nombreCuenta: "Gasto prueba",
    categoriaMaestra: "OpEx",
    saldoInicial: 0,
    debe: 300,
    haber: 500,
    saldoFinal: -200,
    montoPresupuestado: 50,
    depreciacionAmortizacion: true,
    periodo: 7,
    anio: 2026,
  },
];

describe("generateCompacHistory", () => {
  it("es determinista y genera exactamente los 23 meses solicitados", () => {
    const first = generateCompacHistory(ANCHOR);
    const second = generateCompacHistory(ANCHOR);

    assert.deepEqual(first, second);
    assert.equal(first.months.length, 23);
    assert.equal(first.rows.length, 23 * ANCHOR.length);
    assert.equal(historyPeriodKey(first.rows[0]!.anio, first.rows[0]!.periodo), "2024-08");
    assert.equal(
      historyPeriodKey(first.rows.at(-1)!.anio, first.rows.at(-1)!.periodo),
      "2026-06",
    );
  });

  it("copia la identidad, no inventa códigos, varía movimientos y cuadra cada mes", () => {
    const result = generateCompacHistory(ANCHOR);
    const expectedIds = new Set(ANCHOR.map((row) => row.idCuenta));
    const anchorById = new Map(ANCHOR.map((row) => [row.idCuenta, row]));

    for (const period of compacHistoryPeriods()) {
      const monthRows = result.rows.filter(
        (row) => row.anio === period.anio && row.periodo === period.periodo,
      );
      assert.deepEqual(new Set(monthRows.map((row) => row.idCuenta)), expectedIds);
      for (const row of monthRows) {
        const anchor = anchorById.get(row.idCuenta)!;
        assert.equal(row.nombreCuenta, anchor.nombreCuenta);
        assert.equal(row.categoriaMaestra, anchor.categoriaMaestra);
        assert.equal(row.depreciacionAmortizacion, anchor.depreciacionAmortizacion);
        assert.equal(row.montoPresupuestado, 0);
      }
      const debe = round2(monthRows.reduce((sum, row) => sum + row.debe, 0));
      const haber = round2(monthRows.reduce((sum, row) => sum + row.haber, 0));
      assert.ok(Math.abs(debe - haber) <= MONEY_TOLERANCE);
    }

    const activoMovements = new Set(
      result.rows
        .filter((row) => row.idCuenta === "A-001")
        .map((row) => `${row.debe.toFixed(2)}|${row.haber.toFixed(2)}`),
    );
    assert.ok(activoMovements.size > 1);
  });

  it("mantiene PyG en cero y encadena los saldos de balance hasta julio", () => {
    const result = generateCompacHistory(ANCHOR);
    for (const row of result.rows) {
      assert.equal(row.saldoFinal, round2(row.saldoInicial + row.debe - row.haber));
      if (row.categoriaMaestra === "OpEx") {
        assert.equal(row.saldoInicial, 0);
      }
    }

    const balanceRows = result.rows.filter((row) =>
      ["Activo", "Pasivo", "Patrimonio"].includes(row.categoriaMaestra),
    );
    for (const idCuenta of ["A-001", "P-001"]) {
      const accountRows = balanceRows
        .filter((row) => row.idCuenta === idCuenta)
        .sort((a, b) => a.anio - b.anio || a.periodo - b.periodo);
      for (let index = 0; index < accountRows.length - 1; index += 1) {
        assert.equal(accountRows[index]!.saldoFinal, accountRows[index + 1]!.saldoInicial);
      }
      assert.equal(accountRows.at(-1)!.saldoFinal, ANCHOR.find((row) => row.idCuenta === idCuenta)!.saldoInicial);
    }
  });
});
