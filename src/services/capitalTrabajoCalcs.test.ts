import assert from "node:assert/strict";
import test from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { cccFromBalanza, deudaFinancieraFromBalanza, netWorkingCapital } from "@/services/capitalTrabajoCalcs";
import { calculateLiquidez } from "@/services/financialEngine";
import { buildPeriodSnapshot } from "@/services/financialSnapshot";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import type { AccountRoles } from "@/services/ingest/types";
import { buildCapitalTrabajo } from "@/services/modules/capitalTrabajo";
import { buildSaludFinanciera } from "@/services/modules/saludFinanciera";
import { pnlFromBalanza, structureFromBalanza } from "@/services/metricsLedger";
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

/** Escenario base: clientes 1000→3000, proveedores −2000→−4000, ventas 12k, COGS 6k. */
function rowsBase(): BalanzaPnL[] {
  return [
    balanzaRow({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "CLIENTE A", saldoInicial: 1000, saldoFinal: 3000 }),
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR A",
      categoriaMaestra: "Pasivo",
      saldoInicial: -2000,
      saldoFinal: -4000,
    }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", haber: 12000 }),
    balanzaRow({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO DE VENTAS", categoriaMaestra: "COGS", debe: 6000 }),
  ];
}

test("cccFromBalanza mensual: promedio (si+sf)/2, anualización ×12 y pasivos negativos en absoluto", () => {
  const rows = rowsBase();
  const ccc = cccFromBalanza({ balanzaCierre: rows, balanzaMov: rows, roles: COMPAC_ACCOUNT_ROLES });

  assert.equal(ccc.meses, 1);
  assert.equal(ccc.cxcPromedio, 2000); // (1000 + 3000) / 2
  assert.equal(ccc.cxpPromedio, 3000); // |(−2000 + −4000) / 2|
  assert.equal(ccc.ventas, 12000);
  assert.equal(ccc.cogs, 6000);
  assert.equal(ccc.ventasAnualizadas, 144000); // 12000 × 12
  assert.equal(ccc.cogsAnualizado, 72000); // 6000 × 12
  // DSO = 2000 / 144000 × 365 = 5.0694…
  assert.equal(ccc.dso, 5.07);
  // DPO = 3000 / 72000 × 365 = 15.2083… (positivo aunque el pasivo viene negativo)
  assert.equal(ccc.dpo, 15.21);
  // Sin rubro de inventario: DIO = 0 legítimo y CCC = DSO − DPO
  assert.equal(ccc.dio, 0);
  assert.equal(ccc.days, -10.14);
});

test("cccFromBalanza YTD: anualiza ×12/meses cubiertos, no ×12", () => {
  const cierre = rowsBase();
  const mov = [
    ...rowsBase().map((fila) => ({ ...fila, periodo: 6 })),
    ...rowsBase(),
  ];
  const ccc = cccFromBalanza({ balanzaCierre: cierre, balanzaMov: mov, roles: COMPAC_ACCOUNT_ROLES });

  assert.equal(ccc.meses, 2);
  assert.equal(ccc.ventas, 24000); // 12000 × 2 meses
  assert.equal(ccc.cogs, 12000);
  assert.equal(ccc.ventasAnualizadas, 144000); // 24000 × 12/2
  assert.equal(ccc.cogsAnualizado, 72000); // 12000 × 12/2
  assert.equal(ccc.dso, 5.07);
  assert.equal(ccc.dpo, 15.21);
});

test("cccFromBalanza: signos mixtos se netean por rubro antes del absoluto/promedio", () => {
  const rows = [
    // Clientes: una cuenta deudora y una acreedora → neta 2500 final, 1000 inicial
    balanzaRow({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "CLIENTE A", saldoInicial: 1000, saldoFinal: 3000 }),
    balanzaRow({ idCuenta: "1105-0001-0002-0000", nombreCuenta: "CLIENTE B", saldoInicial: 0, saldoFinal: -500 }),
    // Proveedores: pasivo −4000 con un anticipo deudor +500 → neta −3500
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR A",
      categoriaMaestra: "Pasivo",
      saldoInicial: -2000,
      saldoFinal: -4000,
    }),
    balanzaRow({
      idCuenta: "2101-0001-0002-0000",
      nombreCuenta: "PROVEEDOR B",
      categoriaMaestra: "Pasivo",
      saldoInicial: 0,
      saldoFinal: 500,
    }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", haber: 12000 }),
    balanzaRow({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO", categoriaMaestra: "COGS", debe: 6000 }),
  ];
  const ccc = cccFromBalanza({ balanzaCierre: rows, balanzaMov: rows, roles: COMPAC_ACCOUNT_ROLES });

  assert.equal(ccc.cxcPromedio, 1750); // (1000 + 2500) / 2
  assert.equal(ccc.cxpPromedio, 2750); // |(−2000 + −3500) / 2|
});

test("cccFromBalanza: con rubro de inventario el DIO entra al CCC", () => {
  const rows = [
    ...rowsBase(),
    balanzaRow({ idCuenta: "1115-0001-0000-0000", nombreCuenta: "ALMACEN GENERAL", saldoInicial: 500, saldoFinal: 1500 }),
  ];
  const ccc = cccFromBalanza({ balanzaCierre: rows, balanzaMov: rows, roles: COMPAC_ACCOUNT_ROLES });

  assert.equal(ccc.inventarioPromedio, 1000);
  // DIO = 1000 / 72000 × 365 = 5.0694…
  assert.equal(ccc.dio, 5.07);
  // CCC = DSO + DIO − DPO = 5.07 + 5.07 − 15.21
  assert.equal(ccc.days, -5.07);
});

test("cccFromBalanza: overrides por tenant redefinen los rubros", () => {
  const rows = [
    // El tenant usa 1199 para clientes (no 1105)
    balanzaRow({ idCuenta: "1199-0001-0000-0000", nombreCuenta: "DEUDORES VARIOS", saldoInicial: 0, saldoFinal: 7300 }),
    balanzaRow({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "CLIENTE A", saldoInicial: 9999, saldoFinal: 9999 }),
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR A",
      categoriaMaestra: "Pasivo",
      saldoInicial: -2000,
      saldoFinal: -4000,
    }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", haber: 12000 }),
    balanzaRow({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO", categoriaMaestra: "COGS", debe: 6000 }),
  ];
  const roles: AccountRoles = { ...COMPAC_ACCOUNT_ROLES, clientes: { prefixes: ["1199"] } };
  const ccc = cccFromBalanza({ balanzaCierre: rows, balanzaMov: rows, roles });

  assert.equal(ccc.cxcPromedio, 3650); // solo 1199: (0 + 7300) / 2
  // DSO = 3650 / 144000 × 365 = 9.2517…
  assert.equal(ccc.dso, 9.25);
});

test("deudaFinancieraFromBalanza: 2106 + 2306 + 2359 en valor absoluto; excluye proveedores", () => {
  const rows = [
    balanzaRow({ idCuenta: "2106-0011-0000-0000", nombreCuenta: "BBVA Préstamo", categoriaMaestra: "Pasivo", saldoFinal: -9500000 }),
    balanzaRow({ idCuenta: "2106-0010-0000-0000", nombreCuenta: "TDC KONFIO", categoriaMaestra: "Pasivo", saldoFinal: -581639.68 }),
    balanzaRow({ idCuenta: "2306-0001-0000-0000", nombreCuenta: "Anticipo de cliente", categoriaMaestra: "Pasivo", saldoFinal: -250000 }),
    balanzaRow({ idCuenta: "2359-0003-0000-0000", nombreCuenta: "Impuestos diferidos", categoriaMaestra: "Pasivo", saldoFinal: -80000 }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: -4318493.02 }),
  ];

  assert.equal(deudaFinancieraFromBalanza(rows, COMPAC_ACCOUNT_ROLES), 10411639.68);

  // Override por tenant: solo 2106
  const roles: AccountRoles = { ...COMPAC_ACCOUNT_ROLES, deudaFinanciera: { prefixes: ["2106"] } };
  assert.equal(deudaFinancieraFromBalanza(rows, roles), 10081639.68);
});

test("paridad módulo vs catálogo: buildCapitalTrabajo y buildPeriodSnapshot reportan el mismo CCC", () => {
  const rows = [
    ...rowsBase(),
    balanzaRow({ idCuenta: "2106-0011-0000-0000", nombreCuenta: "BBVA Préstamo", categoriaMaestra: "Pasivo", saldoFinal: -9500000 }),
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA BANCOMER", saldoInicial: 500, saldoFinal: 700 }),
  ];

  const modulo = buildCapitalTrabajo({
    ventasHastaCierre: [],
    egresosCorte: [],
    egresosHastaCierre: [],
    balanzaCierre: rows,
    balanzaMov: rows,
    accountRoles: COMPAC_ACCOUNT_ROLES,
    asOf: new Date("2026-07-31"),
  });
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rows,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });

  assert.equal(modulo.ccc.dso, snapshot.dso);
  assert.equal(modulo.ccc.dio, snapshot.dio);
  assert.equal(modulo.ccc.dpo, snapshot.dpo);
  assert.equal(modulo.ccc.days, snapshot.ccc);
  assert.equal(modulo.nwc.amount, snapshot.nwc);
  // La deuda financiera del módulo y deudaBruta del catálogo (#35/#38/#39/#41) coinciden
  assert.equal(modulo.deudaFinanciera.amount, 9500000);
  assert.equal(snapshot.deudaBruta, 9500000);
  // CxC/CxP del snapshot (#17/#19) son los promedios de la balanza, no auxiliares
  assert.equal(snapshot.cxc, 2000);
  assert.equal(snapshot.cxp, 3000);
});

