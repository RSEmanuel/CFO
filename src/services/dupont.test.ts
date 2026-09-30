import assert from "node:assert/strict";
import test from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import {
  buildDupont,
  dupontFromSnapshot,
  roundedIdentityHolds,
  DUPONT_ROUNDED_IDENTITY_TOLERANCE_PP,
} from "@/services/dupont";
import { calculateEficiencia, calculateMargenes, calculateRetorno, calculateSolvencia } from "@/services/financialEngine";
import { buildPeriodSnapshot } from "@/services/financialSnapshot";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import { round2 } from "@/services/money";

type BalanzaRowInput = Omit<Partial<BalanzaPnL>, "saldoInicial" | "debe" | "haber" | "saldoFinal"> & {
  idCuenta: string;
  saldoInicial?: number;
  debe?: number;
  haber?: number;
  saldoFinal?: number;
};

function balanzaRow(overrides: BalanzaRowInput): BalanzaPnL {
  return {
    nombreCuenta: overrides.idCuenta,
    categoriaMaestra: "Activo",
    saldoInicial: 0,
    debe: 0,
    haber: 0,
    saldoFinal: 0,
    depreciacionAmortizacion: false,
    periodo: 7,
    anio: 2026,
    ...overrides,
  } as unknown as BalanzaPnL;
}

function rowsBase(): BalanzaPnL[] {
  return [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA BANCOMER", saldoFinal: 1000 }),
    balanzaRow({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "CLIENTES", saldoFinal: 500 }),
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR",
      categoriaMaestra: "Pasivo",
      saldoFinal: -400,
    }),
    balanzaRow({
      idCuenta: "3101-0001-0001-0000",
      nombreCuenta: "CAPITAL SOCIAL",
      categoriaMaestra: "Patrimonio",
      saldoFinal: 2000,
    }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", haber: 2000 }),
    balanzaRow({
      idCuenta: "5101-0001-0000-0000",
      nombreCuenta: "COSTO DE VENTAS",
      categoriaMaestra: "COGS",
      debe: 1200,
    }),
  ];
}

test("identidad cruda: margen × rotación × apalancamiento = ROE (razones sin redondeo)", () => {
  const d = buildDupont({
    ventas: 4_193_494.13,
    utilidadNeta: 1_388_379.7,
    activoTotal: 9_370_898.31,
    capitalContable: 9_749_857.41,
  });
  assert.equal(d.identidadCruda, true);
  assert.ok(d.roe != null);
  assert.ok(d.productoRedondeado != null);
  assert.ok(Math.abs(d.productoRedondeado - d.roe) <= DUPONT_ROUNDED_IDENTITY_TOLERANCE_PP);
  assert.equal(roundedIdentityHolds(d), true);
});

test("división por cero: ventas, activo o patrimonio ~0 → null (safeRatio)", () => {
  const sinVentas = buildDupont({
    ventas: 0,
    utilidadNeta: 100,
    activoTotal: 1_000,
    capitalContable: 500,
  });
  assert.equal(sinVentas.margenNeto, null);
  assert.equal(sinVentas.rotacionActivos, 0);
  assert.equal(sinVentas.identidadCruda, false);

  const sinActivo = buildDupont({
    ventas: 1_000,
    utilidadNeta: 100,
    activoTotal: 0,
    capitalContable: 500,
  });
  // Rotación y ROA: denominador activo ~0 → null. Apalancamiento = 0/equity = 0
  // (safeRatio anula por denominador, no por numerador).
  assert.equal(sinActivo.rotacionActivos, null);
  assert.equal(sinActivo.roa, null);
  assert.equal(sinActivo.apalancamiento, 0);

  const sinEquity = buildDupont({
    ventas: 1_000,
    utilidadNeta: 100,
    activoTotal: 800,
    capitalContable: 0,
  });
  assert.equal(sinEquity.apalancamiento, null);
  assert.equal(sinEquity.roe, null);
  assert.equal(sinEquity.identidadCruda, false);
});

test("pérdida neta: margen y ROE negativos, identidad coherente", () => {
  const d = buildDupont({
    ventas: 1_000,
    utilidadNeta: -200,
    activoTotal: 800,
    capitalContable: 400,
  });
  assert.equal(d.margenNeto, -20);
  assert.equal(d.rotacionActivos, 1.25);
  assert.equal(d.apalancamiento, 2);
  assert.equal(d.roe, -50);
  assert.equal(d.identidadCruda, true);
  assert.equal(d.productoRedondeado, -50);
});

test("paridad con catálogo #3 #11 #12 #16 #36 sobre el mismo snapshot", () => {
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rowsBase(),
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  const dupont = dupontFromSnapshot(snapshot);
  const margen = calculateMargenes(snapshot).find((m) => m.key === "netMargin")?.value;
  const retorno = calculateRetorno(snapshot, null);
  const roe = retorno.find((m) => m.key === "roe")?.value;
  const roa = retorno.find((m) => m.key === "roa")?.value;
  const rotacion = calculateEficiencia(snapshot).find((m) => m.key === "assetTurnover")?.value;
  const leverage = calculateSolvencia(snapshot, null).find((m) => m.key === "financialLeverage")?.value;

  assert.equal(dupont.margenNeto, margen);
  assert.equal(dupont.roe, roe);
  assert.equal(dupont.roa, roa);
  assert.equal(dupont.rotacionActivos, rotacion);
  assert.equal(dupont.apalancamiento, leverage);
  assert.equal(dupont.identidadCruda, true);

  // Snapshot: ventas 2000, NI = EBIT 800 (sin ISR/interés), activo 1500, patrimonio 2000.
  assert.equal(snapshot.ingresos, 2000);
  assert.equal(snapshot.utilidadNeta, 800);
  assert.equal(snapshot.activoTotal, 1500);
  assert.equal(snapshot.patrimonio, 2000);
  assert.equal(dupont.margenNeto, 40);
  assert.equal(dupont.roe, 40);
  assert.equal(dupont.roa, round2((800 / 1500) * 100));
});
