import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { alignResultadosMonths, buildResultadosTree, collapseToMayorAccounts } from "@/services/posicionFinanciera";

function ventas(anio: number, periodo: number, haber: number): BalanzaPnL {
  return {
    idCuenta: "4101-0001-0001-0000",
    nombreCuenta: "VENTAS",
    categoriaMaestra: "Ingreso",
    saldoInicial: 0,
    debe: 0,
    haber,
    saldoFinal: 0,
    depreciacionAmortizacion: false,
    periodo,
    anio,
  } as unknown as BalanzaPnL;
}

const MAYO = [1, 2, 3, 4, 5];
const TODO_EL_ANIO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("Estado de resultados con los mismos meses en cada año", () => {
  it("un año que llega a mayo no toma junio a diciembre del año anterior", () => {
    const aligned = alignResultadosMonths(MAYO, TODO_EL_ANIO);
    assert.deepEqual(aligned.months, [1, 2, 3, 4, 5]);
    assert.deepEqual(aligned.missing, []);
  });

  it("no rellena un mes que falta en el año anterior: lo reporta", () => {
    const aligned = alignResultadosMonths(MAYO, [1, 2, 4, 5, 6, 7]);
    assert.deepEqual(aligned.months, [1, 2, 4, 5]);
    assert.deepEqual(aligned.missing, [3]);
  });

  it("un año sin ninguno de esos meses queda sin meses", () => {
    const aligned = alignResultadosMonths([1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12]);
    assert.deepEqual(aligned.months, []);
    assert.deepEqual(aligned.missing, [1, 2, 3, 4, 5, 6, 7]);
  });

  it("las columnas, los rubros y la utilidad suman solo los meses alineados", () => {
    const prior = TODO_EL_ANIO.map((mes) => ventas(2025, mes, 100));
    const current = MAYO.map((mes) => ventas(2026, mes, 150));
    const { months } = alignResultadosMonths(MAYO, TODO_EL_ANIO);
    const tree = buildResultadosTree(
      { "2026": current, "2025": prior.filter((row) => months.includes(row.periodo)) },
      ["2026", "2025"],
    );
    const ingresos = tree.find((node) => node.id === "pyg:ingresos");
    const utilidadNeta = tree.find((node) => node.id === "pyg:un");
    assert.equal(ingresos?.values["2026"], 750);
    assert.equal(ingresos?.values["2025"], 500);
    assert.equal(utilidadNeta?.values["2025"], 500);
  });
});

describe("Estado de resultados solo con cuentas de mayor", () => {
  function gasto(idCuenta: string, nombreCuenta: string, debe: number): BalanzaPnL {
    return {
      idCuenta,
      nombreCuenta,
      categoriaMaestra: "OpEx",
      saldoInicial: 0,
      debe,
      haber: 0,
      saldoFinal: 0,
      depreciacionAmortizacion: false,
      periodo: 1,
      anio: 2026,
    } as unknown as BalanzaPnL;
  }

  const rows = [
    ventas(2026, 1, 1000),
    gasto("6101-0001-0000-0000", "SUELDOS", 100),
    gasto("6101-0002-0000-0000", "HONORARIOS", 50),
    gasto("6201-0001-0000-0000", "RENTA", 30),
    gasto("6101-0009-0000-0000", "INTERESES BANCARIOS", 20),
  ];
  const tree = buildResultadosTree({ "2026": rows }, ["2026"]);
  const collapsed = collapseToMayorAccounts(tree, ["2026"], (segment) => `Cuenta de mayor ${segment}`);
  const byId = (nodes: typeof tree, id: string) => nodes.find((node) => node.id === id);

  it("deja una fila por cuenta de mayor con la suma de sus subcuentas", () => {
    const opex = byId(collapsed, "pyg:gastos-op");
    assert.deepEqual(
      opex?.children?.map((child) => [child.label, child.values["2026"]]),
      [
        ["Cuenta de mayor 6101", 150],
        ["Cuenta de mayor 6201", 30],
      ],
    );
    assert.ok(opex?.children?.every((child) => !child.children?.length));
  });

  it("los rubros y la utilidad neta no cambian", () => {
    for (const id of ["pyg:ingresos", "pyg:gastos-op", "pyg:fin", "pyg:ub", "pyg:ebit", "pyg:un"]) {
      assert.deepEqual(byId(collapsed, id)?.values, byId(tree, id)?.values, id);
    }
    assert.equal(byId(collapsed, "pyg:un")?.values["2026"], 800);
  });

  it("solo audita la mayor completa; si se reparte entre rubros no abre pólizas ajenas", () => {
    const opex = byId(collapsed, "pyg:gastos-op");
    const fin = byId(collapsed, "pyg:fin");
    assert.equal(opex?.children?.find((child) => child.label.endsWith("6201"))?.code, "6201");
    assert.equal(opex?.children?.find((child) => child.label.endsWith("6101"))?.code, undefined);
    assert.equal(fin?.children?.[0]?.values["2026"], 20);
  });

  it("no toca filas que no son rubros", () => {
    assert.equal(byId(collapsed, "pyg:ub"), byId(tree, "pyg:ub"));
  });
});

