import assert from "node:assert/strict";
import test from "node:test";
import { computeErBuckets } from "@/services/estadoOperativo";
import { buildGastoOpexGrupos, buildGastoOpexSeries, rankingGastoOpex, computeGastoOpexControl, computeJawsRatio, detectGastoOpexAlertas, isLaborOpexNombre, matchLaborOpexCuentas, opexAbsorptionPct, opexCommercialSplit } from "@/services/gastoOpex";
import { OTROS_KEY, trailingMonths } from "@/services/resultadosTop5";

function row(
  idCuenta: string,
  nombreCuenta: string,
  debe: number,
  haber = 0,
): { idCuenta: string; nombreCuenta: string; debe: number; haber: number } {
  return { idCuenta, nombreCuenta, debe, haber };
}

test("gasto OPEX: solo hojas 61/62/63/6xxx; excluye padres, PTU, ISR y 8101", () => {
  const { grupos, totalOpex } = buildGastoOpexGrupos([
    row("6101-0000-0000-0000", "Gastos de venta (mayor)", 9_999),
    row("6101-0001-0001-0000", "Sueldos venta", 400),
    row("6201-0001-0001-0000", "Honorarios admin", 250),
    row("6301-0001-0000-0000", "Depreciación", 80),
    row("6501-0001-0000-0000", "Otros operativos", 20),
    row("6405-0001-0000-0000", "PTU", 500),
    row("6406-0001-0000-0000", "ISR", 300),
    row("8101-0001-0000-0000", "Intereses", 700),
  ]);
  assert.deepEqual(
    grupos.filter((grupo) => grupo.monto > 0).map((grupo) => [grupo.key, grupo.monto]),
    [
      ["6101-0001-0001-0000", 400],
      ["6201-0001-0001-0000", 250],
      ["6301-0001-0000-0000", 80],
      ["6501-0001-0000-0000", 20],
    ],
  );
  assert.equal(totalOpex, 750);
  assert.equal(totalOpex, computeErBuckets([
    row("6101-0000-0000-0000", "Gastos de venta (mayor)", 9_999),
    row("6101-0001-0001-0000", "Sueldos venta", 400),
    row("6201-0001-0001-0000", "Honorarios admin", 250),
    row("6301-0001-0000-0000", "Depreciación", 80),
    row("6501-0001-0000-0000", "Otros operativos", 20),
    row("6405-0001-0000-0000", "PTU", 500),
    row("6406-0001-0000-0000", "ISR", 300),
    row("8101-0001-0000-0000", "Intereses", 700),
  ]).totalOpex);
});

test("Top5 + Otros suma el total canónico", () => {
  const cuentas = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    row(`6101-000${n}-0000-0000`, `Cuenta ${n}`, n * 100),
  );
  const { grupos, totalOpex } = buildGastoOpexGrupos(cuentas);
  const ranking = rankingGastoOpex(grupos, 5);
  const months = trailingMonths(2026, 7, 1);
  const series = buildGastoOpexSeries(months, [grupos], [totalOpex], ranking, 5);
  const top = series.entidades.reduce((sum, entidad) => sum + entidad.monto, 0);
  assert.equal(ranking.length, 5);
  assert.ok(series.resto);
  assert.equal(series.resto?.key, OTROS_KEY);
  assert.equal(roundish(top + (series.resto?.monto ?? 0)), totalOpex);
  assert.equal(series.total[0], totalOpex);
});

function roundish(value: number): number {
  return Math.round(value * 100) / 100;
}

test("mes sin movimiento de una cuenta top deja 0 y no rompe la continuidad", () => {
  const months = trailingMonths(2026, 7, 3);
  const jun = [
    { key: "A", label: "Nómina", monto: 500 },
    { key: "B", label: "Renta", monto: 200 },
    { key: "C", label: "Luz", monto: 50 },
  ];
  const jul = [
    { key: "A", label: "Nómina", monto: 400 },
    { key: "C", label: "Luz", monto: 80 },
    { key: "D", label: "Viajes", monto: 30 },
  ];
  const series = buildGastoOpexSeries(
    months,
    [[], jun, jul],
    [0, 750, 510],
    rankingGastoOpex(jul, 5),
    5,
  );
  const nomina = series.entidades.find((entidad) => entidad.key === "A");
  const renta = series.entidades.find((entidad) => entidad.key === "B");
  assert.ok(nomina);
  assert.deepEqual(nomina?.series, [0, 500, 400]);
  assert.equal(renta, undefined);
  const byMonth = series.total.map((total, index) => {
    const parts =
      series.entidades.reduce((sum, entidad) => sum + (entidad.series[index] ?? 0), 0) +
      (series.resto?.series[index] ?? 0);
    return roundish(parts) === total;
  });
  assert.deepEqual(byMonth, [true, true, true]);
});

