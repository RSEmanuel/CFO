import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeMissingEnv, missingRequiredEnv } from "./requiredEnv";

const FULL = {
  DATABASE_URL: "postgresql://ejemplo",
  AWS_REGION: "region-ejemplo",
  COGNITO_USER_POOL_ID: "pool-ejemplo",
  COGNITO_CLIENT_ID: "cliente-ejemplo",
};

describe("configuración obligatoria", () => {
  it("no pide nada cuando todo está", () => {
    assert.deepEqual(missingRequiredEnv(FULL), []);
  });

  it("trata un valor vacío como faltante", () => {
    assert.deepEqual(missingRequiredEnv({ ...FULL, DATABASE_URL: "  " }), ["DATABASE_URL"]);
    assert.deepEqual(missingRequiredEnv({ ...FULL, COGNITO_CLIENT_ID: "" }), ["COGNITO_CLIENT_ID"]);
  });

  it("sin Cognito solo exige la base", () => {
    assert.deepEqual(missingRequiredEnv({ DEV_AUTH_BYPASS: "true" }), ["DATABASE_URL"]);
  });

  it("la frase dice qué falta y nunca el valor", () => {
    const message = describeMissingEnv(["DATABASE_URL"]);
    assert.match(message, /falta DATABASE_URL/);
    assert.doesNotMatch(message, /postgresql/);
  });
});