describe("nombre de la cuenta de mayor", () => {
  function opex(idCuenta: string, nombreCuenta: string, debe: number): BalanzaPnL {
    return {
      idCuenta,
      nombreCuenta,
      categoriaMaestra: "OpEx",
      saldoInicial: 0,
      debe,
      haber: 0,
      saldoFinal: 0,
      depreciacionAmortizacion: false,
      periodo: 1,
      anio: 2026,
    } as unknown as BalanzaPnL;
  }
  const fallback = (segment: string) => `Cuenta de mayor ${segment}`;
  const childrenOf = (nodes: ReturnType<typeof buildResultadosTree>, id: string) =>
    nodes.find((node) => node.id === id)?.children ?? [];

  it("si la balanza trae la cuenta de mayor, muestra su nombre y no el genérico", () => {
    const tree = buildResultadosTree(
      {
        "2026": [
          opex("6101-0000-0000-0000", "GASTOS GENERALES", 0),
          opex("6101-0001-0000-0000", "SUELDOS", 100),
          opex("6101-0002-0000-0000", "HONORARIOS", 50),
        ],
      },
      ["2026"],
    );
    const rows = childrenOf(collapseToMayorAccounts(tree, ["2026"], fallback), "pyg:gastos-op");
    assert.deepEqual(
      rows.map((row) => [row.label, row.values["2026"]]),
      [["GASTOS GENERALES", 150]],
    );
  });

  it("usa el nombre de la mayor aunque la fila esté en otro rubro", () => {
    const tree = buildResultadosTree(
      {
        "2026": [
          opex("6101-0000-0000-0000", "GASTOS GENERALES", 0),
          opex("6101-0001-0000-0000", "SUELDOS", 100),
          opex("6101-0009-0000-0000", "INTERESES BANCARIOS", 20),
        ],
      },
      ["2026"],
    );
    const collapsed = collapseToMayorAccounts(tree, ["2026"], fallback);
    assert.equal(childrenOf(collapsed, "pyg:fin")[0]?.label, "GASTOS GENERALES");
    assert.equal(childrenOf(collapsed, "pyg:fin")[0]?.values["2026"], 20);
  });

  it("sin fila de mayor no toma el nombre de una subcuenta: usa el genérico", () => {
    const tree = buildResultadosTree(
      { "2026": [opex("6101-0001-0000-0000", "SUELDOS", 100), opex("6101-0002-0000-0000", "HONORARIOS", 50)] },
      ["2026"],
    );
    const rows = childrenOf(collapseToMayorAccounts(tree, ["2026"], fallback), "pyg:gastos-op");
    assert.deepEqual(rows.map((row) => row.label), ["Cuenta de mayor 6101"]);
  });
});

describe("nombre de mayor guardado por la importación", () => {
  function opex(idCuenta: string, nombreCuenta: string, debe: number): BalanzaPnL {
    return {
      idCuenta,
      nombreCuenta,
      categoriaMaestra: "OpEx",
      saldoInicial: 0,
      debe,
      haber: 0,
      saldoFinal: 0,
      depreciacionAmortizacion: false,
      periodo: 1,
      anio: 2026,
    } as unknown as BalanzaPnL;
  }

  it("usa el nombre del catálogo de la balanza para la cuenta de mayor", () => {
    const tree = buildResultadosTree(
      { "2026": [opex("6101-0001-0000-0000", "Sueldos y Salarios", 100), opex("6101-0002-0000-0000", "Compensaciones", 50)] },
      ["2026"],
    );
    const collapsed = collapseToMayorAccounts(tree, ["2026"], (code) => `Cuenta de mayor ${code}`, {
      "6101": "GASTOS GENERALES",
    });
    const rows = collapsed.find((node) => node.id === "pyg:gastos-op")?.children ?? [];
    assert.deepEqual(rows.map((row) => [row.label, row.values["2026"]]), [["GASTOS GENERALES", 150]]);
  });
});