test("empate de importe: orden estable por código de cuenta", () => {
  const { grupos } = buildGastoOpexGrupos([
    row("6101-0002-0000-0000", "Beta", 100),
    row("6101-0001-0000-0000", "Alfa", 100),
    row("6101-0003-0000-0000", "Gamma", 50),
  ]);
  assert.deepEqual(
    grupos.map((grupo) => grupo.key),
    ["6101-0001-0000-0000", "6101-0002-0000-0000", "6101-0003-0000-0000"],
  );
});

test("menos de 5 cuentas con gasto: no inventa filas; Otros solo si hay residuo", () => {
  const { grupos, totalOpex } = buildGastoOpexGrupos([
    row("6101-0001-0000-0000", "Sueldos", 300),
    row("6201-0001-0000-0000", "Renta", 100),
  ]);
  const ranking = rankingGastoOpex(grupos, 5);
  const months = trailingMonths(2026, 7, 1);
  const series = buildGastoOpexSeries(months, [grupos], [totalOpex], ranking, 5);
  assert.equal(series.entidades.length, 2);
  assert.equal(series.resto, null);
  assert.equal(
    series.entidades.reduce((sum, entidad) => sum + entidad.monto, 0),
    totalOpex,
  );
});

test("Otros absorbe el residuo (incluye cuentas fuera del Top 5 del mes activo)", () => {
  const months = trailingMonths(2026, 7, 2);
  const prev = [
    { key: "Z", label: "Histórico", monto: 900 },
    { key: "A", label: "Actual", monto: 10 },
  ];
  const activo = [
    { key: "A", label: "Actual", monto: 400 },
    { key: "B", label: "Dos", monto: 200 },
    { key: "C", label: "Tres", monto: 150 },
    { key: "D", label: "Cuatro", monto: 120 },
    { key: "E", label: "Cinco", monto: 80 },
    { key: "Z", label: "Histórico", monto: 50 },
  ];
  const series = buildGastoOpexSeries(months, [prev, activo], [910, 1000], rankingGastoOpex(activo, 5), 5);
  assert.deepEqual(
    series.entidades.map((entidad) => entidad.key),
    ["A", "B", "C", "D", "E"],
  );
  assert.deepEqual(series.entidades[0].series, [10, 400]);
  assert.deepEqual(series.resto?.series, [900, 50]);
  assert.equal(series.resto?.monto, 50);
});

test("absorción: ventas 0 o negativas → null; ratio a 1 decimal", () => {
  assert.equal(opexAbsorptionPct(1_366_225.75, 0), null);
  assert.equal(opexAbsorptionPct(100, -10), null);
  assert.equal(opexAbsorptionPct(412, 1000), 41.2);
});

test("jaws: mes anterior con ingreso u OPEX ≤ 0 → null; signo no se inventa", () => {
  assert.equal(
    computeJawsRatio({ ventasActual: 100, ventasAnterior: 0, opexActual: 40, opexAnterior: 30 }),
    null,
  );
  assert.equal(
    computeJawsRatio({ ventasActual: 100, ventasAnterior: 80, opexActual: 40, opexAnterior: 0 }),
    null,
  );
  const healthy = computeJawsRatio({
    ventasActual: 110,
    ventasAnterior: 100,
    opexActual: 40,
    opexAnterior: 40,
  });
  assert.equal(healthy?.badge, "saludable");
  assert.equal(healthy?.jawsPp, 10);
  const inverted = computeJawsRatio({
    ventasActual: 100,
    ventasAnterior: 100,
    opexActual: 50,
    opexAnterior: 40,
  });
  assert.equal(inverted?.badge, "invertida");
  assert.ok((inverted?.jawsPp ?? 0) < 0);
});

