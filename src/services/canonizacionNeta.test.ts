import assert from "node:assert/strict";
import test from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { buildDupont, dupontFromSnapshot } from "@/services/dupont";
import { computeErBuckets } from "@/services/estadoOperativo";
import {
  calculateEficiencia,
  calculateGestion,
  calculateMargenes,
  calculateRetorno,
  calculateSolvencia,
  getAllMetrics,
} from "@/services/financialEngine";
import { buildPeriodSnapshot } from "@/services/financialSnapshot";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import { pnlFromBalanza, structureFromBalanza, type TreasuryTotals } from "@/services/metricsLedger";
import { buildSaludFinanciera } from "@/services/modules/saludFinanciera";

/**
 * Canonización de la utilidad neta (catálogo ≡ ER Operativo) y tratamiento
 * del déficit patrimonial (capital contable NIF ≤ 0 → ratios sobre capital
 * no significativos).
 *
 * Canónica aprobada: el snapshot del catálogo consume `computeErBuckets`
 * (prefijos 4xxx–8xxx) — ventas netas SIN productos financieros (van al RIF),
 * 8101 descontado una sola vez vía RIF e impuestos = PTU 6405 + ISR 6406.
 */

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

const TESORERIA_VACIA: TreasuryTotals = {
  saldoInicial: 0,
  entradasOperativas: 0,
  salidasOperativas: 0,
  salidasCapex: 0,
  servicioDeuda: 0,
  saldoFinal: 0,
  freeCashFlow: 0,
};

/**
 * PyG completo: ventas 10,000; productos financieros 7102 = 500 (categoría
 * Ingreso: la aritmética vieja los metía a las ventas); costo 4,000; gastos
 * de venta 1,000; PTU 100; ISR 300; gastos financieros 8101 = 200.
 * ER canónico: EBIT 5,000; RIF +300; EBT 5,300; neta 4,900.
 * (La aritmética vieja daba neta 4,400: doble deducción de 8101 y del ISR.)
 */
function rowsPygCompleto(): BalanzaPnL[] {
  return [
    balanzaRow({ idCuenta: "4101-0001-0000-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", haber: 10_000 }),
    balanzaRow({
      idCuenta: "7102-0001-0000-0000",
      nombreCuenta: "PRODUCTOS FINANCIEROS",
      categoriaMaestra: "Ingreso",
      haber: 500,
    }),
    balanzaRow({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO DE VENTAS", categoriaMaestra: "COGS", debe: 4_000 }),
    balanzaRow({ idCuenta: "6101-0001-0000-0000", nombreCuenta: "GASTOS DE VENTA", categoriaMaestra: "OpEx", debe: 1_000 }),
    balanzaRow({ idCuenta: "6405-0001-0000-0000", nombreCuenta: "PTU", categoriaMaestra: "OpEx", debe: 100 }),
    balanzaRow({ idCuenta: "6406-0001-0000-0000", nombreCuenta: "ISR", categoriaMaestra: "OpEx", debe: 300 }),
    balanzaRow({
      idCuenta: "8101-0001-0000-0000",
      nombreCuenta: "GASTOS FINANCIEROS",
      categoriaMaestra: "OpEx",
      debe: 200,
    }),
  ];
}

test("canonización: el snapshot consume el ER al centavo (ventas, EBIT, neta)", () => {
  const rows = rowsPygCompleto();
  const er = computeErBuckets(
    rows.map((fila) => ({
      idCuenta: fila.idCuenta,
      nombreCuenta: fila.nombreCuenta,
      debe: Number(fila.debe),
      haber: Number(fila.haber),
    })),
  );
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rows,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });

  // ER esperado del fixture
  assert.equal(er.ventas, 10_000);
  assert.equal(er.ebit, 5_000);
  assert.equal(er.rif, 300);
  assert.equal(er.ebt, 5_300);
  assert.equal(er.utilidadNeta, 4_900);

  // Snapshot ≡ ER, campo a campo
  assert.equal(snapshot.ingresos, er.ventas, "ventas netas SIN productos financieros");
  assert.equal(snapshot.cogs, er.costo);
  assert.equal(snapshot.opex, er.totalOpex, "OpEx sin 8101/6405/6406");
  assert.equal(snapshot.ebit, er.ebit);
  assert.equal(snapshot.ebitda, er.ebitda);
  assert.equal(snapshot.utilidadBruta, er.utilidadBruta);
  assert.equal(snapshot.gastosFinancieros, er.gastosFinancieros);
  assert.equal(snapshot.impuestos, 400, "impuestos = PTU 6405 + ISR 6406");
  assert.equal(snapshot.ebt, er.ebt);
  assert.equal(snapshot.utilidadNeta, er.utilidadNeta, "neta canónica, sin doble deducción");

  // Contra la aritmética vieja: ventas 10,500 y neta 4,400
  assert.notEqual(snapshot.ingresos, 10_500);
  assert.notEqual(snapshot.utilidadNeta, 4_400);

  // NOPAT con tasa efectiva real (400 / 5,300 ≈ 8%): 5,000 × (1 − 0.08)
  assert.equal(snapshot.taxRate, 0.08);
  assert.equal(snapshot.nopat, 4_600);

  // Paridad de catálogo y DuPont sobre la neta canónica
  const margenes = calculateMargenes(snapshot);
  assert.equal(margenes.find((m) => m.key === "netMargin")?.value, 49);
  const dupont = dupontFromSnapshot(snapshot);
  assert.equal(dupont.margenNeto, 49);
});

