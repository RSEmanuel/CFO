import assert from "node:assert/strict";
import test from "node:test";
import { computeErBuckets } from "@/services/estadoOperativo";
import {
  buildGastoOpexTreemap,
  cleanOpexCuentaNombre,
  TREEMAP_MIN_SHARE,
} from "@/services/gastoOpexTreemap";

function row(
  idCuenta: string,
  nombreCuenta: string,
  debe: number,
  haber = 0,
): { idCuenta: string; nombreCuenta: string; debe: number; haber: number } {
  return { idCuenta, nombreCuenta, debe, haber };
}

function roundish(value: number): number {
  return Math.round(value * 100) / 100;
}

test("treemap OPEX: jerarquía suma = totalOpex canónico (buckets y hojas)", () => {
  const rows = [
    row("6101-0001-0000-0000", "Sueldos y Salarios", 400),
    row("6101-0034-0000-0000", "Honorarios PF Res Nal", 300),
    row("6201-0055-0000-0000", "Papelería admin", 200),
    row("6301-0004-0000-0000", "Depreciación Mobiliario", 100),
    row("6501-0001-0000-0000", "Otros operativos", 50),
    // Fuera del universo OPEX: no deben aparecer ni mover el total.
    row("6405-0001-0000-0000", "PTU", 900),
    row("6406-0001-0000-0000", "ISR", 800),
    row("8101-0001-0000-0000", "Intereses", 700),
  ];
  const treemap = buildGastoOpexTreemap(rows, null);
  const totalCanonico = computeErBuckets(rows).totalOpex;
  assert.equal(treemap.totalOpex, totalCanonico);
  assert.equal(treemap.totalOpex, 1050);
  assert.equal(roundish(treemap.buckets.reduce((sum, bucket) => sum + bucket.monto, 0)), totalCanonico);
  for (const bucket of treemap.buckets) {
    assert.equal(
      roundish(bucket.leaves.reduce((sum, leaf) => sum + leaf.monto, 0)),
      bucket.monto,
      `bucket ${bucket.bucket} no cuadra`,
    );
  }
  assert.deepEqual(
    treemap.buckets.map((bucket) => bucket.bucket),
    ["venta", "admin", "otros"],
  );
  // 6301 (D&A) y 6501 (otros 6xxx) caen en el bucket "otros".
  const otros = treemap.buckets.find((bucket) => bucket.bucket === "otros");
  assert.equal(otros?.monto, 150);
});

test("treemap OPEX: subcuentas < 1% del total se pliegan en Otros gastos menores", () => {
  // Total 10_000 → umbral 100. "Chica" (50) y "Mediana" (99.99) se pliegan.
  const rows = [
    row("6101-0001-0000-0000", "Grande", 9_000),
    row("6101-0002-0000-0000", "Justa", 850.01),
    row("6101-0003-0000-0000", "Mediana", 99.99),
    row("6101-0004-0000-0000", "Chica", 50),
  ];
  const treemap = buildGastoOpexTreemap(rows, null);
  assert.equal(treemap.totalOpex, 10_000);
  const venta = treemap.buckets.find((bucket) => bucket.bucket === "venta");
  assert.ok(venta);
  assert.deepEqual(
    venta.leaves.map((leaf) => [leaf.nombreCuenta || "__otros__", leaf.monto]),
    [
      ["Grande", 9_000],
      ["Justa", 850.01],
      ["__otros__", 149.99],
    ],
  );
  const otros = venta.leaves.find((leaf) => leaf.esOtrosMenores);
  assert.equal(otros?.idCuenta, null);
  assert.equal(otros?.pctTotal, 1.5);
  // La hoja visible más chica supera el umbral del 1%.
  assert.ok((venta.leaves[1]?.monto ?? 0) >= treemap.totalOpex * TREEMAP_MIN_SHARE);
});

test("treemap OPEX: sin pliegue cuando todo supera el 1%; residuo ≤ 0 no dibuja hoja", () => {
  const rows = [
    row("6101-0001-0000-0000", "Alfa", 600),
    row("6101-0002-0000-0000", "Beta", 400),
  ];
  const treemap = buildGastoOpexTreemap(rows, null);
  const venta = treemap.buckets.find((bucket) => bucket.bucket === "venta");
  assert.equal(venta?.leaves.length, 2);
  assert.ok(venta?.leaves.every((leaf) => !leaf.esOtrosMenores));

  // Contra-asiento negativo: el pliegue neto queda ≤ 0 y se omite.
  const conNegativo = [
    row("6101-0001-0000-0000", "Alfa", 1_000),
    row("6101-0002-0000-0000", "Reclasificación", -5),
  ];
  const treeNeg = buildGastoOpexTreemap(conNegativo, null);
  const ventaNeg = treeNeg.buckets.find((bucket) => bucket.bucket === "venta");
  assert.equal(ventaNeg?.monto, 995);
  assert.deepEqual(ventaNeg?.leaves.map((leaf) => leaf.nombreCuenta), ["Alfa"]);
});

