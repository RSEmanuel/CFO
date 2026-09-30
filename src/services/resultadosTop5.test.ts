import assert from "node:assert/strict";
import test from "node:test";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import {
  alignTop5Series,
  buildTop5Clientes,
  buildTop5Lineas,
  clampRestoForStack,
  hasClampedResto,
  ingresoTotalKpi,
  OTROS_KEY,
  shouldShowSegmentLabel,
  shouldShowTotalLabel,
  stackedTooltipRows,
  stackTopKey,
  stackSharePct,
  toTop5StackedPoints,
  totalAuxiliarMes,
  TOP5_WINDOW_MONTHS,
  trailingMonths,
  type AuxiliarClienteRow,
  type BalanzaLineaRow,
} from "@/services/resultadosTop5";

function cliente(overrides: Partial<AuxiliarClienteRow> & { idCuenta: string }): AuxiliarClienteRow {
  return {
    nombreCuenta: overrides.idCuenta,
    cargos: 0,
    ...overrides,
  };
}

function linea(overrides: Partial<BalanzaLineaRow> & { idCuenta: string }): BalanzaLineaRow {
  return {
    nombreCuenta: overrides.idCuenta,
    categoriaMaestra: "Ingreso",
    debe: 0,
    haber: 0,
    ...overrides,
  };
}