/**
 * Déficit patrimonial (convención Compac, cierra en cero): capital social
 * 500 (acreedor) − pérdidas acumuladas 3,000 (deudor) + utilidad YTD 1,500
 * → capital NIF = −1,000 (déficit). Activo 2,000 = |Pasivo| 3,000 + C(−1,000).
 */
function rowsDeficit(): BalanzaPnL[] {
  return [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA BANCOMER", saldoFinal: 2_000 }),
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR",
      categoriaMaestra: "Pasivo",
      saldoFinal: -3_000,
    }),
    balanzaRow({
      idCuenta: "3101-0001-0001-0000",
      nombreCuenta: "CAPITAL SOCIAL",
      categoriaMaestra: "Patrimonio",
      saldoFinal: -500,
    }),
    balanzaRow({
      idCuenta: "3105-0002-0002-0000",
      nombreCuenta: "EJERCICIO 2021",
      categoriaMaestra: "Patrimonio",
      saldoFinal: 3_000,
    }),
    balanzaRow({
      idCuenta: "4101-0001-0001-0000",
      nombreCuenta: "VENTAS",
      categoriaMaestra: "Ingreso",
      haber: 4_000,
      saldoFinal: -4_000,
    }),
    balanzaRow({
      idCuenta: "5101-0001-0000-0000",
      nombreCuenta: "COSTO DE VENTAS",
      categoriaMaestra: "COGS",
      debe: 2_000,
      saldoFinal: 2_000,
    }),
    balanzaRow({
      idCuenta: "6101-0001-0000-0000",
      nombreCuenta: "GASTOS DE VENTA",
      categoriaMaestra: "OpEx",
      debe: 500,
      saldoFinal: 500,
    }),
  ];
}

