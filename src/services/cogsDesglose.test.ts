import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCogsDesglose,
  buildCogsVerticalAnalisis,
  classifyCogsSat,
  type CogsCuentaRow,
  type CogsVerticalAnalisis,
} from "@/services/cogsDesglose";

test("classifyCogsSat: formato SAT 501-01-xxx clasifica por segundo segmento", () => {
  assert.equal(classifyCogsSat("501-01-001"), "materiaPrima");
  assert.equal(classifyCogsSat("501-02-010"), "materiaPrima");
  assert.equal(classifyCogsSat("501-03-001"), "manoObra");
  assert.equal(classifyCogsSat("501-04-002"), "maquilas");
  assert.equal(classifyCogsSat("501-05-001"), "gastosIndirectos");
  assert.equal(classifyCogsSat("501-99-001"), "otros");
});

test("classifyCogsSat: acepta puntos como separador (501.01) y dual 5101-xx", () => {
  assert.equal(classifyCogsSat("501.01.001"), "materiaPrima");
  assert.equal(classifyCogsSat("501.05.002"), "gastosIndirectos");
  assert.equal(classifyCogsSat("5101-03-0000"), "manoObra");
  assert.equal(classifyCogsSat("5101-04-001"), "maquilas");
});

test("classifyCogsSat: segundo segmento SAT no mapeado cae en gastosIndirectos", () => {
  assert.equal(classifyCogsSat("501-06-001"), "gastosIndirectos");
  assert.equal(classifyCogsSat("501-00-001"), "gastosIndirectos");
});

test("classifyCogsSat: catálogo Compac 5101-xxxx (consecutivo, no rubro) cae al fallback", () => {
  assert.equal(classifyCogsSat("5101-0001-0000-0000"), "otrosDirectos");
  assert.equal(classifyCogsSat("5101-0005-0000-0000"), "otrosDirectos");
  assert.equal(classifyCogsSat("5101"), "otrosDirectos");
  assert.equal(classifyCogsSat(""), "otrosDirectos");
});

function cogs(overrides: Partial<CogsCuentaRow> & { idCuenta: string }): CogsCuentaRow {
  return {
    nombreCuenta: overrides.idCuenta,
    categoriaMaestra: "COGS",
    debe: 0,
    haber: 0,
    ...overrides,
  };
}

function ingreso(idCuenta: string, haber: number, debe = 0): CogsCuentaRow {
  return { idCuenta, nombreCuenta: idCuenta, categoriaMaestra: "Ingreso", debe, haber };
}

test("buildCogsDesglose: agrupa por rubro SAT y calcula % sobre costo y ventas", () => {
  const rows = [
    cogs({ idCuenta: "501-01-001", nombreCuenta: "MP acero", debe: 300 }),
    cogs({ idCuenta: "501-02-001", nombreCuenta: "Mercancía", debe: 100 }),
    cogs({ idCuenta: "501-03-001", nombreCuenta: "Soldadores", debe: 200 }),
    cogs({ idCuenta: "501-05-001", nombreCuenta: "GIF", debe: 50 }),
  ];
  const desglose = buildCogsDesglose(rows, 1300);
  assert.equal(desglose.totalCosto, 650);
  assert.deepEqual(
    desglose.rubros.map((rubro) => [rubro.key, rubro.monto]),
    [
      ["materiaPrima", 400],
      ["manoObra", 200],
      ["gastosIndirectos", 50],
    ],
  );
  const materia = desglose.rubros[0];
  assert.equal(materia.pctCosto, 61.54);
  assert.equal(materia.pctVentas, 30.77);
  assert.equal(materia.cuentas.length, 2);
});