test("NWC: pasivos negativos restan en absoluto (AC − |PC|), no se suman", () => {
  assert.equal(netWorkingCapital(100, -40), 60);
  assert.equal(netWorkingCapital(100, 40), 60);
  // jul-2026 Compac: AC $8,742,172.25 − |PC| $19,943,359.34
  assert.equal(netWorkingCapital(8_742_172.25, -19_943_359.34), -11_201_187.09);
  // Caso límite: sin pasivo circulante el NWC es el activo circulante
  assert.equal(netWorkingCapital(8_742_172.25, 0), 8_742_172.25);
  assert.equal(netWorkingCapital(8_742_172.25, 0.004), 8_742_172.25);
});

test("NWC en snapshot: pasivos Compac negativos; #25/#26/#27 usan |PC| y valen 0.44", () => {
  const rows = [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA BANCOMER", saldoFinal: 8_742_172.25 }),
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR",
      categoriaMaestra: "Pasivo",
      saldoFinal: -19_943_359.34,
    }),
  ];
  const structure = structureFromBalanza(rows);
  assert.equal(structure.activoCirculante, 8_742_172.25);
  assert.equal(structure.pasivoCirculante, -19_943_359.34);

  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: rows,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  assert.equal(snapshot.nwc, -11_201_187.09);
  // Sin el abs, NWC habría sido AC − (−PC) = +28,685,531.59
  assert.notEqual(snapshot.nwc, 28_685_531.59);

  const liquidez = calculateLiquidez(snapshot);
  const current = liquidez.find((m) => m.key === "currentRatio");
  const quick = liquidez.find((m) => m.key === "quickRatio");
  const cash = liquidez.find((m) => m.key === "cashRatio");
  // Denominador en valor absoluto: magnitud 0.44 con signo correcto (veces).
  assert.equal(current?.value, 0.44);
  assert.equal(quick?.value, 0.44);
  assert.equal(cash?.value, 0.44);

  const salud = buildSaludFinanciera(structure, pnlFromBalanza(rows), {
    saldoInicial: 0,
    entradasOperativas: 0,
    salidasOperativas: 0,
    salidasCapex: 0,
    servicioDeuda: 0,
    saldoFinal: 0,
    freeCashFlow: 0,
  });
  assert.equal(salud.liquidezCorriente.value, 0.44);
  assert.equal(salud.pruebaAcida.value, 0.44);
});

