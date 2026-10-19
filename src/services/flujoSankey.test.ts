import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { COMPAC_FLUJO_EFECTIVO_PROFILE } from "./ingest/builtinProfiles";
import { parseFlujoEfectivoSheet } from "./ingest/parseFlujoEfectivo";
import type { FlujoLinea } from "./flujoEfectivo";
import { buildFlujoSankey, FLUJO_SANKEY_CAJA, FLUJO_SANKEY_TOTAL_INGRESOS } from "./flujoSankey";

const LABELS = { caja: "Caja", totalIngresos: "Total de ingresos" };

const JUL_FIXTURE = path.resolve("Data_ejemplo/03. Flujo de Efectivo 31.07.26.xlsx");

async function loadLineas(excluirTraspasos = true): Promise<{ ingresos: FlujoLinea[]; egresos: FlujoLinea[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(JUL_FIXTURE) as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0]!;
  const result = parseFlujoEfectivoSheet(sheet, COMPAC_FLUJO_EFECTIVO_PROFILE, 7, 2026);
  const toLinea = (row: (typeof result.detalle)[number]): FlujoLinea => ({
    categoriaKey: row.categoriaKey,
    label: row.labelOrigen,
    monto: row.monto,
    esTraspaso: row.esTraspaso,
  });
  const ingresos = result.detalle.filter((row) => row.direccion === "ingreso").map(toLinea);
  const egresos = result.detalle.filter((row) => row.direccion === "egreso").map(toLinea);
  if (!excluirTraspasos) {
    return { ingresos, egresos };
  }
  return {
    ingresos: ingresos.filter((linea) => !linea.esTraspaso),
    egresos: egresos.filter((linea) => !linea.esTraspaso),
  };
}

describe("flujo Sankey ingresos → total de ingresos → tesorería → egresos", () => {
  it("los ingresos van a Total de ingresos, de ahí un solo enlace a Caja, y los egresos salen de Caja (jul-2026 sin traspasos)", async () => {
    const { ingresos, egresos } = await loadLineas(true);
    const graph = buildFlujoSankey(ingresos, egresos, LABELS);

    assert.equal(graph.nodes.filter((node) => node.side === "caja").length, 1);
    const total = graph.nodes.filter((node) => node.side === "totalIn");
    assert.equal(total.length, 1);
    assert.equal(total[0]?.name, FLUJO_SANKEY_TOTAL_INGRESOS);
    assert.equal(total[0]?.display, "Total de ingresos");
    assert.equal(total[0]?.depth, 1);
    assert.equal(graph.nodes.find((node) => node.side === "caja")?.depth, 2);
    assert.ok(graph.nodes.filter((node) => node.side === "out").every((node) => node.depth === 3));
    assert.deepEqual(
      graph.nodes.filter((node) => node.side === "in").map((node) => node.name).sort(),
      ["in:cobranza", "in:diversos", "in:prestamos"].sort(),
    );
    assert.ok(graph.nodes.some((node) => node.name === "out:proveedores"));
    assert.ok(graph.nodes.some((node) => node.name === "out:sueldos"));
    assert.ok(!graph.nodes.some((node) => node.name.includes("traspasos")));
    assert.ok(!graph.nodes.some((node) => node.name.startsWith("hub.")));
    assert.ok(!graph.nodes.some((node) => node.name === "terminal.residual"));

    const inLinks = graph.links.filter((link) => link.source.startsWith("in:"));
    assert.ok(inLinks.length > 0);
    for (const link of inLinks) {
      assert.equal(link.target, FLUJO_SANKEY_TOTAL_INGRESOS, "un ingreso ya no conecta directo a Caja");
    }
    const toCaja = graph.links.filter((link) => link.target === FLUJO_SANKEY_CAJA);
    assert.equal(toCaja.length, 1);
    assert.equal(toCaja[0]?.source, FLUJO_SANKEY_TOTAL_INGRESOS);
    const sumaIngresos = Math.round(inLinks.reduce((sum, link) => sum + link.value, 0) * 100) / 100;
    assert.equal(toCaja[0]?.value, sumaIngresos);

    for (const link of graph.links.filter((item) => item.source === FLUJO_SANKEY_CAJA)) {
      assert.ok(link.target.startsWith("out:"));
    }
  });

  it("con montos de muestra: un enlace a Caja por la suma exacta y profundidades 0-3", () => {
    const linea = (categoriaKey: string, monto: number): FlujoLinea => ({ categoriaKey, label: categoriaKey, monto, esTraspaso: false });
    const graph = buildFlujoSankey(
      [linea("a", 100.1), linea("b", 200.2), linea("cero", 0)],
      [linea("x", 50), linea("y", 25)],
      LABELS,
    );
    assert.deepEqual(
      graph.nodes.map((node) => [node.name, node.depth]),
      [
        ["in:a", 0],
        ["in:b", 0],
        [FLUJO_SANKEY_TOTAL_INGRESOS, 1],
        [FLUJO_SANKEY_CAJA, 2],
        ["out:x", 3],
        ["out:y", 3],
      ],
    );
    assert.deepEqual(graph.links, [
      { source: "in:a", target: FLUJO_SANKEY_TOTAL_INGRESOS, value: 100.1 },
      { source: "in:b", target: FLUJO_SANKEY_TOTAL_INGRESOS, value: 200.2 },
      { source: FLUJO_SANKEY_TOTAL_INGRESOS, target: FLUJO_SANKEY_CAJA, value: 300.3 },
      { source: FLUJO_SANKEY_CAJA, target: "out:x", value: 50 },
      { source: FLUJO_SANKEY_CAJA, target: "out:y", value: 25 },
    ]);
  });

  it("sin ingresos no dibuja Total de ingresos", () => {
    const graph = buildFlujoSankey([], [{ categoriaKey: "sueldos", label: "Egr sueldos", monto: 100, esTraspaso: false }], LABELS);
    assert.ok(!graph.nodes.some((node) => node.side === "totalIn"));
    assert.ok(!graph.links.some((link) => link.target === FLUJO_SANKEY_CAJA));
  });

  it("incluye traspasos de ingreso cuando no se excluyen", async () => {
    const { ingresos, egresos } = await loadLineas(false);
    assert.ok(ingresos.some((linea) => linea.esTraspaso));
    const graph = buildFlujoSankey(ingresos, egresos, LABELS);
    assert.ok(graph.nodes.some((node) => node.name === "in:traspasos"));
    const sinTraspasos = buildFlujoSankey(
      ingresos.filter((linea) => !linea.esTraspaso),
      egresos.filter((linea) => !linea.esTraspaso),
      LABELS,
    );
    assert.ok(!sinTraspasos.nodes.some((node) => node.name.includes("traspasos")));
  });
});
