import assert from "node:assert/strict";
import test from "node:test";
import { computeErBuckets, type ErBuckets } from "@/services/estadoOperativo";
import { round2 } from "@/services/money";
import {
  PUENTE_ANTIGUEDAD_ROJA_DIAS,
  antiguedadDiasDesde,
  classifyPuenteCuenta,
  computeImpuestosMonitor,
  computeRifDesglose,
  corteDePeriodo,
  evaluarCuentasPuente,
  satRefRif,
  semaforoCuenta,
  type RifBalanzaRow,
} from "@/services/rifAuditoria";

function row(overrides: Partial<RifBalanzaRow> & { idCuenta: string }): RifBalanzaRow {
  return {
    nombreCuenta: overrides.idCuenta,
    debe: 0,
    haber: 0,
    saldoFinal: 0,
    anio: 2026,
    periodo: 7,
    ...overrides,
  };
}

function buckets(overrides: Partial<ErBuckets>): ErBuckets {
  return {
    ventas: 0,
    costo: 0,
    utilidadBruta: 0,
    gastosVenta: 0,
    gastosAdmin: 0,
    daContable: 0,
    otrosOperativos: 0,
    totalOpex: 0,
    ebit: 0,
    da: 0,
    ebitda: 0,
    productosFinancieros: 0,
    gastosFinancieros: 0,
    rif: 0,
    ebt: 0,
    ptu: 0,
    isr: 0,
    utilidadNeta: 0,
    ...overrides,
  };
}

test("satRefRif: mapeo spec-SAT ↔ cuentas reales del catálogo Compac", () => {
  // Verificado contra balanzas_pnl del tenant (2024-08 → 2026-07).
  assert.equal(satRefRif("8101-0001-0000-0000", "Pérdida cambiaria"), "SAT 801");
  assert.equal(satRefRif("8101-0002-0000-0000", "INTERESES A CARGO BANCARIOS"), "SAT 701");
  assert.equal(satRefRif("8101-0010-0000-0000", "Comisiones bancarias"), "SAT 702");
  assert.equal(satRefRif("8101-0011-0000-0000", "Otros gastos financieros"), "SAT 701/702");
  assert.equal(satRefRif("7102-0001-0000-0000", "Utilidad cambiaria"), "SAT 802");
  assert.equal(satRefRif("7102-0002-0000-0000", "Ganancia de fondos de inversió"), "SAT 107");
  assert.equal(satRefRif("7102-0010-0000-0000", "Otros productos financieros"), "SAT 107");
  assert.equal(satRefRif("7104-0022-0000-0000", "Ingresos por cond. de adeudos"), "SAT 107");
  assert.equal(satRefRif("7104-0023-0000-0000", "Otros productos"), "SAT 107");
});

