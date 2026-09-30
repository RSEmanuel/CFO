import assert from "node:assert/strict";
import test from "node:test";
import { parseIngresoPeriodo } from "@/services/ingresoMix";

test("parseIngresoPeriodo: YYYY-MM válido", () => {
  assert.deepEqual(parseIngresoPeriodo("2026-07"), { anio: 2026, mes: 7 });
  assert.deepEqual(parseIngresoPeriodo("2025-12"), { anio: 2025, mes: 12 });
});

test("parseIngresoPeriodo: rechaza formatos inválidos", () => {
  assert.equal(parseIngresoPeriodo("2026-13"), null);
  assert.equal(parseIngresoPeriodo("2026-7"), null);
  assert.equal(parseIngresoPeriodo("julio-2026"), null);
  assert.equal(parseIngresoPeriodo(""), null);
});
