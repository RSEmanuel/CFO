import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AdminGetUserCommand, CognitoIdentityProviderClient, ForgotPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import { onboardTenantSchema } from "@/auth/schemas";
import { prisma } from "@/lib/prisma";
import { onboardTenant } from "@/services/tenants/onboarding";

// Base local + Cognito simulado: nunca sale a AWS. Se usan RFC y correos de prueba y se borran al terminar.
const RFC = "ONBTEST01";
const OWNER = "dueno.onboarding@ejemplo.test";
const originalSend = CognitoIdentityProviderClient.prototype.send;
const ENV_KEYS = ["AWS_REGION", "COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET", "DEV_AUTH_BYPASS"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
let failCreate = false;
let failWelcome = false;
let actor: { userId: string; email: string; role: "CFO_PARTNER" };

async function cleanup() {
  await prisma.adminAuditLog.deleteMany({ where: { targetEmail: OWNER } });
  await prisma.user.deleteMany({ where: { email: OWNER } });
  await prisma.tenant.deleteMany({ where: { rfc: RFC } });
}

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  Object.assign(process.env, {
    AWS_REGION: "us-east-1",
    COGNITO_USER_POOL_ID: "us-east-1_test",
    COGNITO_CLIENT_ID: "client-test",
    COGNITO_CLIENT_SECRET: "",
    DEV_AUTH_BYPASS: "false",
  });
  failCreate = false;
  failWelcome = false;
  CognitoIdentityProviderClient.prototype.send = async function send(command: { constructor: { name: string } }) {
    if (failCreate && command.constructor.name === "AdminCreateUserCommand") throw new Error("boom");
    if (failWelcome && command instanceof ForgotPasswordCommand) throw new Error("sin correo");
    if (command instanceof AdminGetUserCommand) return { UserAttributes: [{ Name: "sub", Value: "sub-onb-1" }] };
    return {};
  } as typeof originalSend;
  await cleanup();
  const partner = await prisma.user.findFirst({ where: { role: "CFO_PARTNER", isActive: true } });
  assert.ok(partner, "se necesita un CFO_PARTNER en la base local");
  actor = { userId: partner.id, email: partner.email, role: "CFO_PARTNER" };
});

afterEach(async () => {
  CognitoIdentityProviderClient.prototype.send = originalSend;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await cleanup();
  await prisma.$disconnect();
});

describe("alta de empresa con dueño", () => {
  it("valida el correo del dueño y deja el nombre opcional", () => {
    assert.throws(() => onboardTenantSchema.parse({ name: "Empresa X", rfc: RFC, ownerEmail: "no-es-correo" }));
    const parsed = onboardTenantSchema.parse({ name: "Empresa X", rfc: RFC, ownerEmail: " a@b.mx ", ownerName: "  " });
    assert.equal(parsed.ownerEmail, "a@b.mx");
    assert.equal(parsed.ownerName, undefined);
  });

  it("crea empresa y dueño CLIENT_VIEWER de esa empresa, y manda la bienvenida", async () => {
    const result = await onboardTenant({ actor, name: "Empresa de prueba onboarding", rfc: RFC, ownerEmail: OWNER });
    assert.equal(result.welcomeEmailSent, true);
    const user = await prisma.user.findUnique({ where: { email: OWNER } });
    assert.equal(user?.role, "CLIENT_VIEWER");
    assert.equal(user?.tenantId, result.tenant.id);
    assert.equal(user?.cognitoSub, "sub-onb-1");
  });

  it("si Cognito falla, no deja la empresa a medias", async () => {
    failCreate = true;
    await assert.rejects(onboardTenant({ actor, name: "Empresa de prueba onboarding", rfc: RFC, ownerEmail: OWNER }));
    assert.equal(await prisma.tenant.count({ where: { rfc: RFC } }), 0);
    assert.equal(await prisma.user.count({ where: { email: OWNER } }), 0);
  });

  it("si solo falla el correo, deja todo creado y avisa que se reenvíe", async () => {
    failWelcome = true;
    const result = await onboardTenant({ actor, name: "Empresa de prueba onboarding", rfc: RFC, ownerEmail: OWNER });
    assert.equal(result.welcomeEmail, "failed");
    assert.equal(result.welcomeEmailSent, false);
    assert.equal(await prisma.tenant.count({ where: { rfc: RFC } }), 1);
  });

  it("un correo repetido se rechaza antes de crear la empresa", async () => {
    await onboardTenant({ actor, name: "Empresa de prueba onboarding", rfc: RFC, ownerEmail: OWNER });
    await assert.rejects(onboardTenant({ actor, name: "Otra", rfc: "ONBTEST02", ownerEmail: OWNER }), { code: "CONFLICT" });
    assert.equal(await prisma.tenant.count({ where: { rfc: "ONBTEST02" } }), 0);
  });
});