test("classifyPuenteCuenta: clases de riesgo del catálogo real y exclusiones documentadas", () => {
  // Anticipos de clientes: prefijo 2306 o "anticipo" en 2xxx.
  assert.equal(classifyPuenteCuenta("2306-0001-0000-0000", "Anticipo de cliente nacional"), "anticiposClientes");
  // Impuestos y retenciones por enterar: 21xx con nombre fiscal.
  assert.equal(classifyPuenteCuenta("2116-0001-0000-0000", "IMP. RET DE ISR SUELDOS Y SALA"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2116-0010-0000-0000", "IVA Retenido"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2116-0011-0000-0000", "RET. IMSS A LOS TRABAJADORES"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2113-0001-0000-0000", "IVA por pagar"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2113-0004-0000-0000", "IMP. ESTATAL S. NÓMINA POR PAGAR"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2111-0001-0000-0000", "PROV. DE IMSS PATRONAL POR PAGAR"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2111-0002-0000-0000", "PROVISIÓN DE SAR POR PAGAR"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2115-0001-0000-0000", "PTU x pagar"), "impuestosPorEnterar");
  assert.equal(classifyPuenteCuenta("2109-0001-0000-0000", "IVA trasladado no cobrado"), "impuestosPorEnterar");
  // Funcionarios y empleados: 1107 (deudores diversos del catálogo real).
  assert.equal(classifyPuenteCuenta("1107-0001-0052-0000", "CARMINA MERCEDES DE LA PARRA SILVA"), "funcionariosEmpleados");
  // Exclusiones: nómina no fiscal, impuestos diferidos (LP), anticipos de
  // acreedores "ANT.", proveedores, TDC, impuestos a favor (activo).
  assert.equal(classifyPuenteCuenta("2110-0001-0000-0000", "PROVISÍON SUELDOS Y SALARIOS"), null);
  assert.equal(classifyPuenteCuenta("2359-0003-0000-0000", "Otros impuestos diferidos"), null);
  assert.equal(classifyPuenteCuenta("2107-0001-0001-0000", "ANT. CAJA POPULAR CRISTOBAL CO"), null);
  assert.equal(classifyPuenteCuenta("2101-0001-0001-0000", "MAPFRE MEXICO AC"), null);
  assert.equal(classifyPuenteCuenta("2106-0002-0000-0000", "TDC AMEX ING DANIEL GUZMAN"), null);
  assert.equal(classifyPuenteCuenta("1108-0002-0000-0000", "ISR A FAVOR"), null);
  assert.equal(classifyPuenteCuenta("1102-0001-0001-0000", "BBVA BANCOMER"), null);
});

/** Balanza sintética may→jul 2026 con RIF, ventas y cuenta padre ruidosa. */
function rifRows(): RifBalanzaRow[] {
  const rows: RifBalanzaRow[] = [];
  const push = (periodo: number, idCuenta: string, nombre: string, debe: number, haber: number) =>
    rows.push(row({ idCuenta, nombreCuenta: nombre, debe, haber, periodo }));
  for (const periodo of [5, 6, 7]) {
    push(periodo, "4101-0001-0000-0000", "Ventas", 0, 10_000);
  }
  push(5, "8101-0001-0000-0000", "Pérdida cambiaria", 100, 0);
  push(6, "8101-0001-0000-0000", "Pérdida cambiaria", 200, 0);
  push(7, "8101-0001-0000-0000", "Pérdida cambiaria", 150, 0);
  push(5, "8101-0002-0000-0000", "INTERESES A CARGO BANCARIOS", 1_000, 0);
  push(6, "8101-0002-0000-0000", "INTERESES A CARGO BANCARIOS", 1_200, 0);
  push(7, "8101-0002-0000-0000", "INTERESES A CARGO BANCARIOS", 1_100, 0);
  push(7, "8101-0010-0000-0000", "Comisiones bancarias", 50, 0);
  push(5, "7102-0001-0000-0000", "Utilidad cambiaria", 0, 80);
  push(6, "7102-0001-0000-0000", "Utilidad cambiaria", 0, 90);
  push(7, "7102-0001-0000-0000", "Utilidad cambiaria", 0, 100);
  push(6, "7104-0023-0000-0000", "Otros productos", 5, 0);
  push(7, "7104-0023-0000-0000", "Otros productos", 0, 1.02);
  // Cuenta padre con monto ruidoso: no debe inflar el desglose (solo hojas).
  push(7, "8101-0000-0000-0000", "Gastos financieros", 99_999, 0);
  return rows;
}

const SERIE = [
  { anio: 2026, mes: 5 },
  { anio: 2026, mes: 6 },
  { anio: 2026, mes: 7 },
];

test("computeRifDesglose: el desglose por subcuenta cuadra con el ER canónico", () => {
  const rows = rifRows();
  const desglose = computeRifDesglose({
    rows,
    target: { anio: 2026, mes: 7 },
    prior: { anio: 2026, mes: 6 },
    seriePeriodos: SERIE,
  });

  const erBuckets = (scope: (r: RifBalanzaRow) => boolean) =>
    computeErBuckets(rows.filter(scope).map((r) => ({ idCuenta: r.idCuenta, nombreCuenta: r.nombreCuenta, debe: r.debe, haber: r.haber })));
  const erMes = erBuckets((r) => r.anio === 2026 && r.periodo === 7);
  const erYtd = erBuckets((r) => r.anio === 2026 && r.periodo <= 7);
  const erPrior = erBuckets((r) => r.anio === 2026 && r.periodo === 6);

  // Cuadre mes / YTD / mes anterior contra la aritmética canónica.
  assert.equal(desglose.totalGastos.mes, erMes.gastosFinancieros);
  assert.equal(desglose.totalProductos.mes, erMes.productosFinancieros);
  assert.equal(desglose.rifNeto.mes, erMes.rif);
  assert.equal(desglose.totalGastos.ytd, erYtd.gastosFinancieros);
  assert.equal(desglose.totalProductos.ytd, erYtd.productosFinancieros);
  assert.equal(desglose.rifNeto.ytd, erYtd.rif);
  assert.equal(desglose.totalGastos.mesAnterior, erPrior.gastosFinancieros);
  assert.equal(desglose.rifNeto.mesAnterior, erPrior.rif);

  // Cifras esperadas del dataset (la cuenta padre 8101-0000 queda fuera).
  assert.equal(desglose.totalGastos.mes, 1_300);
  assert.equal(desglose.totalProductos.mes, 101.02);
  assert.equal(desglose.rifNeto.mes, -1_198.98);
  assert.equal(desglose.totalGastos.ytd, 3_800);
  assert.equal(desglose.rifNeto.ytd, -3_533.98);
  assert.equal(desglose.rifNeto.mesAnterior, -1_315);
  assert.equal(desglose.totalGastos.variacion, -100);
  assert.equal(desglose.totalProductos.variacion, 16.02);
  assert.equal(desglose.rifNeto.variacion, 116.02);

  // Filas: 4 gastos + 2 productos, ordenadas por código, sin la padre.
  assert.deepEqual(
    desglose.filas.map((fila) => fila.idCuenta),
    [
      "7102-0001-0000-0000",
      "7104-0023-0000-0000",
      "8101-0001-0000-0000",
      "8101-0002-0000-0000",
      "8101-0010-0000-0000",
    ],
  );
  const intereses = desglose.filas.find((fila) => fila.idCuenta === "8101-0002-0000-0000");
  assert.equal(intereses?.naturaleza, "gasto");
  assert.equal(intereses?.satRef, "SAT 701");
  assert.equal(intereses?.mes, 1_100);
  assert.equal(intereses?.mesAnterior, 1_200);
  assert.equal(intereses?.variacion, -100);
  const otrosProductos = desglose.filas.find((fila) => fila.idCuenta === "7104-0023-0000-0000");
  assert.equal(otrosProductos?.naturaleza, "producto");
  assert.equal(otrosProductos?.mesAnterior, -5, "debe > haber en el mes anterior = producto negativo");

  // Ventas del ER por columna (base del modo %).
  assert.equal(desglose.ventas.mes, 10_000);
  assert.equal(desglose.ventas.ytd, 30_000);
  assert.equal(desglose.ventas.mesAnterior, 10_000);

  // Serie mensual: un punto por periodo, en orden ascendente, cuadrada con ER.
  assert.deepEqual(
    desglose.serieMensual.map((point) => `${point.anio}-${point.periodo}`),
    ["2026-5", "2026-6", "2026-7"],
  );
  const jul = desglose.serieMensual.at(-1);
  assert.equal(jul?.gastos, erMes.gastosFinancieros);
  assert.equal(jul?.productos, erMes.productosFinancieros);
  assert.equal(jul?.rifNeto, erMes.rif);
});

test("computeRifDesglose: sin balanza del mes anterior las variaciones quedan en null", () => {
  const rows = rifRows().filter((r) => r.periodo !== 6);
  const desglose = computeRifDesglose({
    rows,
    target: { anio: 2026, mes: 7 },
    prior: { anio: 2026, mes: 6 },
    seriePeriodos: [
      { anio: 2026, mes: 5 },
      { anio: 2026, mes: 7 },
    ],
  });
  assert.equal(desglose.totalGastos.mesAnterior, null);
  assert.equal(desglose.totalGastos.variacion, null);
  assert.equal(desglose.rifNeto.mesAnterior, null);
  assert.equal(desglose.ventas.mesAnterior, null);
  const intereses = desglose.filas.find((fila) => fila.idCuenta === "8101-0002-0000-0000");
  assert.equal(intereses?.mesAnterior, null);
  assert.equal(intereses?.variacion, null);
});

test("computeImpuestosMonitor: sin provisión → estado documentado y tasa 0% con nota", () => {
  const monitor = computeImpuestosMonitor(
    buckets({ ebt: 1_000 }),
    buckets({ ebt: 5_000 }),
  );
  assert.equal(monitor.isr.sinProvision, true);
  assert.equal(monitor.ptu.sinProvision, true);
  assert.equal(monitor.tasaEfectivaYtd, 0);
  assert.equal(monitor.notaTasa, "sinProvisionIsr");
  assert.equal(monitor.ebtYtd, 5_000);
});

test("computeImpuestosMonitor: con provisión la tasa efectiva es ISR/EBT del ER canónico", () => {
  const monitor = computeImpuestosMonitor(
    buckets({ isr: 90, ebt: 300 }),
    buckets({ isr: 300, ebt: 1_000, ptu: 50 }),
  );
  assert.equal(monitor.isr.sinProvision, false);
  assert.equal(monitor.ptu.sinProvision, false);
  assert.equal(monitor.tasaEfectivaYtd, 30);
  assert.equal(monitor.tasaEfectivaMes, 30);
  assert.equal(monitor.notaTasa, null);
});

test("computeImpuestosMonitor: EBT sin utilidad con ISR > 0 → tasa no aplicable", () => {
  const monitor = computeImpuestosMonitor(
    buckets({ isr: 100, ebt: -200 }),
    buckets({ isr: 100, ebt: -500 }),
  );
  assert.equal(monitor.tasaEfectivaYtd, null);
  assert.equal(monitor.notaTasa, "ebtSinUtilidad");
});

test("semaforoCuenta: reglas verde / ámbar / rojo documentadas", () => {
  // Verde: sin saldo (tolerancia de redondeo $1.00).
  assert.deepEqual(semaforoCuenta({ saldo: 0, saldoAnterior: 0, antiguedadDias: null }), {
    semaforo: "verde",
    motivos: [],
  });
  assert.equal(semaforoCuenta({ saldo: 0.5, saldoAnterior: 0, antiguedadDias: 999 }).semaforo, "verde");
  // Ámbar: saldo presente, estable o decreciente.
  assert.deepEqual(semaforoCuenta({ saldo: -30_251.1, saldoAnterior: -48_605.62, antiguedadDias: 1 }), {
    semaforo: "ambar",
    motivos: ["saldoPresente"],
  });
  // Ámbar con nota: saldo creciente vs mes anterior.
  assert.deepEqual(semaforoCuenta({ saldo: -41_635.53, saldoAnterior: -32_380.25, antiguedadDias: 1 }), {
    semaforo: "ambar",
    motivos: ["saldoPresente", "saldoCreciente"],
  });
  // Sin auxiliares no hay antigüedad → no aplica rojo.
  assert.equal(semaforoCuenta({ saldo: 300, saldoAnterior: 300, antiguedadDias: null }).semaforo, "ambar");
  // Rojo: saldo presente con más de 60 días sin movimiento en auxiliares.
  const rojo = semaforoCuenta({ saldo: 235_000.12, saldoAnterior: 235_000.12, antiguedadDias: PUENTE_ANTIGUEDAD_ROJA_DIAS + 1 });
  assert.equal(rojo.semaforo, "rojo");
  assert.ok(rojo.motivos.includes("antiguedad60"));
  // Exactamente 60 días aún no es rojo.
  assert.equal(
    semaforoCuenta({ saldo: 100, saldoAnterior: 100, antiguedadDias: PUENTE_ANTIGUEDAD_ROJA_DIAS }).semaforo,
    "ambar",
  );
});

test("antiguedadDiasDesde: días desde el último movimiento al cierre del periodo", () => {
  const corte = corteDePeriodo({ anio: 2026, mes: 7 });
  assert.equal(corte.toISOString().slice(0, 10), "2026-07-31");
  const esperado = Math.floor((Date.UTC(2026, 6, 31) - Date.UTC(2025, 1, 16)) / 86_400_000);
  assert.equal(antiguedadDiasDesde(new Date("2025-02-16T00:00:00.000Z"), corte), esperado);
  assert.equal(esperado, 530);
  assert.equal(antiguedadDiasDesde(new Date("2026-07-31T00:00:00.000Z"), corte), 0);
});

test("evaluarCuentasPuente: semáforo por clase con datos del catálogo real", () => {
  const rows: RifBalanzaRow[] = [
    // Anticipos de clientes sin saldo → verde.
    row({ idCuenta: "2306-0001-0000-0000", nombreCuenta: "Anticipo de cliente nacional", periodo: 6, saldoFinal: 0 }),
    row({ idCuenta: "2306-0001-0000-0000", nombreCuenta: "Anticipo de cliente nacional", periodo: 7, saldoFinal: 0 }),
    // Impuestos por enterar: uno decreciente, uno creciente → ámbar.
    row({ idCuenta: "2116-0001-0000-0000", nombreCuenta: "IMP. RET DE ISR SUELDOS Y SALA", periodo: 6, saldoFinal: -48_605.62 }),
    row({ idCuenta: "2116-0001-0000-0000", nombreCuenta: "IMP. RET DE ISR SUELDOS Y SALA", periodo: 7, saldoFinal: -30_251.1 }),
    row({ idCuenta: "2116-0010-0000-0000", nombreCuenta: "IVA Retenido", periodo: 6, saldoFinal: -32_380.25 }),
    row({ idCuenta: "2116-0010-0000-0000", nombreCuenta: "IVA Retenido", periodo: 7, saldoFinal: -41_635.53 }),
    // Provisión de sueldos: NO es cuenta puente fiscal (exclusión documentada).
    row({ idCuenta: "2110-0001-0000-0000", nombreCuenta: "PROVISÍON SUELDOS Y SALARIOS", periodo: 7, saldoFinal: -1_000 }),
    // Funcionarios y empleados: un saldo envejecido (rojo), uno nuevo (ámbar), uno sin auxiliares (ámbar).
    row({ idCuenta: "1107-0001-0052-0000", nombreCuenta: "CARMINA MERCEDES DE LA PARRA SILVA", periodo: 6, saldoFinal: 235_000.12 }),
    row({ idCuenta: "1107-0001-0052-0000", nombreCuenta: "CARMINA MERCEDES DE LA PARRA SILVA", periodo: 7, saldoFinal: 235_000.12 }),
    row({ idCuenta: "1107-0001-0018-0000", nombreCuenta: "ALFREDO SANCHEZ AVELAR", periodo: 6, saldoFinal: 0 }),
    row({ idCuenta: "1107-0001-0018-0000", nombreCuenta: "ALFREDO SANCHEZ AVELAR", periodo: 7, saldoFinal: 200_000, debe: 200_000 }),
    row({ idCuenta: "1107-0001-0049-0000", nombreCuenta: "GERMAN GUERRERO ROMERO", periodo: 6, saldoFinal: 300 }),
    row({ idCuenta: "1107-0001-0049-0000", nombreCuenta: "GERMAN GUERRERO ROMERO", periodo: 7, saldoFinal: 300 }),
    // Cuenta padre con saldo ruidoso: se excluye por no ser hoja.
    row({ idCuenta: "1107-0000-0000-0000", nombreCuenta: "Deudores diversos", periodo: 7, saldoFinal: 435_300.12 }),
  ];
  const auxUltimoMov: Record<string, string> = {
    "2116-0001-0000-0000": "2026-07-30T00:00:00.000Z",
    "2116-0010-0000-0000": "2026-07-26T00:00:00.000Z",
    "1107-0001-0052-0000": "2025-02-16T00:00:00.000Z",
    "1107-0001-0018-0000": "2026-07-30T00:00:00.000Z",
  };

  const clases = evaluarCuentasPuente({
    rows,
    target: { anio: 2026, mes: 7 },
    prior: { anio: 2026, mes: 6 },
    auxUltimoMov,
  });
  const byKey = Object.fromEntries(clases.map((clase) => [clase.key, clase]));

  const anticipos = byKey.anticiposClientes;
  assert.equal(anticipos.existeEnCatalogo, true);
  assert.equal(anticipos.semaforo, "verde");
  assert.equal(anticipos.saldo, 0);
  assert.equal(anticipos.cuentasConSaldo, 0);

  const impuestos = byKey.impuestosPorEnterar;
  assert.equal(impuestos.semaforo, "ambar");
  assert.equal(impuestos.saldo, round2(-30_251.1 - 41_635.53));
  assert.equal(impuestos.saldoAnterior, round2(-48_605.62 - 32_380.25));
  assert.equal(impuestos.variacionAbs, round2(71_886.63 - 80_985.87));
  assert.equal(impuestos.cuentasConSaldo, 2);
  // Orden por |saldo| descendente; la 2110 (sueldos) no entra a la clase.
  assert.deepEqual(
    impuestos.cuentas.map((cuenta) => cuenta.idCuenta),
    ["2116-0010-0000-0000", "2116-0001-0000-0000"],
  );
  assert.deepEqual(impuestos.cuentas[0]?.motivos, ["saldoPresente", "saldoCreciente"]);

  const funcionarios = byKey.funcionariosEmpleados;
  assert.equal(funcionarios.semaforo, "rojo", "la clase hereda el peor estado");
  assert.equal(funcionarios.saldo, 435_300.12, "la cuenta padre 1107-0000 no infla el saldo");
  assert.equal(funcionarios.cuentasConSaldo, 3);
  assert.deepEqual(
    funcionarios.cuentas.map((cuenta) => cuenta.idCuenta),
    ["1107-0001-0052-0000", "1107-0001-0018-0000", "1107-0001-0049-0000"],
  );
  const envejecida = funcionarios.cuentas[0];
  assert.equal(envejecida?.semaforo, "rojo");
  assert.equal(envejecida?.antiguedadDias, 530);
  const nueva = funcionarios.cuentas[1];
  assert.equal(nueva?.semaforo, "ambar");
  assert.ok(nueva?.motivos.includes("saldoCreciente"));
  const sinAux = funcionarios.cuentas[2];
  assert.equal(sinAux?.semaforo, "ambar");
  assert.equal(sinAux?.antiguedadDias, null);
});

test("evaluarCuentasPuente: clase ausente del catálogo → sinCuentas (fila atenuada)", () => {
  const rows: RifBalanzaRow[] = [
    row({ idCuenta: "2116-0001-0000-0000", nombreCuenta: "IMP. RET DE ISR SUELDOS Y SALA", periodo: 7, saldoFinal: -100 }),
  ];
  const clases = evaluarCuentasPuente({
    rows,
    target: { anio: 2026, mes: 7 },
    prior: { anio: 2026, mes: 6 },
    auxUltimoMov: {},
  });
  const byKey = Object.fromEntries(clases.map((clase) => [clase.key, clase]));
  assert.equal(byKey.anticiposClientes.semaforo, "sinCuentas");
  assert.equal(byKey.anticiposClientes.existeEnCatalogo, false);
  assert.equal(byKey.funcionariosEmpleados.semaforo, "sinCuentas");
  // Sin balanza del mes anterior: saldoAnterior y variación en null.
  assert.equal(byKey.impuestosPorEnterar.saldoAnterior, null);
  assert.equal(byKey.impuestosPorEnterar.variacionAbs, null);
  assert.equal(byKey.impuestosPorEnterar.cuentas[0]?.saldoAnterior, null);
});