test("matching laboral: acentos/mayúsculas; excluye no laborales y 6405", () => {
  assert.equal(isLaborOpexNombre("SUELDOS Y SALARIOS"), true);
  assert.equal(isLaborOpexNombre("Cuotas al IMSS"), true);
  assert.equal(isLaborOpexNombre("Impuesto Estatal sobre Nóminas"), true);
  assert.equal(isLaborOpexNombre("Prima Vacacional"), true);
  assert.equal(isLaborOpexNombre("Aportaciones al SAR"), true);
  assert.equal(isLaborOpexNombre("Cesantía y vejez"), true);
  assert.equal(isLaborOpexNombre("Seguro de Gastos Médicos"), true);
  assert.equal(isLaborOpexNombre("Honorarios PF Res Nal"), false);
  assert.equal(isLaborOpexNombre("SERVICIO DE MAQ. NÓMINA"), false);
  assert.equal(isLaborOpexNombre("Capacitación al Personal"), false);
  assert.equal(isLaborOpexNombre("Arrendamiento PM Res Nac"), false);
  assert.equal(isLaborOpexNombre("PTU"), false);

  const { cuentas, total } = matchLaborOpexCuentas([
    row("6101-0001-0000-0000", "Sueldos y Salarios", 200),
    row("6101-0026-0000-0000", "Cuotas al IMSS", 50),
    row("6101-0029-0000-0000", "Impuesto Estatal sobre Nóminas", 10),
    row("6101-0034-0000-0000", "Honorarios PF Res Nal", 400),
    row("6201-0003-0000-0000", "SERVICIO DE MAQ. NÓMINA", 80),
    row("6405-0001-0000-0000", "Participacion de losTrabajadores", 500),
    row("8101-0001-0000-0000", "Sueldos financieros (fuera de OPEX)", 90),
  ]);
  assert.deepEqual(
    cuentas.map((cuenta) => cuenta.idCuenta),
    ["6101-0001-0000-0000", "6101-0026-0000-0000", "6101-0029-0000-0000"],
  );
  assert.equal(total, 260);
});

test("split venta+admin+otros = OPEX total; % nómina/OPEX", () => {
  const rows = [
    row("6101-0001-0000-0000", "Sueldos y Salarios", 400),
    row("6201-0055-0000-0000", "Papelería", 100),
    row("6301-0004-0000-0000", "Depreciación Mobiliario", 50),
    row("6501-0001-0000-0000", "Otros operativos", 50),
  ];
  const buckets = computeErBuckets(rows);
  const split = opexCommercialSplit(buckets);
  assert.equal(roundish(split.venta + split.admin + split.otros), split.total);
  assert.equal(split.total, buckets.totalOpex);
  assert.equal(split.venta, 400);
  assert.equal(split.admin, 100);
  assert.equal(split.otros, 100);
  const control = computeGastoOpexControl(rows, null, null);
  assert.equal(control.laboral.monto, 400);
  assert.equal(control.laboral.pctOpex, 66.7);
  assert.equal(control.absorcionPct, null);
});

test("control jaws usa mes anterior con datos; absorción con ventas", () => {
  const jun = [
    row("4101-0001-0000-0000", "Ventas", 0, 1000),
    row("6101-0001-0000-0000", "Sueldos y Salarios", 400),
  ];
  const jul = [
    row("4101-0001-0000-0000", "Ventas", 0, 1100),
    row("6101-0001-0000-0000", "Sueldos y Salarios", 420),
  ];
  const control = computeGastoOpexControl(jul, jun, "2026-06");
  assert.equal(control.absorcionPct, 38.2);
  assert.equal(control.jaws?.badge, "saludable");
  assert.equal(control.jaws?.periodoAnterior, "2026-06");
  assert.equal(control.anterior?.opex, 400);
});

