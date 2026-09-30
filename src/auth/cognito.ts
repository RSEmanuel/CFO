import { AppError } from "@/auth/errors";
import { UserRole } from "@/generated/prisma/enums";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  MessageActionType,
  UsernameExistsException,
  NotAuthorizedException,
  UserNotFoundException,
  InvalidPasswordException,
  ResourceNotFoundException,
  AuthFlowType,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createHmac } from "crypto";

export type CognitoLoginResult =
  | {
      kind: "tokens";
      accessToken: string;
      idToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | {
      kind: "challenge";
      challengeName: string;
      session: string;
    };

type CognitoConfig = {
  region: string;
  userPoolId: string;
  clientId: string;
  clientSecret?: string;
};

function getConfig(): CognitoConfig {
  const region = process.env.AWS_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;

  if (!region || !userPoolId || !clientId) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Falta configuración de Cognito (AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID).",
      500,
    );
  }

  return {
    region,
    userPoolId,
    clientId,
    clientSecret: clientSecret ? clientSecret : undefined,
  };
}

function getClient(): CognitoIdentityProviderClient {
  const { region } = getConfig();
  return new CognitoIdentityProviderClient({ region });
}

function computeSecretHash(username: string): string | undefined {
  const { clientId, clientSecret } = getConfig();
  if (!clientSecret) {
    return undefined;
  }
  return createHmac("sha256", clientSecret).update(`${username}${clientId}`).digest("base64");
}

function mapCognitoError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }
  if (error instanceof UsernameExistsException) {
    throw new AppError("CONFLICT", "Ya existe un usuario con ese correo en Cognito.", 409);
  }
  if (error instanceof UserNotFoundException || error instanceof NotAuthorizedException) {
    throw new AppError("UNAUTHORIZED", "Correo o contraseña incorrectos.", 401);
  }
  if (error instanceof InvalidPasswordException) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La contraseña no cumple la política del User Pool.",
      400,
    );
  }
  if (error instanceof ResourceNotFoundException) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Recurso de Cognito no encontrado. Verifica User Pool, app client y grupos ADMIN, CFO_PARTNER y CLIENT_VIEWER.",
      500,
    );
  }
  throw error;
}

export async function initiatePasswordLogin(
  email: string,
  password: string,
): Promise<CognitoLoginResult> {
  const { clientId } = getConfig();
  const client = getClient();
  const secretHash = computeSecretHash(email);

  try {
    const response = await client.send(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          ...(secretHash ? { SECRET_HASH: secretHash } : {}),
        },
      }),
    );

    if (response.ChallengeName && response.Session) {
      return {
        kind: "challenge",
        challengeName: response.ChallengeName,
        session: response.Session,
      };
    }

    const result = response.AuthenticationResult;
    if (!result?.AccessToken || !result.IdToken || !result.RefreshToken) {
      throw new AppError("INTERNAL_ERROR", "Cognito no devolvió los tokens esperados.", 500);
    }

    return {
      kind: "tokens",
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      refreshToken: result.RefreshToken,
      expiresIn: result.ExpiresIn ?? 3600,
    };
  } catch (error) {
    mapCognitoError(error);
  }
}

export async function adminCreateCognitoUser(input: {
  email: string;
  password: string;
  role: UserRole;
  tenantId: string;
}): Promise<{ cognitoSub: string; username: string }> {
  const { userPoolId } = getConfig();
  const client = getClient();
  const username = input.email;

  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        MessageAction: MessageActionType.SUPPRESS,
        UserAttributes: [
          { Name: "email", Value: input.email },
          { Name: "email_verified", Value: "true" },
          { Name: "custom:tenantId", Value: input.tenantId },
          { Name: "custom:role", Value: input.role },
        ],
      }),
    );

    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: input.password,
        Permanent: true,
      }),
    );

    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: input.role,
      }),
    );

    const details = await client.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      }),
    );

    const cognitoSub = details.UserAttributes?.find((attr) => attr.Name === "sub")?.Value;
    if (!cognitoSub) {
      throw new AppError("INTERNAL_ERROR", "Cognito no devolvió el sub del usuario.", 500);
    }

    return { cognitoSub, username };
  } catch (error) {
    mapCognitoError(error);
  }
}

export async function disableCognitoUser(username: string): Promise<void> {
  const { userPoolId } = getConfig();
  const client = getClient();

  try {
    await client.send(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      }),
    );
  } catch (error) {
    console.error("No se pudo deshabilitar el usuario de Cognito tras un fallo de persistencia", error);
  }
}
