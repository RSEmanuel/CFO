import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INITIAL_RESULTADOS_FILTERS } from "@/components/resultados/resultados-filter-bar";
import { buildResultadosSeries } from "@/services/resultadosLedger";
import {
  buildIncomeBreakdown,
  buildStackedSeries,
  getDestacadosKpis,
  groupSlicesBelowShare,
  topBreakdownSlices,
  trailingMonthlyRows,
  TREND_WINDOW_MONTHS,
  type MonthlyFinancials,
} from "@/services/financialDataTransformer";
import { formatAxisTick } from "@/services/money";
import { verticalPct } from "@/services/posicionFinanciera";

describe("resultados desde BalanzaPnL", () => {
  it("aplica signos contables y suma D&A de vuelta al EBITDA", () => {
    const { series, breakdown } = buildResultadosSeries([
      {
        anio: 2026, periodo: 7, idCuenta: "4001", nombreCuenta: "Ventas",
        categoriaMaestra: "Ingreso", debe: 10, haber: 1010, depreciacionAmortizacion: false,
      },
      {
        anio: 2026, periodo: 7, idCuenta: "5001", nombreCuenta: "Costo",
        categoriaMaestra: "COGS", debe: 400, haber: 0, depreciacionAmortizacion: false,
      },
      {
        anio: 2026, periodo: 7, idCuenta: "6001", nombreCuenta: "Administración",
        categoriaMaestra: "OpEx", debe: 200, haber: 0, depreciacionAmortizacion: false,
      },
      {
        anio: 2026, periodo: 7, idCuenta: "6002", nombreCuenta: "Depreciación",
        categoriaMaestra: "OpEx", debe: 50, haber: 0, depreciacionAmortizacion: true,
      },
      {
        anio: 2026, periodo: 7, idCuenta: "1001", nombreCuenta: "Bancos",
        categoriaMaestra: "Activo", debe: 10, haber: 0, depreciacionAmortizacion: false,
      },
    ]);
    assert.equal(series.length, 1);
    assert.deepEqual(
      {
        periodo: series[0].periodo,
        ingreso: series[0].ingreso_total,
        costo: series[0].costo_total,
        gasto: series[0].gasto_total,
        da: series[0].depreciacion_amortizacion,
        ebitda: series[0].ebitda,
      },
      { periodo: "2026-07", ingreso: 1000, costo: 400, gasto: 250, da: 50, ebitda: 400 },
    );
    assert.equal(breakdown.length, 4);
    assert.equal(breakdown.some((row) => row.nombreCuenta === "Bancos"), false);
  });

  it("no mezcla periodos", () => {
    const { series } = buildResultadosSeries([
      {
        anio: 2025, periodo: 12, idCuenta: "4", nombreCuenta: "Ingreso A",
        categoriaMaestra: "Ingreso", debe: 0, haber: 100, depreciacionAmortizacion: false,
      },
      {
        anio: 2026, periodo: 7, idCuenta: "4", nombreCuenta: "Ingreso B",
        categoriaMaestra: "Ingreso", debe: 0, haber: 300, depreciacionAmortizacion: false,
      },
    ]);
    assert.deepEqual(series.map((row) => [row.periodo, row.ingreso_total]), [
      ["2025-12", 100],
      ["2026-07", 300],
    ]);
  });
});

describe("vistas de resultados sin serie", () => {
  // Una empresa recién creada (o los datos todavía en vuelo) llega con rows = [].
  const filters = { ...INITIAL_RESULTADOS_FILTERS, periodo: "2026-07" };

  it("buildStackedSeries marca como nulos los totales sin observaciones", () => {
    for (const temporalidad of ["month", "quarter", "year"]) {
      const result = buildStackedSeries([], { ...filters, temporalidad }, "Ingreso");
      assert.equal(result.headlineTotal, null);
      assert.equal(result.comparableTotal, null);
      assert.ok(result.seriesKeys.length > 0);
      const valores = result.chartData.flatMap((punto) =>
        Object.entries(punto)
          .filter(([clave]) => clave !== "month")
          .map(([, valor]) => valor),
      );
      assert.deepEqual(
        valores.filter((valor) => valor !== 0 && valor !== null),
        [],
      );
    }
  });

  it("getDestacadosKpis devuelve rubros en cero sin comparativo", () => {
    const { rubros, contextLabel } = getDestacadosKpis([], filters);
    assert.equal(contextLabel, null);
    assert.deepEqual(
      rubros.map((rubro) => [rubro.key, rubro.value, rubro.deltaPct]),
      [
        ["ingreso", 0, null],
        ["costo", 0, null],
        ["gasto", 0, null],
        ["ebitda", 0, null],
      ],
    );
  });
});