test("déficit patrimonial: ratios sobre capital quedan N/D con nullReason negativeCapital", () => {
  const rows = rowsDeficit();
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rows,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });

  // Capital NIF económico: −(2,500 crudo − 1,500 utilidad) = −1,000 (déficit)
  assert.equal(snapshot.patrimonio, -1_000);
  assert.equal(snapshot.capitalInvertido, -1_000);
  assert.equal(snapshot.utilidadNeta, 1_500);

  const retorno = calculateRetorno(snapshot, null);
  const solvencia = calculateSolvencia(snapshot, null);
  const eficiencia = calculateEficiencia(snapshot);
  const gestion = calculateGestion(snapshot, null);
  const byKey = (list: typeof retorno, key: string) => list.find((m) => m.key === key);

  // No significativos con capital ≤ 0: null + motivo para la UI
  for (const metric of [
    byKey(retorno, "roic"),
    byKey(retorno, "roce"),
    byKey(retorno, "roe"),
    byKey(retorno, "cashRoic"),
    byKey(eficiencia, "icTurnover"),
    byKey(solvencia, "financialLeverage"),
    byKey(gestion, "wacc"),
    byKey(gestion, "economicSpread"),
    byKey(gestion, "shareholderMargin"),
  ]) {
    assert.equal(metric?.value, null, `${metric?.key} debe ser null con déficit`);
    assert.equal(metric?.nullReason, "negativeCapital", `${metric?.key} debe explicar el motivo`);
  }

  // Los que NO dependen del capital siguen computando
  assert.equal(byKey(retorno, "roa")?.value, 75, "ROA = 1,500 / 2,000");
  assert.equal(byKey(solvencia, "liabilityRatio")?.value, 1.5, "|P| / A sigue siendo válido");
  assert.equal(byKey(gestion, "keyScore")?.value != null, true, "keyScore promedia sin el ROE");

  // getAllMetrics propaga el nullReason
  const catalogo = getAllMetrics(snapshot, null);
  assert.equal(catalogo.retorno.find((m) => m.key === "roe")?.nullReason, "negativeCapital");
  assert.equal(catalogo.solvencia.find((m) => m.key === "financialLeverage")?.nullReason, "negativeCapital");
  assert.equal(catalogo.gestion.find((m) => m.key === "wacc")?.nullReason, "negativeCapital");
});

test("WACC (#46): N/D con déficit aunque el snapshot produzca un hurdle rate engañoso", () => {
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rowsDeficit(),
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  // Sin deuda financiera y equity recortado a 0, el WACC crudo colapsa a Ke
  // (con deuda y equity 0 colapsaría a Kd·(1−t) ≈ 1%): en ambos casos la
  // ponderación es ficticia con capital ≤ 0, así que el catálogo reporta N/D.
  const wacc = calculateGestion(snapshot, null).find((m) => m.key === "wacc");
  assert.equal(wacc?.value, null);
  assert.equal(wacc?.formatted, "");
  assert.equal(wacc?.nullReason, "negativeCapital");
});

test("keyScore (#42) no consume WACC: promedia solo los sub-scores disponibles", () => {
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rowsDeficit(),
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  const gestion = calculateGestion(snapshot, null);
  const keyScore = gestion.find((m) => m.key === "keyScore");
  // Insumos: grossMargin 50 → 83.33; ebitdaMargin 37.5 → 93.75; currentRatio
  // 0.67 → 16.75; ROE es N/D (déficit) y se excluye del promedio. El WACC
  // nunca entra al score: no arrastra el hurdle rate colapsado.
  assert.equal(keyScore?.value, 64.61);
  assert.equal(gestion.find((m) => m.key === "wacc")?.value, null);
});

/**
 * Mismo balance que rowsDeficit pero con capital NIF positivo: activo 2,000 =
 * |pasivo| 1,000 (proveedor 400 + préstamo 600) + capital 1,000 (capital
 * social 500 + utilidad YTD 500). La identidad cuadra en convención Compac.
 */
function rowsCapitalPositivo(): BalanzaPnL[] {
  return [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA BANCOMER", saldoFinal: 2_000 }),
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR",
      categoriaMaestra: "Pasivo",
      saldoFinal: -400,
    }),
    balanzaRow({
      idCuenta: "2106-0009-0000-0000",
      nombreCuenta: "PRESTAMO BBVA",
      categoriaMaestra: "Pasivo",
      saldoFinal: -600,
    }),
    balanzaRow({
      idCuenta: "3101-0001-0001-0000",
      nombreCuenta: "CAPITAL SOCIAL",
      categoriaMaestra: "Patrimonio",
      saldoFinal: -500,
    }),
    balanzaRow({
      idCuenta: "4101-0001-0001-0000",
      nombreCuenta: "VENTAS",
      categoriaMaestra: "Ingreso",
      haber: 2_000,
      saldoFinal: -2_000,
    }),
    balanzaRow({
      idCuenta: "5101-0001-0000-0000",
      nombreCuenta: "COSTO DE VENTAS",
      categoriaMaestra: "COGS",
      debe: 1_200,
      saldoFinal: 1_200,
    }),
    balanzaRow({
      idCuenta: "6101-0001-0000-0000",
      nombreCuenta: "GASTOS DE VENTA",
      categoriaMaestra: "OpEx",
      debe: 300,
      saldoFinal: 300,
    }),
  ];
}

