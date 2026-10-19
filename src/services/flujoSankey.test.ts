import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { COMPAC_FLUJO_EFECTIVO_PROFILE } from "./ingest/builtinProfiles";
import { parseFlujoEfectivoSheet } from "./ingest/parseFlujoEfectivo";
import type { FlujoLinea } from "./flujoEfectivo";
import { buildFlujoSankey, FLUJO_SANKEY_TOTAL_INGRESOS } from "./flujoSankey";

const LABELS = { totalIngresos: "Total de ingresos" };

const JUL_FIXTURE = path.resolve("Data_ejemplo/03. Flujo de Efectivo 31.07.26.xlsx");
// Data_ejemplo/ tiene datos reales y está en .gitignore: esos casos solo corren donde existe el archivo.
const SKIP_FIXTURE = existsSync(JUL_FIXTURE) ? false : "falta Data_ejemplo/ (no está en git)";

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

describe("flujo Sankey ingresos → total de ingresos → egresos", () => {
  it("los ingresos van a Total de ingresos y los egresos salen de él (jul-2026 sin traspasos)", { skip: SKIP_FIXTURE }, async () => {
    const { ingresos, egresos } = await loadLineas(true);
    const graph = buildFlujoSankey(ingresos, egresos, LABELS);

    const total = graph.nodes.filter((node) => node.side === "totalIn");
    assert.equal(total.length, 1);
    assert.equal(total[0]?.name, FLUJO_SANKEY_TOTAL_INGRESOS);
    assert.equal(total[0]?.display, "Total de ingresos");
    assert.equal(total[0]?.depth, 1);
    assert.ok(graph.nodes.filter((node) => node.side === "out").every((node) => node.depth === 2));
    assert.deepEqual(
      graph.nodes.filter((node) => node.side === "in").map((node) => node.name).sort(),
      ["in:cobranza", "in:diversos", "in:prestamos"].sort(),
    );
    assert.ok(graph.nodes.some((node) => node.name === "out:proveedores"));
    assert.ok(graph.nodes.some((node) => node.name === "out:sueldos"));
    assert.ok(!graph.nodes.some((node) => node.name.includes("traspasos")));
    assert.ok(!graph.nodes.some((node) => node.name.startsWith("hub.")));
    assert.ok(!graph.nodes.some((node) => node.name === "terminal.residual"));

    for (const link of graph.links) {
      if (link.source.startsWith("in:")) {
        assert.equal(link.target, FLUJO_SANKEY_TOTAL_INGRESOS);
      } else {
        assert.equal(link.source, FLUJO_SANKEY_TOTAL_INGRESOS);
        assert.ok(link.target.startsWith("out:"));
      }
    }
  });

  it("con montos de muestra: tres columnas y los egresos salen directo del total", () => {
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
        ["out:x", 2],
        ["out:y", 2],
      ],
    );
    assert.deepEqual(graph.links, [
      { source: "in:a", target: FLUJO_SANKEY_TOTAL_INGRESOS, value: 100.1 },
      { source: "in:b", target: FLUJO_SANKEY_TOTAL_INGRESOS, value: 200.2 },
      { source: FLUJO_SANKEY_TOTAL_INGRESOS, target: "out:x", value: 50 },
      { source: FLUJO_SANKEY_TOTAL_INGRESOS, target: "out:y", value: 25 },
    ]);
    assert.ok(!graph.nodes.some((node) => node.name === "__caja__"));
  });

  it("sin ingresos no dibuja Total de ingresos ni inventa un origen para los egresos", () => {
    const graph = buildFlujoSankey([], [{ categoriaKey: "sueldos", label: "Egr sueldos", monto: 100, esTraspaso: false }], LABELS);
    assert.ok(!graph.nodes.some((node) => node.side === "totalIn"));
    assert.deepEqual(graph.nodes.map((node) => node.name), ["out:sueldos"]);
    assert.deepEqual(graph.links, []);
  });

  it("incluye traspasos de ingreso cuando no se excluyen", { skip: SKIP_FIXTURE }, async () => {
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