describe("serie de ingreso total", () => {
  const rows: MonthlyFinancials[] = [
    {
      periodo: "2025-12",
      ingreso_total: 150,
      desglose_ingreso: { "Cuenta A": 100, "Cuenta B": 50 },
      micro_categorias: {},
      costo_total: 60,
      desglose_costo: { "Costo A": 60 },
      gasto_total: 20,
      desglose_gasto: { "Gasto A": 20 },
      ebitda: 70,
    },
    {
      periodo: "2026-01",
      ingreso_total: 225,
      desglose_ingreso: { "Cuenta A": 200, "Cuenta B": 25 },
      micro_categorias: {},
      costo_total: 80,
      desglose_costo: { "Costo A": 80 },
      gasto_total: 30,
      desglose_gasto: { "Gasto A": 30 },
      ebitda: 115,
    },
    {
      periodo: "2026-02",
      ingreso_total: 375,
      desglose_ingreso: { "Cuenta A": 300, "Cuenta B": 75 },
      micro_categorias: {},
      costo_total: 100,
      desglose_costo: { "Costo A": 100 },
      gasto_total: 40,
      desglose_gasto: { "Gasto A": 40 },
      ebitda: 235,
    },
  ];
  const baseFilters = { ...INITIAL_RESULTADOS_FILTERS, periodo: "2026-02" };

  it("calcula cada total mensual con la misma suma de las cuentas", () => {
    const result = buildStackedSeries(
      rows,
      { ...baseFilters, temporalidad: "month" },
      "Ingreso",
    );
    for (const point of result.chartData) {
      const stacked = result.seriesKeys.reduce(
        (sum, key) => sum + Number(point[key] ?? 0),
        0,
      );
      assert.equal(point.total, stacked);
    }
    assert.equal(result.chartData.at(-1)?.total, result.headlineTotal);
  });

  it("mantiene la definición del total al cambiar Mes, Q y Año", () => {
    const month = buildStackedSeries(
      rows,
      { ...baseFilters, temporalidad: "month" },
      "Ingreso",
    );
    const quarter = buildStackedSeries(
      rows,
      { ...baseFilters, temporalidad: "quarter" },
      "Ingreso",
    );
    const year = buildStackedSeries(
      rows,
      { ...baseFilters, temporalidad: "year" },
      "Ingreso",
    );

    assert.equal(month.chartData.at(-1)?.total, 375);
    assert.equal(quarter.chartData[0]?.total, 600);
    assert.equal(quarter.chartData[1]?.total, null);
    assert.equal(quarter.headlineTotal, quarter.chartData[0]?.total);
    assert.equal(year.chartData.find((point) => point.month === "2026")?.total, 600);
    assert.equal(year.headlineTotal, 600);
  });

  it("conserva seriesKeys apilables para Costo y Gasto", () => {
    const costo = buildStackedSeries(
      rows,
      { ...baseFilters, temporalidad: "month" },
      "Costo",
    );
    const gasto = buildStackedSeries(
      rows,
      { ...baseFilters, temporalidad: "month" },
      "Gasto",
    );
    assert.deepEqual(costo.seriesKeys, ["Costo A"]);
    assert.deepEqual(gasto.seriesKeys, ["Gasto A"]);
    assert.equal(costo.seriesKeys.includes("total"), false);
    assert.equal(gasto.seriesKeys.includes("total"), false);
  });

  it("formatea labels y ejes en K, M y B sin alterar el total", () => {
    assert.equal(formatAxisTick(375_000_000, "k"), "$375,000K");
    assert.equal(formatAxisTick(375_000_000, "m"), "$375M");
    assert.equal(formatAxisTick(375_000_000, "b"), "$0.38B");
    const result = buildStackedSeries(
      rows,
      { ...baseFilters, temporalidad: "month", units: "m" },
      "Ingreso",
    );
    assert.equal(result.chartData.at(-1)?.total, 375);
  });
});

