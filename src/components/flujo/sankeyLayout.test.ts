import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sankeyChartHeight, sankeyFrame } from "./sankeyLayout";

describe("marco del Sankey", () => {
  it("en ~787 px achica el margen y, si no cabe el monto, deja un solo renglón", () => {
    const frame = sankeyFrame(787, 540, 15);
    assert.ok(frame.left < 200);
    assert.ok(frame.right < 200);
    assert.equal(frame.fontSize, 11);
    assert.equal(frame.showAmount, false);
    assert.ok(frame.nodeGap >= frame.lineHeight + 8);
    assert.ok(frame.labelWidth <= frame.left);
  });

  it("en escritorio ancho conserva el margen y el monto", () => {
    const frame = sankeyFrame(1400, 860, 8);
    assert.equal(frame.left, 220);
    assert.equal(frame.showAmount, true);
    assert.equal(frame.fontSize, 13);
  });

  it("el alto crece con las categorías y no se sale de la página", () => {
    assert.equal(sankeyChartHeight(4), 540);
    assert.ok(sankeyChartHeight(15) > 540);
    assert.equal(sankeyChartHeight(40), 960);
  });
});
