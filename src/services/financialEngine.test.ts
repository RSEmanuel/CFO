import assert from "node:assert/strict";
import test from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { deudaFinancieraPorNombre } from "@/services/capitalTrabajoCalcs";
import { calculateMargenes, calculateRetorno, calculateSolvencia, getAllMetrics } from "@/services/financialEngine";
import { buildPeriodSnapshot } from "@/services/financialSnapshot";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import { structureFromBalanza } from "@/services/metricsLedger";
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

/**
 * Escenario con convención Compac: activo 1500 (bancos 1000 + clientes 500),
 * pasivos CP proveedor 400 + préstamo 600 (signo según `signoPasivo`),
 * ventas 2000 y COGS 1200 → EBIT 800.
 */
function rowsEscenario(signoPasivo: 1 | -1): BalanzaPnL[] {
  return [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA BANCOMER", saldoFinal: 1000 }),
    balanzaRow({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "CLIENTES", saldoFinal: 500 }),
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR",
      categoriaMaestra: "Pasivo",
      saldoFinal: 400 * signoPasivo,
    }),
    balanzaRow({
      idCuenta: "2106-0009-0000-0000",
      nombreCuenta: "PRESTAMO BBVA",
      categoriaMaestra: "Pasivo",
      saldoFinal: 600 * signoPasivo,
    }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", haber: 2000 }),
    balanzaRow({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO DE VENTAS", categoriaMaestra: "COGS", debe: 1200 }),
  ];
}

function snapshotEscenario(signoPasivo: 1 | -1) {
  return buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rowsEscenario(signoPasivo),
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
}

test("ROCE (#10): capitalEmpleado = activo total − |pasivo circulante| con pasivos en negativo", () => {
  const rows = rowsEscenario(-1);
  const snapshot = snapshotEscenario(-1);
  assert.equal(snapshot.activoTotal, 1500);
  assert.equal(snapshot.pasivoCirculante, -1000);

  // Paridad módulo ↔ catálogo: el denominador se reconstruye desde la
  // estructura cruda del ledger (signo Compac) aplicando la magnitud.
  const structure = structureFromBalanza(rows, COMPAC_ACCOUNT_ROLES);
  const capitalEmpleado = round2(snapshot.activoTotal - Math.abs(structure.pasivoCirculante));
  assert.equal(capitalEmpleado, 500);

  const roce = calculateRetorno(snapshot, null).find((m) => m.key === "roce");
  // EBIT 800 / capitalEmpleado 500 = 160%
  assert.equal(roce?.value, 160);
  // Con la fórmula vieja (sin abs) el denominador sumaba: 1500 + 1000 = 2500 → 32%
  assert.notEqual(roce?.value, 32);

  // La convención es de magnitud: un tenant con pasivos en positivo reporta igual
  const rocePos = calculateRetorno(snapshotEscenario(1), null).find((m) => m.key === "roce");
  assert.equal(rocePos?.value, roce?.value);
});

test("ROCE (#10): getAllMetrics expone el mismo valor que calculateRetorno (ruta única)", () => {
  const snapshot = snapshotEscenario(-1);
  const directo = calculateRetorno(snapshot, null).find((m) => m.key === "roce")?.value;
  const viaCatalogo = getAllMetrics(snapshot, null).retorno.find((m) => m.key === "roce")?.value;
  assert.equal(viaCatalogo, directo);
  assert.equal(viaCatalogo, 160);
});

test("pctOf sin doble redondeo: el porcentaje conserva 2 decimales (5.46%, no 5.0%)", () => {
  // EBIT = 2000 − 1200 − 690.84 = 109.16 → 109.16 / 2000 = 0.05458 → 5.46%.
  // Con el pre-redondeo viejo (round2 del ratio) salía 0.05 → 5.0%.
  const rows = [
    ...rowsEscenario(-1),
    balanzaRow({
      idCuenta: "6101-0001-0000-0000",
      nombreCuenta: "SUELDOS Y SALARIOS",
      categoriaMaestra: "OpEx",
      debe: 690.84,
    }),
  ];
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rows,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  assert.equal(snapshot.ebit, 109.16);

  const margenes = calculateMargenes(snapshot);
  const operating = margenes.find((m) => m.key === "operatingMargin");
  assert.equal(operating?.value, 5.46);
  assert.notEqual(operating?.value, 5);
  // Ratios exactos no cambian: 800 / 2000 = 40% en ambos esquemas
  assert.equal(margenes.find((m) => m.key === "grossMargin")?.value, 40);
});

test("pctOf con denominador ~0 sigue devolviendo null (guardia intacta)", () => {
  const rows = [balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA BANCOMER", saldoFinal: 100 })];
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rows,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  const margenes = calculateMargenes(snapshot);
  assert.equal(margenes.find((m) => m.key === "grossMargin")?.value, null);
  assert.equal(margenes.find((m) => m.key === "operatingMargin")?.value, null);
});

test("#37 liabilityRatio: |pasivo total| / activo total, positivo con pasivo acreedor negativo", () => {
  const rows = rowsEscenario(-1);
  const snapshot = snapshotEscenario(-1);
  assert.equal(snapshot.pasivoTotal, -1000);

  const structure = structureFromBalanza(rows, COMPAC_ACCOUNT_ROLES);
  const esperado = round2(Math.abs(structure.pasivoTotal) / snapshot.activoTotal);

  const liability = calculateSolvencia(snapshot, null).find((m) => m.key === "liabilityRatio");
  assert.equal(liability?.value, esperado);
  // |−1000| / 1500 = 0.67x; con el signo crudo salía −0.67x
  assert.equal(liability?.value, 0.67);
  assert.ok((liability?.value ?? 0) > 0);

  const viaCatalogo = getAllMetrics(snapshot, null).solvencia.find((m) => m.key === "liabilityRatio")?.value;
  assert.equal(viaCatalogo, liability?.value);
});

test("fallback deudaBruta por nombre: saldos de pasivo negativos reportan magnitud", () => {
  const rows = [
    balanzaRow({ idCuenta: "2106-0009-0000-0000", nombreCuenta: "PRESTAMO BBVA", categoriaMaestra: "Pasivo", saldoFinal: -600 }),
    balanzaRow({
      idCuenta: "2106-0010-0000-0000",
      nombreCuenta: "LINEA DE CREDITO BANORTE",
      categoriaMaestra: "Pasivo",
      saldoFinal: -250,
    }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: -400 }),
  ];
  // Excluye proveedores (no matchean préstamo/crédito/deuda/bancaria) y aplica |neta|
  assert.equal(deudaFinancieraPorNombre(rows), 850);

  // Tenant que persiste pasivos en positivo: misma magnitud
  const positivos = rows.map((fila) =>
    balanzaRow({
      idCuenta: fila.idCuenta,
      nombreCuenta: fila.nombreCuenta,
      categoriaMaestra: fila.categoriaMaestra,
      saldoFinal: -Number(fila.saldoFinal),
    }),
  );
  assert.equal(deudaFinancieraPorNombre(positivos), 850);

  // Signos mixtos se netean antes del absoluto (mismo criterio que el rol)
  const mixtas = [
    balanzaRow({ idCuenta: "2106-0009-0000-0000", nombreCuenta: "PRESTAMO BBVA", categoriaMaestra: "Pasivo", saldoFinal: -600 }),
    balanzaRow({ idCuenta: "2106-0011-0000-0000", nombreCuenta: "CREDITO PUENTE", categoriaMaestra: "Pasivo", saldoFinal: 150 }),
  ];
  assert.equal(deudaFinancieraPorNombre(mixtas), 450);
});
