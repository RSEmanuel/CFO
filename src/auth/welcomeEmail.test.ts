import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  LimitExceededException,
  MessageActionType,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { AppError } from "@/auth/errors";
import { adminCreateCognitoUser, sendWelcomeCode } from "@/auth/cognito";

// Cognito simulado: nunca sale a AWS. Se registran los comandos y se responde lo mínimo.
type Sent = { name: string; input: Record<string, unknown> };
let sent: Sent[] = [];
let failWith: Error | null = null;
const originalSend = CognitoIdentityProviderClient.prototype.send;
const ENV_KEYS = ["AWS_REGION", "COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  sent = [];
  failWith = null;
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.AWS_REGION = "us-east-1";
  process.env.COGNITO_USER_POOL_ID = "us-east-1_test";
  process.env.COGNITO_CLIENT_ID = "client-test";
  process.env.COGNITO_CLIENT_SECRET = "";
  CognitoIdentityProviderClient.prototype.send = async function send(command: { constructor: { name: string }; input: unknown }) {
    sent.push({ name: command.constructor.name, input: command.input as Record<string, unknown> });
    if (failWith) throw failWith;
    if (command instanceof AdminGetUserCommand) {
      return { UserAttributes: [{ Name: "sub", Value: "sub-123" }] };
    }
    return {};
  } as typeof originalSend;
});

afterEach(() => {
  CognitoIdentityProviderClient.prototype.send = originalSend;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("alta con correo de bienvenida", () => {
  it("crea sin correo de Cognito, con contraseña interna permanente y en el grupo del rol", async () => {
    const result = await adminCreateCognitoUser({ email: "nueva@ejemplo.test", role: "CLIENT_VIEWER", tenantId: "t1" });

    assert.deepEqual(result, { cognitoSub: "sub-123", username: "nueva@ejemplo.test" });
    assert.deepEqual(
      sent.map((item) => item.name),
      [AdminCreateUserCommand.name, AdminSetUserPasswordCommand.name, AdminAddUserToGroupCommand.name, AdminGetUserCommand.name],
    );
    const create = sent[0].input;
    assert.equal(create.MessageAction, MessageActionType.SUPPRESS);
    assert.deepEqual(create.UserAttributes, [
      { Name: "email", Value: "nueva@ejemplo.test" },
      { Name: "email_verified", Value: "true" },
      { Name: "custom:tenantId", Value: "t1" },
      { Name: "custom:role", Value: "CLIENT_VIEWER" },
    ]);
    // Queda CONFIRMED (Permanent) para que ForgotPassword pueda mandar el código; la contraseña no se devuelve.
    const setPassword = sent[1].input;
    assert.equal(setPassword.Permanent, true);
    assert.equal(typeof setPassword.Password, "string");
    assert.ok((setPassword.Password as string).length >= 24);
    assert.ok(!("temporaryPassword" in result));
    assert.equal(sent[2].input.GroupName, "CLIENT_VIEWER");
  });

  it("manda el código de bienvenida con ForgotPassword marcado como flow=welcome", async () => {
    await sendWelcomeCode("nueva@ejemplo.test");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].name, ForgotPasswordCommand.name);
    assert.equal(sent[0].input.Username, "nueva@ejemplo.test");
    assert.deepEqual(sent[0].input.ClientMetadata, { flow: "welcome" });
  });

  it("reporta la falla del correo (no la traga) para poder reenviarlo", async () => {
    failWith = new UserNotFoundException({ message: "no", $metadata: {} });
    await assert.rejects(sendWelcomeCode("nueva@ejemplo.test"), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.details?.reason, "welcomeFailed");
      return true;
    });
  });

  it("distingue el límite de intentos de Cognito", async () => {
    failWith = new LimitExceededException({ message: "limit", $metadata: {} });
    await assert.rejects(sendWelcomeCode("nueva@ejemplo.test"), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 429);
      assert.equal(error.details?.reason, "tooManyAttempts");
      return true;
    });
  });
});
