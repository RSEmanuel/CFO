import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { cachedForTenant, clearServerCache, invalidateTenantCache } from "@/lib/serverCache";

describe("caché corta del servidor", () => {
  beforeEach(() => clearServerCache());

  it("no recalcula dentro de la ventana y comparte cálculos simultáneos", async () => {
    let calls = 0;
    const compute = async () => ++calls;
    const [a, b] = await Promise.all([cachedForTenant("t1", "k", compute), cachedForTenant("t1", "k", compute)]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(await cachedForTenant("t1", "k", compute), 1);
    assert.equal(calls, 1);
  });

  it("recalcula al vencer, al invalidar la empresa y no mezcla empresas", async () => {
    let calls = 0;
    const compute = async () => ++calls;
    let clock = 0;
    const now = () => clock;
    await cachedForTenant("t1", "k", compute, 100, now);
    clock = 101;
    assert.equal(await cachedForTenant("t1", "k", compute, 100, now), 2);
    assert.equal(await cachedForTenant("t2", "k", compute, 100, now), 3);
    invalidateTenantCache("t1");
    assert.equal(await cachedForTenant("t1", "k", compute, 100, now), 4);
    assert.equal(await cachedForTenant("t2", "k", compute, 100, now), 3);
  });

  it("no guarda errores", async () => {
    await assert.rejects(cachedForTenant("t1", "e", async () => { throw new Error("x"); }));
    assert.equal(await cachedForTenant("t1", "e", async () => 7), 7);
  });
});
