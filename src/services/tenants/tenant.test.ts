import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planDevBypassLogin } from "../../auth/devBypass";
import { createTenantSchema } from "../../auth/schemas";
import { EMPTY_COMPAC_TENANT, normalizeTenantRfc } from "./constants";

describe("dev bypass y tenant vacío", () => {
  it("conserva usuarios existentes y solo crea los nuevos", () => {
    assert.equal(planDevBypassLogin(null), "create");
    assert.equal(planDevBypassLogin({ isActive: true }), "keep");
    assert.equal(planDevBypassLogin({ isActive: false }), "inactive");
  });

  it("normaliza RFC y acepta el tenant real Compac en el schema de alta", () => {
    assert.equal(normalizeTenantRfc("  compac260731xxx  "), EMPTY_COMPAC_TENANT.rfc);
    const parsed = createTenantSchema.parse({
      name: EMPTY_COMPAC_TENANT.name,
      rfc: EMPTY_COMPAC_TENANT.rfc,
    });
    assert.equal(parsed.rfc, EMPTY_COMPAC_TENANT.rfc);
  });
});