test("capital positivo: WACC (#46) y economicSpread (#48) computan normal (sin N/D)", () => {
  const rows = rowsCapitalPositivo();
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rows,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  assert.equal(snapshot.patrimonio, 1_000, "capital NIF positivo: 500 capital + 500 utilidad YTD");
  // WACC = Ke·(E/V) + Kd·(1−t)·(D/V) = 0.14·(1000/1600) + 0 → 0.09 → 9.0%
  assert.equal(snapshot.wacc, 0.09);

  const gestion = calculateGestion(snapshot, null);
  const wacc = gestion.find((m) => m.key === "wacc");
  assert.equal(wacc?.value, 9);
  assert.equal(wacc?.formatted, "9.0%");
  assert.equal(wacc?.nullReason, null);

  // ROIC = NOPAT 350 / capitalInvertido 1,000 = 35% → spread = 35 − 9 = 26
  const spread = gestion.find((m) => m.key === "economicSpread");
  assert.equal(spread?.value, 26);
  assert.equal(spread?.nullReason, null);

  // keyScore con los 4 sub-scores disponibles: 66.67 + 62.5 + 100 + 50
  assert.equal(gestion.find((m) => m.key === "keyScore")?.value, 69.79);

  // La fuente de la alerta de déficit reporta el capital positivo → no alerta
  const salud = buildSaludFinanciera(structureFromBalanza(rows, COMPAC_ACCOUNT_ROLES), pnlFromBalanza(rows), TESORERIA_VACIA);
  assert.equal(salud.patrimonioNeto.amount, 1_000);
});

test("déficit patrimonial: endeudamiento no significativo y patrimonio presentado en negativo", () => {
  const rows = rowsDeficit();
  const structure = structureFromBalanza(rows, COMPAC_ACCOUNT_ROLES);
  const salud = buildSaludFinanciera(structure, pnlFromBalanza(rows), TESORERIA_VACIA);

  assert.equal(salud.endeudamientoTotal.value, null, "|P|/C con C ≤ 0 no es significativo");
  // El denominador evidencia el déficit (signo económico), no la magnitud cruda
  assert.equal(salud.endeudamientoTotal.denominator, -1_000);
  // La línea de patrimonio muestra el déficit, no la suma cruda 3xxx
  assert.equal(salud.patrimonioNeto.amount, -1_000);
  assert.equal(salud.patrimonioNeto.amountFormatted, "-$1,000.00");
});

test("déficit patrimonial: DuPont muestra margen/rotación/ROA y anula apalancamiento y ROE", () => {
  // Cifras reales jul-2026 (verificadas contra DB en la auditoría B3)
  const d = buildDupont({
    ventas: 4_193_494.13,
    utilidadNeta: 1_599_427.84,
    activoTotal: 9_370_898.31,
    capitalContable: -10_572_461.03,
  });
  assert.equal(d.margenNeto, 38.14);
  assert.equal(d.rotacionActivos, 0.45);
  assert.equal(d.roa, 17.07);
  assert.equal(d.apalancamiento, null);
  assert.equal(d.roe, null);
  assert.equal(d.productoRedondeado, null);
  assert.equal(d.identidadCruda, false);
});

test("capital positivo pequeño (> 0.01) sigue computando: el guard es solo para déficit", () => {
  const d = buildDupont({ ventas: 1_000, utilidadNeta: 100, activoTotal: 800, capitalContable: 400 });
  assert.equal(d.roe, 25);
  assert.equal(d.apalancamiento, 2);
  assert.equal(d.identidadCruda, true);
});