test("buildCogsDesglose: costo = debe - haber; excluye mayores, negativos y no-COGS", () => {
  const rows = [
    cogs({ idCuenta: "5101-0000-0000-0000", nombreCuenta: "Costo (mayor)", debe: 1000 }),
    cogs({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "Costo de ventas", debe: 1027628.58 }),
    cogs({ idCuenta: "5101-0002-0000-0000", nombreCuenta: "Devolución compra", haber: 80 }),
    cogs({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", categoriaMaestra: "Ingreso", haber: 4193494.13 }),
  ];
  const desglose = buildCogsDesglose(rows, 4193494.13);
  assert.equal(desglose.hasCogs, true);
  assert.equal(desglose.rubros.length, 1);
  assert.equal(desglose.rubros[0].key, "otrosDirectos");
  assert.equal(desglose.rubros[0].monto, 1027628.58);
  assert.equal(desglose.rubros[0].pctCosto, 100);
  assert.equal(desglose.rubros[0].pctVentas, 24.51);
});

test("buildCogsDesglose: sin ventas netas el % sobre ventas es null", () => {
  const rows = [cogs({ idCuenta: "501-01-001", debe: 100 })];
  const desglose = buildCogsDesglose(rows, 0);
  assert.equal(desglose.rubros[0].pctVentas, null);
  assert.equal(desglose.rubros[0].pctCosto, 100);
});

test("buildCogsDesglose: sin costos regresa bloque vacío", () => {
  const desglose = buildCogsDesglose([], 1000);
  assert.equal(desglose.hasCogs, false);
  assert.equal(desglose.totalCosto, 0);
  assert.deepEqual(desglose.rubros, []);
});

function childrenOf(analisis: CogsVerticalAnalisis) {
  return analisis.filas.filter((fila) => fila.line != null);
}

function assertChildrenSumToTotal(analisis: CogsVerticalAnalisis) {
  const children = childrenOf(analisis);
  const total = analisis.filas.find((fila) => fila.key === "totalCosto");
  assert.ok(total);
  for (const column of ["acumulado", "mesActual", "mesAnterior"] as const) {
    const sum = children.reduce((acc, fila) => acc + (fila[column].monto ?? 0), 0);
    const expected = total[column].monto ?? 0;
    assert.ok(Math.abs(sum - expected) <= 0.01, `${column}: ${sum} vs ${expected}`);
  }
}

test("buildCogsVerticalAnalisis: rubros SAT con monto son filas y suman al total", () => {
  const actual = [
    ingreso("4101-0001", 1000),
    cogs({ idCuenta: "501-01-001", debe: 200 }),
    cogs({ idCuenta: "501-02-001", debe: 50 }),
    cogs({ idCuenta: "501-03-001", debe: 80 }),
    cogs({ idCuenta: "501-04-001", debe: 40 }),
    cogs({ idCuenta: "501-05-001", debe: 30 }),
    cogs({ idCuenta: "501-06-001", debe: 10 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: actual,
    ventasAcumulado: 1000,
    mesActual: actual,
    ventasActual: 1000,
    mesAnterior: [],
    ventasAnterior: 0,
  });
  assert.deepEqual(
    analisis.filas.map((fila) => fila.key),
    [
      "ventas",
      "rubro:materiaPrima",
      "rubro:manoObra",
      "rubro:maquilas",
      "rubro:gastosIndirectos",
      "totalCosto",
      "utilidadBruta",
      "margenBruto",
    ],
  );
  const byKey = Object.fromEntries(analisis.filas.map((fila) => [fila.key, fila]));
  assert.equal(byKey["rubro:materiaPrima"].mesActual.monto, 250);
  assert.equal(byKey["rubro:manoObra"].mesActual.monto, 80);
  assert.equal(byKey["rubro:maquilas"].mesActual.monto, 40);
  assert.equal(byKey["rubro:gastosIndirectos"].mesActual.monto, 40);
  assert.equal(byKey["rubro:materiaPrima"].invertDelta, false);
  assert.equal(byKey.totalCosto.mesActual.monto, 410);
  assert.equal(byKey.utilidadBruta.mesActual.monto, 590);
  assert.equal(byKey.margenBruto.mesActual.pct, 59);
  assert.equal(byKey.ventas.invertDelta, true);
  assert.equal(byKey.utilidadBruta.invertDelta, true);
  assertChildrenSumToTotal(analisis);
  assert.deepEqual(
    analisis.stacked.mesActual.segmentos.map((segment) => segment.id),
    ["materiaPrima", "manoObra", "maquilas", "gastosIndirectos"],
  );
});

test("buildCogsVerticalAnalisis: varias cuentas Compac son filas individuales y suman al total", () => {
  const actual = [
    ingreso("4101-0001", 1000),
    cogs({ idCuenta: "5101-0002-0000-0000", nombreCuenta: "MANO DE OBRA", debe: 80 }),
    cogs({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO DE VENTAS", debe: 200 }),
    cogs({ idCuenta: "5101-0004-0000-0000", nombreCuenta: "FLETES SOBRE VENTAS", debe: 30 }),
    cogs({ idCuenta: "5101-0009-0000-0000", nombreCuenta: "MERMAS", debe: 0 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: actual,
    ventasAcumulado: 1000,
    mesActual: actual,
    ventasActual: 1000,
    mesAnterior: actual,
    ventasAnterior: 1000,
  });
  const children = childrenOf(analisis);
  assert.deepEqual(
    children.map((fila) => fila.line?.nombre),
    ["COSTO DE VENTAS", "MANO DE OBRA", "FLETES SOBRE VENTAS"],
  );
  assert.deepEqual(
    children.map((fila) => fila.mesActual.monto),
    [200, 80, 30],
  );
  assert.equal(children.every((fila) => fila.line?.kind === "cuenta"), true);
  assert.equal(analisis.filas.some((fila) => fila.line?.kind === "rubro"), false);
  assert.equal(analisis.filas.find((fila) => fila.key === "totalCosto")?.mesActual.monto, 310);
  assertChildrenSumToTotal(analisis);
  assert.deepEqual(
    analisis.stacked.mesActual.segmentos.map((segment) => segment.nombre),
    ["COSTO DE VENTAS", "MANO DE OBRA", "FLETES SOBRE VENTAS"],
  );
});

test("buildCogsVerticalAnalisis: Compac 5101-0001 es una sola hija, sin rubros SAT en cero", () => {
  const actual = [
    ingreso("4101-0001-0001-0000", 4193494.13),
    cogs({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO DE VENTAS", debe: 1027628.58 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: actual,
    ventasAcumulado: 4193494.13,
    mesActual: actual,
    ventasActual: 4193494.13,
    mesAnterior: [],
    ventasAnterior: 800000,
  });
  const children = childrenOf(analisis);
  assert.equal(children.length, 1);
  assert.equal(children[0]?.line?.kind, "cuenta");
  assert.equal(children[0]?.line?.id, "5101-0001-0000-0000");
  assert.equal(children[0]?.line?.nombre, "COSTO DE VENTAS");
  assert.equal(children[0]?.mesActual.monto, 1027628.58);
  assert.equal(analisis.filas.some((fila) => fila.key.startsWith("rubro:")), false);
  assert.equal(analisis.stacked.mesActual.segmentos.length, 1);
  assert.equal(analisis.stacked.mesActual.segmentos[0]?.nombre, "COSTO DE VENTAS");
  assertChildrenSumToTotal(analisis);
});

test("buildCogsVerticalAnalisis: subcuenta en 0 en las tres columnas se oculta", () => {
  const actual = [
    ingreso("4101-0001", 1000),
    cogs({ idCuenta: "501-01-001", debe: 200 }),
    cogs({ idCuenta: "501-03-001", debe: 80 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: actual,
    ventasAcumulado: 1000,
    mesActual: actual,
    ventasActual: 1000,
    mesAnterior: actual,
    ventasAnterior: 1000,
  });
  const keys = analisis.filas.map((fila) => fila.key);
  assert.equal(keys.includes("rubro:maquilas"), false);
  assert.equal(keys.includes("rubro:gastosIndirectos"), false);
  assert.equal(keys.includes("rubro:manoObra"), true);
  assert.equal(keys.includes("rubro:materiaPrima"), true);
  assert.equal(analisis.stacked.mesActual.segmentos.some((segment) => segment.id === "maquilas"), false);
  assertChildrenSumToTotal(analisis);
});

test("buildCogsVerticalAnalisis: 0 en mesActual pero >0 en mesAnterior se muestra", () => {
  const actual = [
    ingreso("4101-0001", 1000),
    cogs({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO DE VENTAS", debe: 200 }),
  ];
  const prior = [
    ingreso("4101-0001", 800),
    cogs({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO DE VENTAS", debe: 100 }),
    cogs({ idCuenta: "5101-0004-0000-0000", nombreCuenta: "FLETES SOBRE VENTAS", debe: 50 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: [...prior, ...actual],
    ventasAcumulado: 1800,
    mesActual: actual,
    ventasActual: 1000,
    mesAnterior: prior,
    ventasAnterior: 800,
  });
  const fletes = analisis.filas.find((fila) => fila.line?.nombre === "FLETES SOBRE VENTAS");
  assert.ok(fletes);
  assert.equal(fletes.mesActual.monto, 0);
  assert.equal(fletes.mesAnterior.monto, 50);
  assert.equal(fletes.acumulado.monto, 50);
  assert.equal(fletes.variacionMonto, -50);
  assert.equal(analisis.stacked.mesActual.segmentos.some((segment) => segment.nombre === "FLETES SOBRE VENTAS"), true);
  assertChildrenSumToTotal(analisis);
});

test("buildCogsVerticalAnalisis: un solo rubro SAT no arrastra indirectos en cero", () => {
  const actual = [
    ingreso("4101-0001", 1000),
    cogs({ idCuenta: "501-01-001", debe: 250 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: actual,
    ventasAcumulado: 1000,
    mesActual: actual,
    ventasActual: 1000,
    mesAnterior: actual,
    ventasAnterior: 1000,
  });
  assert.deepEqual(
    analisis.filas.map((fila) => fila.key),
    ["ventas", "rubro:materiaPrima", "totalCosto", "utilidadBruta", "margenBruto"],
  );
  const byKey = Object.fromEntries(analisis.filas.map((fila) => [fila.key, fila]));
  assert.equal(byKey.totalCosto.mesActual.monto, 250);
  assert.equal(byKey.utilidadBruta.mesActual.monto, 750);
  assert.equal(byKey.margenBruto.mesActual.pct, 75);
  assertChildrenSumToTotal(analisis);
});

test("buildCogsVerticalAnalisis: rubros indirectos en 0 en las tres columnas no aparecen aunque totalCosto > 0", () => {
  const actual = [
    ingreso("4101-0001", 2000),
    cogs({ idCuenta: "501-01-001", debe: 600 }),
    cogs({ idCuenta: "501-02-001", debe: 100 }),
  ];
  const prior = [
    ingreso("4101-0001", 1500),
    cogs({ idCuenta: "501-01-001", debe: 400 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: [...prior, ...actual],
    ventasAcumulado: 3500,
    mesActual: actual,
    ventasActual: 2000,
    mesAnterior: prior,
    ventasAnterior: 1500,
  });
  const keys = analisis.filas.map((fila) => fila.key);
  assert.equal(keys.includes("rubro:gastosIndirectos"), false);
  assert.equal(keys.includes("rubro:maquilas"), false);
  assert.equal(keys.includes("rubro:manoObra"), false);
  const byKey = Object.fromEntries(analisis.filas.map((fila) => [fila.key, fila]));
  assert.equal(byKey.totalCosto.mesActual.monto, 700);
  assert.equal(byKey.totalCosto.mesAnterior.monto, 400);
  assert.equal(byKey.totalCosto.acumulado.monto, 1100);
  assert.equal(byKey.utilidadBruta.mesActual.monto, 1300);
  assertChildrenSumToTotal(analisis);
});

test("buildCogsVerticalAnalisis: rubro en 0 este mes pero con monto anterior sigue visible", () => {
  const actual = [
    ingreso("4101-0001", 1000),
    cogs({ idCuenta: "501-01-001", debe: 200 }),
  ];
  const prior = [
    ingreso("4101-0001", 800),
    cogs({ idCuenta: "501-01-001", debe: 100 }),
    cogs({ idCuenta: "501-05-001", debe: 60 }),
  ];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: [...prior, ...actual],
    ventasAcumulado: 1800,
    mesActual: actual,
    ventasActual: 1000,
    mesAnterior: prior,
    ventasAnterior: 800,
  });
  const gif = analisis.filas.find((fila) => fila.key === "rubro:gastosIndirectos");
  assert.ok(gif);
  assert.equal(gif.mesActual.monto, 0);
  assert.equal(gif.mesAnterior.monto, 60);
  assert.equal(gif.acumulado.monto, 60);
  assert.equal(analisis.stacked.mesAnterior.segmentos.find((segment) => segment.id === "gastosIndirectos")?.monto, 60);
  assertChildrenSumToTotal(analisis);
});

test("buildCogsVerticalAnalisis: acumulado suma ene→periodo y mes anterior es independiente", () => {
  const enero = [
    ingreso("4101-0001", 100),
    cogs({ idCuenta: "501-01-001", debe: 40 }),
  ];
  const febrero = [
    ingreso("4101-0001", 200),
    cogs({ idCuenta: "501-01-001", debe: 50 }),
  ];
  const ytd = [...enero, ...febrero];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: ytd,
    ventasAcumulado: 300,
    mesActual: febrero,
    ventasActual: 200,
    mesAnterior: enero,
    ventasAnterior: 100,
  });
  const materia = analisis.filas.find((fila) => fila.key === "rubro:materiaPrima");
  const byKey = Object.fromEntries(analisis.filas.map((fila) => [fila.key, fila]));
  assert.ok(materia);
  assert.equal(byKey.ventas.acumulado.monto, 300);
  assert.equal(materia.acumulado.monto, 90);
  assert.equal(materia.mesActual.monto, 50);
  assert.equal(materia.mesAnterior.monto, 40);
  assert.equal(materia.variacionMonto, 10);
  assert.equal(materia.mesActual.pct, 25);
  assert.equal(materia.mesAnterior.pct, 40);
  assert.equal(materia.variacionPp, -15);
  assertChildrenSumToTotal(analisis);
});

test("buildCogsVerticalAnalisis: ventas = 0 → porcentajes null (UI N/A)", () => {
  const actual = [cogs({ idCuenta: "501-01-001", debe: 80 })];
  const analisis = buildCogsVerticalAnalisis({
    acumulado: actual,
    ventasAcumulado: 0,
    mesActual: actual,
    ventasActual: 0,
    mesAnterior: actual,
    ventasAnterior: 0,
  });
  const materia = analisis.filas.find((fila) => fila.key === "rubro:materiaPrima");
  const byKey = Object.fromEntries(analisis.filas.map((fila) => [fila.key, fila]));
  assert.ok(materia);
  assert.equal(byKey.ventas.mesActual.monto, 0);
  assert.equal(byKey.ventas.mesActual.pct, null);
  assert.equal(materia.mesActual.monto, 80);
  assert.equal(materia.mesActual.pct, null);
  assert.equal(byKey.utilidadBruta.mesActual.pct, null);
  assert.equal(byKey.margenBruto.mesActual.pct, null);
  assert.equal(byKey.margenBruto.variacionPp, null);
  assert.equal(analisis.stacked.mesActual.segmentos[0]?.pct, null);
  assert.equal(analisis.stacked.mesActual.pctUtilidad, null);
});