test("Endeudamiento: |pasivo total| / |patrimonio| — positivo con pasivos Compac negativos", () => {
  // Cifras reales jul-2026: pasivo −19,943,359.34 y patrimonio +9,749,857.41
  const rows = [
    balanzaRow({
      idCuenta: "2101-0001-0001-0000",
      nombreCuenta: "PROVEEDOR",
      categoriaMaestra: "Pasivo",
      saldoFinal: -19_943_359.34,
    }),
    balanzaRow({
      idCuenta: "3101-0001-0001-0000",
      nombreCuenta: "CAPITAL",
      categoriaMaestra: "Patrimonio",
      saldoFinal: 9_749_857.41,
    }),
  ];
  const structure = structureFromBalanza(rows);
  assert.equal(structure.pasivoTotal, -19_943_359.34);
  assert.equal(structure.patrimonioNeto, 9_749_857.41);

  const tesoreriaVacia = {
    saldoInicial: 0,
    entradasOperativas: 0,
    salidasOperativas: 0,
    salidasCapex: 0,
    servicioDeuda: 0,
    saldoFinal: 0,
    freeCashFlow: 0,
  };
  const salud = buildSaludFinanciera(structure, pnlFromBalanza(rows), tesoreriaVacia);

  // La magnitud es idéntica a la del cálculo con signo crudo: |−2.0455…| → 2.05
  const crudo = round2(structure.pasivoTotal / structure.patrimonioNeto);
  assert.equal(crudo, -2.05);
  assert.equal(salud.endeudamientoTotal.value, 2.05);
  assert.equal(salud.endeudamientoTotal.value, Math.abs(crudo));
  // Numerador/denominador se reportan en magnitud (convención del módulo)
  assert.equal(salud.endeudamientoTotal.numerator, 19_943_359.34);
  assert.equal(salud.endeudamientoTotal.denominator, 9_749_857.41);

  // Paridad: un tenant que persiste pasivos en positivo reporta lo mismo
  const positivos = rows.map((fila) =>
    balanzaRow({
      idCuenta: fila.idCuenta,
      nombreCuenta: fila.nombreCuenta,
      categoriaMaestra: fila.categoriaMaestra,
      saldoFinal: Math.abs(Number(fila.saldoFinal)),
    }),
  );
  const saludPos = buildSaludFinanciera(structureFromBalanza(positivos), pnlFromBalanza(positivos), tesoreriaVacia);
  assert.equal(saludPos.endeudamientoTotal.value, salud.endeudamientoTotal.value);
});
