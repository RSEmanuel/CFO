import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CARTERA_SALDO_UMBRAL,
  compareMovimientosCronologico,
  computeRunningBalance,
  filterCarteraPorUmbral,
  isCuentaConSaldoPendiente,
  type CarteraMovimientoInput,
} from "./cobranzaCarteraMovimientos";

function mov(fecha: string, cargos: number, abonos: number, extra?: Partial<CarteraMovimientoInput>): CarteraMovimientoInput {
  return {
    fecha: new Date(`${fecha}T00:00:00.000Z`),
    tipoPoliza: extra?.tipoPoliza ?? "Diario",
    numeroPoliza: extra?.numeroPoliza ?? "1",
    cargos,
    abonos,
  };
}

describe("cobranzaCarteraMovimientos: umbral de cuentas saldadas", () => {
  it("0.99 oculto, 1.00 visible, −0.50 oculto, −1.00 visible", () => {
    assert.equal(isCuentaConSaldoPendiente(0.99), false);
    assert.equal(isCuentaConSaldoPendiente(1.0), true);
    assert.equal(isCuentaConSaldoPendiente(-0.5), false);
    assert.equal(isCuentaConSaldoPendiente(-1.0), true);
  });

  it("el residuo de centavos (0.04) queda oculto y el cero exacto también", () => {
    assert.equal(isCuentaConSaldoPendiente(0.04), false);
    assert.equal(isCuentaConSaldoPendiente(0), false);
    assert.equal(isCuentaConSaldoPendiente(-0.01), false);
  });

  it("filterCarteraPorUmbral oculta por defecto y muestra todo con el toggle", () => {
    const items = [
      { accountNumber: "a", saldoPendiente: 1500 },
      { accountNumber: "b", saldoPendiente: 0.04 },
      { accountNumber: "c", saldoPendiente: -0.5 },
      { accountNumber: "d", saldoPendiente: -2200.75 },
    ];
    const visibles = filterCarteraPorUmbral(items, false);
    assert.deepEqual(
      visibles.map((item) => item.accountNumber),
      ["a", "d"],
    );
    assert.equal(filterCarteraPorUmbral(items, true).length, 4);
    assert.equal(CARTERA_SALDO_UMBRAL, 1.0);
  });
});

describe("cobranzaCarteraMovimientos: running balance", () => {
  it("cliente acumula cargo − abono desde el saldo inicial y cuadra con el saldo final", () => {
    // Caso real 2026-07: 1105-0001-0037-0000 BANCO MERCANTIL DEL NORTE.
    const movimientos = [
      mov("2026-07-08", 0, 462341.55, { tipoPoliza: "Ingresos", numeroPoliza: "16" }),
      mov("2026-07-09", 577198.61, 0, { tipoPoliza: "Diario", numeroPoliza: "4" }),
      mov("2026-07-15", 0, 69630.8, { tipoPoliza: "Ingresos", numeroPoliza: "17" }),
      mov("2026-07-22", 0, 577198.61, { tipoPoliza: "Ingresos", numeroPoliza: "18" }),
    ];
    const detalle = computeRunningBalance("CLIENTE", 818530.19, movimientos);
    assert.deepEqual(
      detalle.map((item) => item.saldoAcumulado),
      [356188.64, 933387.25, 863756.45, 286557.84],
    );
    assert.equal(detalle.at(-1)?.saldoAcumulado, 286557.84);
  });

  it("proveedor acumula abono − cargo (naturaleza acreedora) y cuadra con el saldo final", () => {
    // Caso real 2026-07 agregado: 2101-0001-0002-0000 (SI 6,315,166.72,
    // cargos 3,188,722.87, abonos 1,192,049.17 → SF 4,318,493.02).
    const movimientos = [
      mov("2026-07-10", 3188722.87, 0),
      mov("2026-07-20", 0, 1192049.17),
    ];
    const detalle = computeRunningBalance("PROVEEDOR", 6315166.72, movimientos);
    assert.deepEqual(
      detalle.map((item) => item.saldoAcumulado),
      [3126443.85, 4318493.02],
    );
    assert.equal(detalle.at(-1)?.saldoAcumulado, 4318493.02);
  });

  it("acepta cargos negativos (reclasificaciones) y redondea a centavos en cada paso", () => {
    const detalle = computeRunningBalance("CLIENTE", 100, [
      mov("2026-07-01", 33.33, 0),
      mov("2026-07-02", 33.33, 0),
      mov("2026-07-03", -1000, 0),
    ]);
    assert.deepEqual(
      detalle.map((item) => item.saldoAcumulado),
      [133.33, 166.66, -833.34],
    );
  });

  it("sin movimientos el saldo final es el saldo inicial", () => {
    assert.deepEqual(computeRunningBalance("CLIENTE", 250.5, []), []);
    assert.deepEqual(computeRunningBalance("PROVEEDOR", 250.5, []), []);
  });
});

describe("cobranzaCarteraMovimientos: orden cronológico", () => {
  it("ordena por fecha y desempata por tipo y número de póliza", () => {
    const movimientos = [
      mov("2026-07-31", 10, 0, { tipoPoliza: "Diario", numeroPoliza: "40" }),
      mov("2026-07-06", 20, 0, { tipoPoliza: "Egresos", numeroPoliza: "10" }),
      mov("2026-07-06", 30, 0, { tipoPoliza: "Egresos", numeroPoliza: "3" }),
      mov("2026-07-06", 40, 0, { tipoPoliza: "Diario", numeroPoliza: "1" }),
    ];
    const ordenados = [...movimientos].sort(compareMovimientosCronologico);
    assert.deepEqual(
      ordenados.map((item) => `${item.fecha.toISOString().slice(0, 10)} ${item.tipoPoliza}-${item.numeroPoliza}`),
      [
        "2026-07-06 Diario-1",
        "2026-07-06 Egresos-10",
        "2026-07-06 Egresos-3",
        "2026-07-31 Diario-40",
      ],
    );
  });

  it("el saldo final no depende del orden intra-día", () => {
    const base = [
      mov("2026-07-06", 100, 0, { numeroPoliza: "1" }),
      mov("2026-07-06", 0, 40, { numeroPoliza: "2" }),
      mov("2026-07-07", 25, 0, { numeroPoliza: "3" }),
    ];
    const invertido = [...base].reverse();
    const finalAsc = computeRunningBalance("CLIENTE", 0, [...base].sort(compareMovimientosCronologico)).at(-1)?.saldoAcumulado;
    const finalInv = computeRunningBalance("CLIENTE", 0, [...invertido].sort(compareMovimientosCronologico)).at(-1)?.saldoAcumulado;
    assert.equal(finalAsc, 85);
    assert.equal(finalInv, 85);
  });
});