test("treemap OPEX: ΔMoM por cuenta; mes anterior 0 o sin balanza → null", () => {
  const actual = [
    row("6101-0001-0000-0000", "Sueldos", 1_100),
    row("6101-0002-0000-0000", "Renta", 500),
    row("6101-0003-0000-0000", "Cuenta nueva", 300),
  ];
  const anterior = [
    row("6101-0001-0000-0000", "Sueldos", 1_000),
    row("6101-0002-0000-0000", "Renta", 0),
  ];
  const treemap = buildGastoOpexTreemap(actual, anterior, "2026-06");
  assert.equal(treemap.periodoAnterior, "2026-06");
  const venta = treemap.buckets.find((bucket) => bucket.bucket === "venta");
  const sueldos = venta?.leaves.find((leaf) => leaf.idCuenta === "6101-0001-0000-0000");
  const renta = venta?.leaves.find((leaf) => leaf.idCuenta === "6101-0002-0000-0000");
  const nueva = venta?.leaves.find((leaf) => leaf.idCuenta === "6101-0003-0000-0000");
  assert.equal(sueldos?.deltaMomPct, 10);
  assert.equal(renta?.deltaMomPct, null, "mes anterior en 0 → sin Δ inventado");
  assert.equal(nueva?.deltaMomPct, null, "cuenta nueva → null");
  assert.equal(venta?.deltaMomPct, 90);

  const sinHistoria = buildGastoOpexTreemap(actual, null);
  assert.equal(sinHistoria.periodoAnterior, null);
  const ventaSin = sinHistoria.buckets.find((bucket) => bucket.bucket === "venta");
  assert.ok(ventaSin?.leaves.every((leaf) => leaf.deltaMomPct === null));
  assert.equal(ventaSin?.deltaMomPct, null);
});

test("treemap OPEX: ΔMoM del pliegue usa las mismas cuentas plegadas", () => {
  const actual = [
    row("6101-0001-0000-0000", "Grande", 10_000),
    row("6101-0002-0000-0000", "Chica A", 60),
    row("6101-0003-0000-0000", "Chica B", 40),
  ];
  const anterior = [
    row("6101-0001-0000-0000", "Grande", 9_000),
    row("6101-0002-0000-0000", "Chica A", 50),
    row("6101-0003-0000-0000", "Chica B", 50),
  ];
  const treemap = buildGastoOpexTreemap(actual, anterior, "2026-06");
  const venta = treemap.buckets.find((bucket) => bucket.bucket === "venta");
  const otros = venta?.leaves.find((leaf) => leaf.esOtrosMenores);
  assert.equal(otros?.monto, 100);
  assert.equal(otros?.deltaMomPct, 0);
});

test("treemap OPEX: mes sin OPEX → buckets vacíos", () => {
  const treemap = buildGastoOpexTreemap([row("4101-0001-0000-0000", "Ventas", 0, 1_000)], null);
  assert.equal(treemap.totalOpex, 0);
  assert.deepEqual(treemap.buckets, []);
});

test("cleanOpexCuentaNombre: mapea nombres crudos CONTPAQi a etiquetas legibles", () => {
  assert.equal(cleanOpexCuentaNombre("Gtos no ded (sin requisito fis"), "Gastos No Deducibles");
  assert.equal(cleanOpexCuentaNombre("Honorarios PF Res Nal"), "Honorarios Personas Físicas");
  assert.equal(cleanOpexCuentaNombre("Honorarios PM Res Nac"), "Honorarios Personas Morales");
  assert.equal(cleanOpexCuentaNombre("Arrendamiento PM Res Nac"), "Arrendamiento a Personas Morales");
  assert.equal(cleanOpexCuentaNombre("Papelería y articulos de ofici"), "Papelería y Artículos de Oficina");
});

test("cleanOpexCuentaNombre: tolera variantes de captura y no inventa lo desconocido", () => {
  // Normalización: mayúsculas/acentos/espacios no rompen el mapeo.
  assert.equal(cleanOpexCuentaNombre("  HONORARIOS  PF RES NAL "), "Honorarios Personas Físicas");
  assert.equal(cleanOpexCuentaNombre("Papeleria y articulos de ofici"), "Papelería y Artículos de Oficina");
  // Nombre no mapeado se conserva (recortado), sin inventar etiquetas.
  assert.equal(cleanOpexCuentaNombre("Sueldos y Salarios"), "Sueldos y Salarios");
  assert.equal(cleanOpexCuentaNombre("  Depreciación Equipo de Cómputo "), "Depreciación Equipo de Cómputo");
});
