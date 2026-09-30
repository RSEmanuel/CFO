import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePeriodOrigins } from "./periodOrigins";

describe("resolvePeriodOrigins", () => {
  it("marca como contpaqi solo los periodos con commit de ingesta", () => {
    const origins = resolvePeriodOrigins(["2026-05", "2026-06", "2026-07"], new Set(["2026-07"]));
    assert.deepEqual(origins, {
      "2026-05": "seed",
      "2026-06": "seed",
      "2026-07": "contpaqi",
    });
  });

  it("devuelve un mapa vacío cuando no hay periodos", () => {
    assert.deepEqual(resolvePeriodOrigins([], new Set(["2026-07"])), {});
  });

  it("no inventa orígenes para periodos fuera del set de commits", () => {
    const origins = resolvePeriodOrigins(["2024-08"], new Set());
    assert.equal(origins["2024-08"], "seed");
  });
});