test("clientes: contribución = CARGOS del periodo, orden descendente, solo hojas 1105/105", () => {
  const rows = [
    cliente({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "ACME", cargos: 100 }),
    cliente({ idCuenta: "1105-0001-0002-0000", nombreCuenta: "BESSER", cargos: 250.55 }),
    cliente({ idCuenta: "1105-0001-0003-0000", nombreCuenta: "SIN VENTAS", cargos: 0 }),
    cliente({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", cargos: 999 }),
    cliente({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", cargos: 500 }),
  ];
  const bloque = buildTop5Clientes(rows, COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(
    bloque.grupos.map((grupo) => [grupo.key, grupo.monto]),
    [
      ["1105-0001-0002-0000", 250.55],
      ["1105-0001-0001-0000", 100],
    ],
  );
  assert.equal(bloque.total, 350.55);
});

test("clientes: filas duplicadas de la misma cuenta se agregan antes de rankear", () => {
  const rows = [
    cliente({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "ACME", cargos: 60 }),
    cliente({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "ACME", cargos: 40 }),
    cliente({ idCuenta: "1105-0001-0002-0000", nombreCuenta: "BESSER", cargos: 90 }),
  ];
  const bloque = buildTop5Clientes(rows, COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(
    bloque.grupos.map((grupo) => [grupo.key, grupo.monto]),
    [
      ["1105-0001-0001-0000", 100],
      ["1105-0001-0002-0000", 90],
    ],
  );
});

test("clientes: con mayor persistido (estilo master) toma las hojas bajo el padre", () => {
  const rows = [
    cliente({ idCuenta: "1105-0000-0000-0000", nombreCuenta: "Clientes", cargos: 300 }),
    cliente({ idCuenta: "1105-0001-0000-0000", nombreCuenta: "ACME", cargos: 120 }),
    cliente({ idCuenta: "1105-0002-0000-0000", nombreCuenta: "BETA", cargos: 180 }),
  ];
  const bloque = buildTop5Clientes(rows, COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(
    bloque.grupos.map((grupo) => [grupo.key, grupo.monto]),
    [
      ["1105-0002-0000-0000", 180],
      ["1105-0001-0000-0000", 120],
    ],
  );
  assert.ok(bloque.grupos.every((grupo) => grupo.key !== "1105-0000-0000-0000"));
});

test("clientes: prefijo SAT 105 también se reconoce", () => {
  const rows = [cliente({ idCuenta: "105-02-002", nombreCuenta: "CLIENTE X", cargos: 80 })];
  const bloque = buildTop5Clientes(rows, COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(bloque.grupos.map((grupo) => grupo.key), ["105-02-002"]);
});

test("líneas: ingreso = haber - debe, solo hojas de Ingreso, excluye mayores y negativos", () => {
  const rows = [
    linea({ idCuenta: "4101-0000-0000-0000", nombreCuenta: "Ventas (mayor)", haber: 1000 }),
    linea({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Vtas tasa gral", haber: 700 }),
    linea({ idCuenta: "4101-0002-0001-0000", nombreCuenta: "Vtas tasa cero", haber: 400, debe: 100 }),
    linea({ idCuenta: "4201-0001-0000-0000", nombreCuenta: "Dev sobre ventas", debe: 50 }),
    linea({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "Costo", categoriaMaestra: "COGS", debe: 300 }),
  ];
  const bloque = buildTop5Lineas(rows, COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(
    bloque.grupos.map((grupo) => [grupo.key, grupo.monto]),
    [
      ["4101-0001-0001-0000", 700],
      ["4101-0002-0001-0000", 300],
    ],
  );
  assert.equal(bloque.total, 1000);
});

test("líneas: las 7xx (otros productos financieros) no son líneas de negocio", () => {
  // La balanza Compac clasifica 7xx como Ingreso, pero el rol "ingresos"
  // (prefijos 4/401/410) las deja fuera del ranking de líneas.
  const rows = [
    linea({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Vtas tasa gral", haber: 4193494.13 }),
    linea({ idCuenta: "7102-0001-0000-0000", nombreCuenta: "Utilidad cambiaria", haber: 33141.84 }),
    linea({ idCuenta: "7104-0023-0000-0000", nombreCuenta: "Otros productos", haber: 1.02 }),
  ];
  const bloque = buildTop5Lineas(rows, COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(bloque.grupos.map((grupo) => grupo.key), ["4101-0001-0001-0000"]);
  assert.equal(bloque.total, 4193494.13);
});

test("líneas: filas repetidas de la misma hoja se suman (ventana multi-mes)", () => {
  const rows = [
    linea({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Vtas", haber: 100 }),
    linea({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Vtas", haber: 250 }),
  ];
  const bloque = buildTop5Lineas(rows, COMPAC_ACCOUNT_ROLES);
  assert.equal(bloque.grupos.length, 1);
  assert.equal(bloque.grupos[0].monto, 350);
});

test("sin datos: bloques vacíos y total 0", () => {
  const clientes = buildTop5Clientes([], COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(clientes.grupos, []);
  assert.equal(clientes.total, 0);
  const lineas = buildTop5Lineas([], COMPAC_ACCOUNT_ROLES);
  assert.deepEqual(lineas.grupos, []);
  assert.equal(lineas.total, 0);
});

test("trailingMonths: 12 periodos terminando en el activo, etiquetas Mes-AA", () => {
  const months = trailingMonths(2026, 7, 12);
  assert.equal(months.length, 12);
  assert.deepEqual(
    months.map((month) => month.key),
    [
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ],
  );
  assert.equal(months[0].label, "Ago-25");
  assert.equal(months[months.length - 1].label, "Jul-26");
});

test("trailingMonths: ventana Top 5 TTM de 12 meses cubre Ago-25 → Jul-26", () => {
  const months = trailingMonths(2026, 7, TOP5_WINDOW_MONTHS);
  assert.equal(TOP5_WINDOW_MONTHS, 12);
  assert.equal(months.length, 12);
  assert.equal(months[0].key, "2025-08");
  assert.equal(months[0].label, "Ago-25");
  assert.equal(months[months.length - 1].key, "2026-07");
  assert.equal(months[months.length - 1].label, "Jul-26");
});

test("alignTop5Series: ranking del periodo activo y ceros donde no hubo facturación", () => {
  const months = trailingMonths(2026, 7, 12);
  const zeros = months.map(() => 0);
  const ingresoTotal = [...zeros.slice(0, 11), 1000];
  const gruposPorMes = months.map((month) =>
    month.key === "2026-07"
      ? [
          { key: "A", label: "Cliente A", monto: 400 },
          { key: "B", label: "Cliente B", monto: 250 },
          { key: "C", label: "Cliente C", monto: 150 },
          { key: "D", label: "Cliente D", monto: 120 },
          { key: "E", label: "Cliente E", monto: 50 },
          { key: "F", label: "Cliente F", monto: 30 },
        ]
      : [],
  );
  const ranking = gruposPorMes[gruposPorMes.length - 1] ?? [];
  const series = alignTop5Series(months, ingresoTotal, gruposPorMes, ranking, 5);

  assert.deepEqual(
    series.entidades.map((entidad) => entidad.key),
    ["A", "B", "C", "D", "E"],
  );
  assert.ok(series.resto);
  assert.equal(series.resto?.key, OTROS_KEY);
  assert.deepEqual(series.entidades[0].series, [...zeros.slice(0, 11), 400]);
  assert.deepEqual(series.resto?.series, [...zeros.slice(0, 11), 30]);
  assert.deepEqual(series.total, ingresoTotal);
  assert.equal(series.entidades[0].monto, 400);
  assert.equal(series.resto?.monto, 30);
});

test("alignTop5Series: un actor dominante en meses previos que no está en el Top 5 activo va a resto", () => {
  const months = trailingMonths(2026, 7, 3);
  const gruposPorMes = [
    [{ key: "Z", label: "Viejo", monto: 900 }],
    [{ key: "Z", label: "Viejo", monto: 800 }],
    [
      { key: "A", label: "Nuevo", monto: 100 },
      { key: "Z", label: "Viejo", monto: 10 },
    ],
  ];
  const series = alignTop5Series(months, [900, 800, 110], gruposPorMes, gruposPorMes[2] ?? [], 1);
  assert.deepEqual(
    series.entidades.map((entidad) => entidad.key),
    ["A"],
  );
  assert.deepEqual(series.entidades[0].series, [0, 0, 100]);
  assert.deepEqual(series.resto?.series, [900, 800, 10]);
});

test("alignTop5Series: ventana 12m con 0-fill y Resto = totalAuxiliar − ΣTop5 mes a mes", () => {
  const months = trailingMonths(2026, 7, TOP5_WINDOW_MONTHS);
  const gruposPorMes = months.map((month) => {
    if (month.key === "2025-08") {
      return [
        { key: "A", label: "Cliente A", monto: 300 },
        { key: "B", label: "Cliente B", monto: 100 },
      ];
    }
    if (month.key === "2026-01") {
      return [{ key: "A", label: "Cliente A", monto: 500 }];
    }
    if (month.key === "2026-07") {
      return [
        { key: "A", label: "Cliente A", monto: 700 },
        { key: "B", label: "Cliente B", monto: 200 },
        { key: "C", label: "Cliente C", monto: 50 },
      ];
    }
    return [];
  });
  // Ago-25: el universo auxiliar (450) excede la suma rankeada (400).
  const ingresoTotal = months.map((month) => {
    if (month.key === "2025-08") {
      return 450;
    }
    if (month.key === "2026-01") {
      return 500;
    }
    if (month.key === "2026-07") {
      return 950;
    }
    return 0;
  });
  const ranking = gruposPorMes[gruposPorMes.length - 1] ?? [];
  const series = alignTop5Series(months, ingresoTotal, gruposPorMes, ranking, 5);

  assert.equal(series.months.length, 12);
  assert.equal(series.months[0]?.key, "2025-08");
  assert.equal(series.months[11]?.key, "2026-07");
  assert.equal(series.entidades.length, 3);

  const a = series.entidades.find((entidad) => entidad.key === "A");
  const b = series.entidades.find((entidad) => entidad.key === "B");
  assert.equal(a?.series.length, 12);
  assert.equal(a?.series[0], 300);
  assert.equal(a?.series[1], 0);
  assert.equal(b?.series[10], 0);

  assert.ok(series.resto);
  assert.equal(series.resto?.series.length, 12);
  assert.equal(series.resto?.series[0], 50);
  assert.equal(series.resto?.series[11], 0);

  const cuadre = series.total.map((total, index) => {
    const suma =
      series.entidades.reduce((sum, entidad) => sum + (entidad.series[index] ?? 0), 0) +
      (series.resto?.series[index] ?? 0);
    return Math.round(suma * 100) / 100 === total;
  });
  assert.deepEqual(cuadre, months.map(() => true));
});

test("ingresoTotalKpi: haber − debe de toda cuenta Ingreso (incluye 7xx, como el KPI)", () => {
  const total = ingresoTotalKpi([
    linea({ idCuenta: "4101-0001-0001-0000", haber: 1000, debe: 50 }),
    linea({ idCuenta: "7102-0001-0000-0000", haber: 40 }),
    linea({ idCuenta: "5101-0001-0000-0000", categoriaMaestra: "COGS", debe: 200 }),
  ]);
  assert.equal(total, 990);
});

test("agregación mensual: cada mes se rankea aparte; la serie sigue al Top 5 del último mes", () => {
  const months = trailingMonths(2026, 7, 2);
  const jun = [
    cliente({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "ACME", cargos: 10 }),
    cliente({ idCuenta: "1105-0001-0002-0000", nombreCuenta: "BESSER", cargos: 90 }),
  ];
  const jul = [
    cliente({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "ACME", cargos: 200 }),
    cliente({ idCuenta: "1105-0001-0002-0000", nombreCuenta: "BESSER", cargos: 50 }),
    cliente({ idCuenta: "1105-0001-0003-0000", nombreCuenta: "GAMMA", cargos: 30 }),
  ];
  const gruposPorMes = [
    buildTop5Clientes(jun, COMPAC_ACCOUNT_ROLES).grupos,
    buildTop5Clientes(jul, COMPAC_ACCOUNT_ROLES).grupos,
  ];
  const ranking = gruposPorMes[1] ?? [];
  const series = alignTop5Series(months, [100, 280], gruposPorMes, ranking, 2);
  assert.deepEqual(
    series.entidades.map((entidad) => [entidad.key, entidad.series]),
    [
      ["1105-0001-0001-0000", [10, 200]],
      ["1105-0001-0002-0000", [90, 50]],
    ],
  );
  assert.deepEqual(series.resto?.series, [0, 30]);
});

test("alignTop5Series: Resto negativo (denominador menor que ΣTop5) también entra en la serie", () => {
  const months = trailingMonths(2026, 7, 2);
  const gruposPorMes = [
    [{ key: "A", label: "ACME", monto: 100 }],
    [{ key: "A", label: "ACME", monto: 500 }],
  ];
  const series = alignTop5Series(months, [100, 333.03], gruposPorMes, gruposPorMes[1] ?? [], 5);
  assert.ok(series.resto);
  assert.equal(series.resto?.series[1], -166.97);
});

test("clampRestoForStack: recorta negativos a 0 y conserva el real", () => {
  assert.deepEqual(clampRestoForStack(-166_972.41), {
    visual: 0,
    real: -166_972.41,
    clamped: true,
  });
  assert.deepEqual(clampRestoForStack(40_000), { visual: 40_000, real: 40_000, clamped: false });
});

test("toTop5StackedPoints: 0-fill, % del total del mes y Resto visual 0 si es negativo", () => {
  const months = trailingMonths(2026, 7, 3);
  const gruposPorMes = [
    [{ key: "A", label: "ACME", monto: 80 }],
    [{ key: "A", label: "ACME", monto: 0 }],
    [
      { key: "A", label: "ACME", monto: 400 },
      { key: "B", label: "BETA", monto: 200 },
    ],
  ];
  const series = alignTop5Series(months, [100, 50, 433.03], gruposPorMes, gruposPorMes[2] ?? [], 5);
  const points = toTop5StackedPoints(series);
  assert.equal(points.length, 3);
  assert.equal(points[0]?.A, 80);
  assert.equal(points[1]?.A, 0);
  assert.equal(points[1]?.B, 0);
  assert.equal(points[2]?.totalMes, 433.03);
  assert.equal(points[2]?.restoReal, -166.97);
  assert.equal(points[2]?.[OTROS_KEY], 0);
  assert.equal(points[2]?.restoClamped, 1);
  assert.equal(points[2]?.A_pct, 92.37);
  assert.ok(hasClampedResto(series));

  const tooltip = stackedTooltipRows(points[2]!, series.entidades, "Resto", true);
  assert.equal(tooltip.find((row) => row.isResto)?.monto, -166.97);
  assert.ok((tooltip.find((row) => row.isResto)?.pct ?? 0) < 0);
});

test("shouldShowSegmentLabel: solo tramos >12% del total del mes", () => {
  assert.equal(shouldShowSegmentLabel(130, 1000), true);
  assert.equal(shouldShowSegmentLabel(120, 1000), false);
  assert.equal(shouldShowSegmentLabel(50, 0), false);
  assert.equal(shouldShowSegmentLabel(-20, 1000), false);
});

test("stackTopKey: usa el último segmento con valor visual > 0, no el Resto en 0", () => {
  const point = {
    mes: "Jul-26",
    monthKey: "2026-07",
    totalMes: 1000,
    restoReal: 0,
    restoClamped: 0,
    A: 1000,
    [OTROS_KEY]: 0,
  };
  assert.equal(stackTopKey(point, ["A", OTROS_KEY]), "A");
  assert.equal(stackTopKey({ ...point, [OTROS_KEY]: 40 }, ["A", OTROS_KEY]), OTROS_KEY);
});

test("shouldShowTotalLabel: 12 meses etiquetan todos los totales", () => {
  const mask = Array.from({ length: 12 }, (_, index) => shouldShowTotalLabel(index, 12));
  assert.equal(mask.every(Boolean), true);
  assert.equal(shouldShowTotalLabel(3, 12), true);
  const dense = Array.from({ length: 24 }, (_, index) => shouldShowTotalLabel(index, 24));
  assert.equal(dense[0], true);
  assert.equal(dense[23], true);
  assert.equal(dense[1], false);
});

test("stackSharePct: denominador = total del mes de la serie", () => {
  assert.equal(stackSharePct(400, 1000).toFixed(1), "40.0");
  assert.equal(stackSharePct(-167, 4864).toFixed(1), "-3.4");
  assert.equal(stackSharePct(10, 0), 0);
});

test("totalAuxiliarMes: Σ montos rankeados (universo auxiliar, no KPI)", () => {
  assert.equal(
    totalAuxiliarMes([
      { key: "A", label: "A", monto: 400 },
      { key: "B", label: "B", monto: 250.55 },
    ]),
    650.55,
  );
});

test("alignTop5Series: con denominador auxiliar, Resto ≥ 0 aunque el KPI neto sea menor (devoluciones)", () => {
  const months = trailingMonths(2026, 7, 2);
  const jun = [
    cliente({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "ACME", cargos: 100 }),
  ];
  const jul = [
    cliente({ idCuenta: "1105-0001-0001-0000", nombreCuenta: "OPCIONES", cargos: 2_738_000 }),
    cliente({ idCuenta: "1105-0001-0002-0000", nombreCuenta: "BETA", cargos: 1_200_000 }),
    cliente({ idCuenta: "1105-0001-0003-0000", nombreCuenta: "GAMMA", cargos: 800_000 }),
    cliente({ idCuenta: "1105-0001-0004-0000", nombreCuenta: "DELTA", cargos: 500_000 }),
    cliente({ idCuenta: "1105-0001-0005-0000", nombreCuenta: "EPSILON", cargos: 400_000 }),
    cliente({ idCuenta: "1105-0001-0006-0000", nombreCuenta: "ZETA", cargos: 2_460_548.01 }),
  ];
  const gruposPorMes = [
    buildTop5Clientes(jun, COMPAC_ACCOUNT_ROLES).grupos,
    buildTop5Clientes(jul, COMPAC_ACCOUNT_ROLES).grupos,
  ];
  const totalAuxiliar = gruposPorMes.map((grupos) => totalAuxiliarMes(grupos));
  const kpiNeto = [100, 4_226_654.53];
  const series = alignTop5Series(months, totalAuxiliar, gruposPorMes, gruposPorMes[1] ?? [], 5);

  assert.ok(series.resto);
  assert.ok((series.resto?.series[1] ?? -1) >= 0);
  assert.equal(series.total[1], 8_098_548.01);
  assert.notEqual(series.total[1], kpiNeto[1]);
  assert.equal(hasClampedResto(series), false);

  const last = toTop5StackedPoints(series)[1]!;
  assert.equal(last[OTROS_KEY], last.restoReal);
  assert.equal(last.restoClamped, 0);
});

test("toTop5StackedPoints: % del universo auxiliar suman ~100% por mes", () => {
  const months = trailingMonths(2026, 7, 2);
  const gruposPorMes = [
    [
      { key: "A", label: "A", monto: 60 },
      { key: "B", label: "B", monto: 40 },
    ],
    [
      { key: "A", label: "A", monto: 400 },
      { key: "B", label: "B", monto: 250 },
      { key: "C", label: "C", monto: 150 },
      { key: "D", label: "D", monto: 120 },
      { key: "E", label: "E", monto: 50 },
      { key: "F", label: "F", monto: 30 },
    ],
  ];
  const totalAuxiliar = gruposPorMes.map((grupos) => totalAuxiliarMes(grupos));
  const series = alignTop5Series(months, totalAuxiliar, gruposPorMes, gruposPorMes[1] ?? [], 5);
  const points = toTop5StackedPoints(series);
  for (const point of points) {
    const pctSum =
      series.entidades.reduce((sum, entidad) => sum + Number(point[`${entidad.key}_pct`] ?? 0), 0) +
      Number(point[`${OTROS_KEY}_pct`] ?? 0);
    assert.ok(Math.abs(pctSum - 100) < 0.05, `pctSum=${pctSum} mes=${point.monthKey}`);
    assert.ok(Number(point.restoReal) >= -0.005);
  }
  const legend = stackedTooltipRows(points[1]!, series.entidades, "Resto", true);
  const legendPct = legend.reduce((sum, row) => sum + row.pct, 0);
  assert.ok(Math.abs(legendPct - 100) < 0.05);
});
