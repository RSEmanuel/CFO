import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRIMARY_NAV } from "./nav";

describe("primary nav", () => {
  it("places Panel de Control first, then Resultados", () => {
    assert.equal(PRIMARY_NAV[0]?.href, "/dashboard/control");
    assert.equal(PRIMARY_NAV[0]?.labelKey, "nav.control");
    assert.equal(PRIMARY_NAV[1]?.href, "/dashboard/overview");
    assert.equal(PRIMARY_NAV[1]?.labelKey, "nav.results");
  });
});