describe("desglose de ingreso para pie", () => {
  const rows: MonthlyFinancials[] = [
    {
      periodo: "2026-01",
      ingreso_total: 1_000,
      desglose_ingreso: {
        "Cuenta 1": 400,
        "Cuenta 2": 250,
        "Cuenta 3": 150,
        "Cuenta 4": 100,
        "Cuenta 5": 60,
        "Cuenta 6": 40,
        Devoluciones: -50,
      },
      micro_categorias: {},
      costo_total: 0,
      desglose_costo: {},
      gasto_total: 0,
      desglose_gasto: {},
      ebitda: 1_000,
    },
  ];
  const filters = { ...INITIAL_RESULTADOS_FILTERS, periodo: "2026-01" };

  it("agrupa top N y el resto en Otros, excluyendo montos no positivos", () => {
    const slices = topBreakdownSlices(rows[0].desglose_ingreso, 5);
    assert.equal(slices.length, 6);
    assert.equal(slices.at(-1)?.isOther, true);
    assert.equal(slices.at(-1)?.value, 40);
    assert.ok(slices.every((slice) => slice.value > 0));
    const sum = slices.reduce((acc, slice) => acc + slice.value, 0);
    assert.equal(sum, 1_000);
  });

  it("buildIncomeBreakdown suma el periodo seleccionado según temporalidad", () => {
    const month = buildIncomeBreakdown(rows, { ...filters, temporalidad: "month" });
    assert.equal(month.reduce((acc, slice) => acc + slice.value, 0), 1_000);
    const year = buildIncomeBreakdown(rows, { ...filters, temporalidad: "year" });
    assert.equal(year.reduce((acc, slice) => acc + slice.value, 0), 1_000);
    assert.deepEqual(buildIncomeBreakdown([], filters), []);
  });

  it("agrupa categorías < 1% en Otros ingresos y excluye $0", () => {
    const slices = groupSlicesBelowShare([
      { name: "Vtas tasa general", value: 4_193_494.13, isOther: false },
      { name: "Utilidad cambiaria", value: 33_160.4, isOther: false },
      { name: "Sin movimiento", value: 0, isOther: false },
    ]);
    assert.equal(slices.length, 2);
    assert.equal(slices[0]?.name, "Vtas tasa general");
    assert.equal(slices[0]?.value, 4_193_494.13);
    assert.equal(slices[1]?.isOther, true);
    assert.equal(slices[1]?.value, 33_160.4);
    const total = slices.reduce((acc, slice) => acc + slice.value, 0);
    assert.ok(Math.abs(slices[0]!.value / total - 0.992) < 0.0005);
    assert.ok(Math.abs(slices[1]!.value / total - 0.008) < 0.0005);
  });
});

describe("ventana TTM de tendencia", () => {
  function stubRow(periodo: string): MonthlyFinancials {
    return {
      periodo,
      ingreso_total: 1,
      desglose_ingreso: {},
      micro_categorias: {},
      costo_total: 1,
      desglose_costo: {},
      gasto_total: 0,
      desglose_gasto: {},
      ebitda: 0,
    };
  }

  it("toma 12 meses móviles hasta el periodo activo", () => {
    const rows = Array.from({ length: 24 }, (_, index) => {
      const date = new Date(2024, 7 + index, 1);
      const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return stubRow(periodo);
    });
    assert.equal(TREND_WINDOW_MONTHS, 12);
    const windowed = trailingMonthlyRows(rows, "2026-07");
    assert.equal(windowed.length, 12);
    assert.equal(windowed[0]?.periodo, "2025-08");
    assert.equal(windowed[11]?.periodo, "2026-07");
  });
});

describe("análisis vertical", () => {
  it("calcula % sobre ventas con valor absoluto", () => {
    assert.equal(verticalPct(250, 1_000), 25);
    assert.equal(verticalPct(-250, 1_000), 25);
  });

  it("devuelve null sin base o con base cero", () => {
    assert.equal(verticalPct(250, null), null);
    assert.equal(verticalPct(250, 0), null);
    assert.equal(verticalPct(null, 1_000), null);
    assert.equal(verticalPct(undefined, 1_000), null);
  });
});
