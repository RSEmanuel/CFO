import assert from "node:assert/strict";
import test from "node:test";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import type { ErCuentaRow } from "@/services/estadoOperativo";
import { buildFlujoLibre, type FlujoLibreSaldo } from "@/services/flujoLibre";

function pnl(idCuenta: string, nombreCuenta: string, debe: number, haber: number): ErCuentaRow {
  return { idCuenta, nombreCuenta, debe, haber };
}

function saldo(idCuenta: string, nombreCuenta: string, saldoFinal: number): FlujoLibreSaldo {
  return { idCuenta, nombreCuenta, saldoFinal };
}

const ROLES = COMPAC_ACCOUNT_ROLES;

test("aumento de CxC resta caja y aumento de CxP la suma; bancos y deuda no entran", () => {
  const mesActual = [
    pnl("4101-0001-0001-0000", "VENTAS", 0, 500),
    pnl("5101-0001-0001-0000", "COSTO", 200, 0),
    pnl("6301-0001-0000-0000", "DEPRECIACION", 20, 0),
  ];
  const anterior = [
    saldo("1105-0001-0001-0000", "CLIENTE ACME", 100),
    saldo("2101-0001-0001-0000", "PROVEEDOR", -40),
    saldo("1102-0001-0001-0000", "BBVA BANCOMER", 200),
    saldo("2106-0001-0000-0000", "TDC AMEX", -100),
  ];
  const actual = [
    saldo("1105-0001-0001-0000", "CLIENTE ACME", 150),
    saldo("2101-0001-0001-0000", "PROVEEDOR", -70),
    saldo("1102-0001-0001-0000", "BBVA BANCOMER", 260),
    saldo("2106-0001-0000-0000", "TDC AMEX", -180),
  ];

  const model = buildFlujoLibre({
    mesActual,
    saldosActual: actual,
    saldosAnterior: anterior,
    roles: ROLES,
  });

  assert.equal(model.utilidadNeta, 280);
  assert.equal(model.depreciacion, 20);
  assert.equal(model.flujoOperativoNeto, 280);
  assert.deepEqual(
    model.steps.map((step) => [step.key, step.kind, step.value, step.labelKey]),
    [
      ["utilidadNeta", "total", 280, "flujo.libre.utilidadNeta"],
      ["depreciacion", "increase", 20, "flujo.libre.depreciacion"],
      ["cxc", "decrease", 50, "flujo.libre.buckets.cxc.up"],
      ["cxp", "increase", 30, "flujo.libre.buckets.cxp.up"],
      ["flujoOperativo", "total", 280, "flujo.libre.flujoOperativo"],
    ],
  );
  assert.equal(model.insight?.bucket, "cxc");
  assert.equal(model.insight?.direction, "up");
  assert.equal(model.insight?.amount, 50);
});

test("bajar CxC mete caja y pagar proveedores la saca", () => {
  const model = buildFlujoLibre({
    mesActual: [pnl("4101-0001-0001-0000", "VENTAS", 0, 100)],
    saldosAnterior: [
      saldo("1105-0001-0001-0000", "CLIENTES", 100),
      saldo("2101-0001-0001-0000", "PROVEEDORES", -40),
    ],
    saldosActual: [
      saldo("1105-0001-0001-0000", "CLIENTES", 60),
      saldo("2101-0001-0001-0000", "PROVEEDORES", -10),
    ],
    roles: ROLES,
  });

  const cxc = model.steps.find((step) => step.key === "cxc");
  const cxp = model.steps.find((step) => step.key === "cxp");
  assert.equal(cxc?.kind, "increase");
  assert.equal(cxc?.value, 40);
  assert.equal(cxc?.labelKey, "flujo.libre.buckets.cxc.down");
  assert.equal(cxp?.kind, "decrease");
  assert.equal(cxp?.value, 30);
  assert.equal(cxp?.labelKey, "flujo.libre.buckets.cxp.down");
  assert.equal(model.flujoOperativoNeto, 110);
  assert.equal(model.insight?.bucket, "cxp");
});

test("no duplica la cuenta padre cuando la hoja ya está en la balanza", () => {
  const model = buildFlujoLibre({
    mesActual: [pnl("4101-0001-0001-0000", "VENTAS", 0, 10)],
    saldosAnterior: [
      saldo("1105-0000-0000-0000", "CLIENTES", 100),
      saldo("1105-0001-0001-0000", "ACME", 100),
    ],
    saldosActual: [
      saldo("1105-0000-0000-0000", "CLIENTES", 140),
      saldo("1105-0001-0001-0000", "ACME", 140),
    ],
    roles: ROLES,
  });
  const cxc = model.steps.find((step) => step.key === "cxc");
  assert.equal(cxc?.value, 40);
  assert.equal(model.flujoOperativoNeto, -30);
});

test("sin balanza del mes anterior no inventa el puente", () => {
  const model = buildFlujoLibre({
    mesActual: [pnl("4101-0001-0001-0000", "VENTAS", 0, 10)],
    saldosActual: [saldo("1105-0001-0001-0000", "ACME", 40)],
    saldosAnterior: [],
    roles: ROLES,
  });
  assert.equal(model.hasPrior, false);
  assert.equal(model.steps.length, 0);
});
