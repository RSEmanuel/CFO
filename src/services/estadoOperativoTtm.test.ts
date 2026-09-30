import assert from "node:assert/strict";
import test from "node:test";
import { computeErBuckets, type ErCuentaRow } from "@/services/estadoOperativo";
import { buildEbitdaTtm, ttmWindow, type EbitdaTtmRow } from "@/services/estadoOperativoTtm";

function row(overrides: Partial<EbitdaTtmRow> & { idCuenta: string; anio: number; periodo: number }): EbitdaTtmRow {
  return {
    nombreCuenta: overrides.idCuenta,
    debe: 0,
    haber: 0,
    ...overrides,
  };
}

/** Mes canónico: ventas 1000, costo 400, OPEX 300 (6101), D&A 50 (6301). */
function mesCanonico(anio: number, periodo: number, factor = 1): EbitdaTtmRow[] {
  return [
    row({ idCuenta: "4101-0001-0000-0000", haber: 1000 * factor, anio, periodo }),
    row({ idCuenta: "5101-0001-0000-0000", debe: 400 * factor, anio, periodo }),
    row({ idCuenta: "6101-0001-0000-0000", debe: 300 * factor, anio, periodo }),
    row({ idCuenta: "6301-0001-0000-0000", nombreCuenta: "Depreciación", debe: 50 * factor, anio, periodo }),
  ];
}

test("ttmWindow: 12 meses ascendentes terminando en el periodo objetivo, cruzando año", () => {
  const window = ttmWindow({ anio: 2026, mes: 7 });
  assert.equal(window.length, 12);
  assert.deepEqual(window[0], { anio: 2025, mes: 8 });
  assert.deepEqual(window.at(-1), { anio: 2026, mes: 7 });
});

test("ttmWindow: sin cruzar año", () => {
  const window = ttmWindow({ anio: 2026, mes: 12 });
  assert.deepEqual(window[0], { anio: 2026, mes: 1 });
  assert.deepEqual(window.at(-1), { anio: 2026, mes: 12 });
});

test("buildEbitdaTtm: EBIT/EBITDA cuadran con computeErBuckets mes a mes", () => {
  const rows = [
    ...mesCanonico(2026, 6),
    ...mesCanonico(2026, 7, 2),
    ...mesCanonico(2026, 5, 0.5),
  ];
  const serie = buildEbitdaTtm(rows, { anio: 2026, mes: 7 });

  for (const periodo of ["2026-05", "2026-06", "2026-07"]) {
    const point = serie.find((p) => p.periodo === periodo);
    assert.ok(point, `falta ${periodo}`);
    const buckets = computeErBuckets(rows.filter((r) => `${r.anio}-${String(r.periodo).padStart(2, "0")}` === periodo));
    assert.equal(point.ebit, buckets.ebit);
    assert.equal(point.ebitda, buckets.ebitda);
    assert.equal(point.da, buckets.da);
    assert.equal(point.ventas, buckets.ventas);
    // identidad EBITDA = EBIT + D&A
    assert.equal(point.ebitda, point.ebit + point.da);
  }
});

test("buildEbitdaTtm: signo de EBIT negativo cuando OPEX supera la utilidad bruta", () => {
  const rows: EbitdaTtmRow[] = [
    row({ idCuenta: "4101-0001-0000-0000", haber: 1000, anio: 2026, periodo: 7 }),
    row({ idCuenta: "5101-0001-0000-0000", debe: 400, anio: 2026, periodo: 7 }),
    row({ idCuenta: "6101-0001-0000-0000", debe: 900, anio: 2026, periodo: 7 }),
    row({ idCuenta: "6301-0001-0000-0000", nombreCuenta: "Depreciación", debe: 50, anio: 2026, periodo: 7 }),
  ];
  const serie = buildEbitdaTtm(rows, { anio: 2026, mes: 7 });
  const jul = serie.find((p) => p.periodo === "2026-07");
  assert.ok(jul);
  // EBIT = 1000 − 400 − (900 + 50) = −350
  assert.equal(jul.ebit, -350);
  assert.ok(jul.ebit < 0);
  // EBITDA = −350 + 50 = −300 (sigue negativo pero > EBIT)
  assert.equal(jul.ebitda, -300);
  assert.ok(jul.ebitda > jul.ebit);
});

test("buildEbitdaTtm: margen EBITDA = ebitda/ventas × 100 y null sin ventas", () => {
  const rows = mesCanonico(2026, 7);
  const serie = buildEbitdaTtm(rows, { anio: 2026, mes: 7 });
  const jul = serie.find((p) => p.periodo === "2026-07");
  assert.ok(jul);
  // EBITDA = (1000 − 400 − 350) + 50 = 300 → margen 30%
  assert.equal(jul.ebitda, 300);
  assert.equal(jul.margenEbitda, 30);

  const sinVentas: EbitdaTtmRow[] = [
    row({ idCuenta: "6101-0001-0000-0000", debe: 100, anio: 2026, periodo: 7 }),
  ];
  const serie2 = buildEbitdaTtm(sinVentas, { anio: 2026, mes: 7 });
  const jul2 = serie2.find((p) => p.periodo === "2026-07");
  assert.ok(jul2);
  assert.equal(jul2.margenEbitda, null);
});

test("buildEbitdaTtm: meses sin balanza quedan en 0 con hasData=false", () => {
  const rows = mesCanonico(2026, 7);
  const serie = buildEbitdaTtm(rows, { anio: 2026, mes: 7 });
  assert.equal(serie.length, 12);
  const ago = serie.find((p) => p.periodo === "2025-08");
  assert.ok(ago);
  assert.equal(ago.hasData, false);
  assert.equal(ago.ebit, 0);
  assert.equal(ago.ebitda, 0);
  assert.equal(ago.margenEbitda, null);
  const jul = serie.find((p) => p.periodo === "2026-07");
  assert.equal(jul?.hasData, true);
});
