import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractRatioGaugeValues,
  ratioGaugeBands,
  ratioGaugeZone,
} from "./ratioGaugeZones";
import type { StatementNode } from "@/services/posicionFinanciera";

describe("ratioGaugeZone", () => {
  it("current ratio: rojo <1, amarillo 1–1.5, verde ≥1.5", () => {
    assert.equal(ratioGaugeZone("currentRatio", 0.99), "red");
    assert.equal(ratioGaugeZone("currentRatio", 1), "yellow");
    assert.equal(ratioGaugeZone("currentRatio", 1.49), "yellow");
    assert.equal(ratioGaugeZone("currentRatio", 1.5), "green");
  });

  it("margen operativo: rojo <5%, amarillo 5–15%, verde ≥15%", () => {
    assert.equal(ratioGaugeZone("operatingMargin", 4.9), "red");
    assert.equal(ratioGaugeZone("operatingMargin", 5), "yellow");
    assert.equal(ratioGaugeZone("operatingMargin", 14.9), "yellow");
    assert.equal(ratioGaugeZone("operatingMargin", 15), "green");
  });

  it("ROE: rojo <8%, amarillo 8–15%, verde ≥15%", () => {
    assert.equal(ratioGaugeZone("roe", 7.9), "red");
    assert.equal(ratioGaugeZone("roe", 8), "yellow");
    assert.equal(ratioGaugeZone("roe", 15), "green");
  });

  it("DSO invierte la lógica: verde ≤45, amarillo 45–60, rojo >60", () => {
    assert.equal(ratioGaugeZone("dso", 36.57), "green");
    assert.equal(ratioGaugeZone("dso", 45), "green");
    assert.equal(ratioGaugeZone("dso", 45.01), "yellow");
    assert.equal(ratioGaugeZone("dso", 60), "yellow");
    assert.equal(ratioGaugeZone("dso", 60.01), "red");
  });
});

describe("extractRatioGaugeValues", () => {
  it("lee las cuatro razones anidadas del árbol", () => {
    const tree: StatementNode[] = [
      {
        id: "ratio:liquidez",
        label: "liq",
        kind: "group",
        values: { "2026": null },
        children: [{ id: "ratio:currentRatio", label: "cr", kind: "account", values: { "2026": 1.8 } }],
      },
      {
        id: "ratio:rentabilidad",
        label: "rent",
        kind: "group",
        values: { "2026": null },
        children: [
          { id: "ratio:operatingMargin", label: "om", kind: "account", values: { "2026": 22 } },
          { id: "ratio:roe", label: "roe", kind: "account", values: { "2026": 12 } },
        ],
      },
      {
        id: "ratio:actividad",
        label: "act",
        kind: "group",
        values: { "2026": null },
        children: [{ id: "ratio:dso", label: "dso", kind: "account", values: { "2026": 36.57 } }],
      },
    ];
    assert.deepEqual(extractRatioGaugeValues(tree, "2026"), {
      currentRatio: 1.8,
      operatingMargin: 22,
      roe: 12,
      dso: 36.57,
    });
  });
});

describe("ratioGaugeBands", () => {
  it("DSO pinta verde primero y rojo al final", () => {
    const bands = ratioGaugeBands("dso", 90);
    assert.deepEqual(
      bands.map((band) => band.zone),
      ["green", "yellow", "red"],
    );
  });
});