test("fugas OPEX: exige ambas condiciones (20% y $25K); orden por excedente", () => {
  const prior = [
    row("6101-0001-0000-0000", "Ambas", 100_000),
    row("6101-0002-0000-0000", "Solo pct", 50_000),
    row("6101-0003-0000-0000", "Solo pesos", 200_000),
  ];
  const actual = [
    row("6101-0001-0000-0000", "Ambas", 150_000),
    row("6101-0002-0000-0000", "Solo pct", 65_000),
    row("6101-0003-0000-0000", "Solo pesos", 226_000),
  ];
  const alertas = detectGastoOpexAlertas(actual, [prior, prior, prior]);
  assert.deepEqual(
    alertas.map((alerta) => [alerta.idCuenta, alerta.excedente, alerta.desviacionPct]),
    [["6101-0001-0000-0000", 50_000, 50]],
  );
});

test("fugas OPEX: promedio con 1 mes de historia (n<3)", () => {
  const prior = [row("6101-0001-0000-0000", "Sueldos", 80_000)];
  const actual = [row("6101-0001-0000-0000", "Sueldos", 120_000)];
  const alertas = detectGastoOpexAlertas(actual, [prior]);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0]?.promedio3M, 80_000);
  assert.equal(alertas[0]?.mesesHistoria, 1);
  assert.equal(alertas[0]?.excedente, 40_000);
});

test("fugas OPEX: promedio 0 con gasto nuevo ≥ $25K → alerta N/A; < $25K no alerta", () => {
  const prior = [row("6101-0009-0000-0000", "Otra", 10_000)];
  const alerta = detectGastoOpexAlertas(
    [row("6101-0001-0000-0000", "Viaje nuevo", 25_000)],
    [prior],
  );
  assert.equal(alerta.length, 1);
  assert.equal(alerta[0]?.desviacionPct, null);
  assert.equal(alerta[0]?.promedio3M, 0);
  assert.equal(alerta[0]?.excedente, 25_000);

  const below = detectGastoOpexAlertas(
    [row("6101-0001-0000-0000", "Viaje chico", 24_999.99)],
    [prior],
  );
  assert.equal(below.length, 0);
});

test("fugas OPEX: gastoMes ≤ 0 nunca alerta; sin historia previa no alerta", () => {
  const prior = [row("6101-0001-0000-0000", "Sueldos", 100_000)];
  assert.equal(detectGastoOpexAlertas([row("6101-0001-0000-0000", "Sueldos", 0)], [prior]).length, 0);
  assert.equal(detectGastoOpexAlertas([row("6101-0001-0000-0000", "Sueldos", -10)], [prior]).length, 0);
  assert.equal(detectGastoOpexAlertas([row("6101-0001-0000-0000", "Sueldos", 200_000)], []).length, 0);
  assert.equal(detectGastoOpexAlertas([row("6101-0001-0000-0000", "Sueldos", 200_000)], [[]]).length, 0);
});

test("fugas OPEX: excluye 6405/6406/8101 aunque disparen umbrales", () => {
  const prior = [
    row("6405-0001-0000-0000", "PTU", 10_000),
    row("6406-0001-0000-0000", "ISR", 10_000),
    row("8101-0001-0000-0000", "Intereses", 10_000),
    row("6101-0001-0000-0000", "Sueldos", 100_000),
  ];
  const actual = [
    row("6405-0001-0000-0000", "PTU", 80_000),
    row("6406-0001-0000-0000", "ISR", 80_000),
    row("8101-0001-0000-0000", "Intereses", 80_000),
    row("6101-0001-0000-0000", "Sueldos", 100_000),
  ];
  assert.deepEqual(detectGastoOpexAlertas(actual, [prior]).map((alerta) => alerta.idCuenta), []);
});

test("fugas OPEX: orden desc por excedente con dos alertas", () => {
  const prior = [
    row("6101-0001-0000-0000", "Alfa", 50_000),
    row("6101-0002-0000-0000", "Beta", 50_000),
  ];
  const actual = [
    row("6101-0001-0000-0000", "Alfa", 80_000),
    row("6101-0002-0000-0000", "Beta", 120_000),
  ];
  assert.deepEqual(
    detectGastoOpexAlertas(actual, [prior]).map((alerta) => alerta.idCuenta),
    ["6101-0002-0000-0000", "6101-0001-0000-0000"],
  );
});
