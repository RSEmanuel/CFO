import { AppError } from "@/auth/errors";
import { generateTemporaryPassword } from "@/auth/temporaryPassword";
import { UserRole } from "@/generated/prisma/enums";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUpdateUserAttributesCommand,
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
  ChangePasswordCommand,
  CodeMismatchException,
  ConfirmForgotPasswordCommand,
  ExpiredCodeException,
  ForgotPasswordCommand,
  InvalidParameterException,
  LimitExceededException,
  TooManyFailedAttemptsException,
  TooManyRequestsException,
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

/**
 * El usuario cambia su propia contraseña con su access token. No requiere
 * permisos IAM: Cognito valida la contraseña actual contra el token.
 */
export async function changeOwnCognitoPassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const client = getClient();

  try {
    await client.send(
      new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: currentPassword,
        ProposedPassword: newPassword,
      }),
    );
  } catch (error) {
    // NotAuthorized aquí significa contraseña actual incorrecta, no sesión inválida:
    // se responde 400 para que el cliente no lo trate como sesión vencida.
    if (error instanceof NotAuthorizedException) {
      throw new AppError("VALIDATION_ERROR", "La contraseña actual no es correcta.", 400, {
        reason: "currentPasswordWrong",
      });
    }
    if (error instanceof InvalidPasswordException) {
      throw new AppError("VALIDATION_ERROR", "La contraseña no cumple la política del User Pool.", 400, {
        reason: "passwordPolicy",
      });
    }
    if (error instanceof LimitExceededException || error instanceof TooManyRequestsException) {
      throw new AppError("VALIDATION_ERROR", "Demasiados intentos. Espera unos minutos.", 429, {
        reason: "tooManyAttempts",
      });
    }
    mapCognitoError(error);
  }
}

/**
 * Manda por correo un código para restablecer la contraseña. Nunca revela si el
 * correo existe: el app client tiene PreventUserExistenceErrors y aquí se tragan
 * los errores de usuario inexistente o sin correo verificado.
 */
export async function sendPasswordResetCode(email: string): Promise<void> {
  const { clientId } = getConfig();
  const client = getClient();
  const secretHash = computeSecretHash(email);

  try {
    await client.send(
      new ForgotPasswordCommand({
        ClientId: clientId,
        Username: email,
        ...(secretHash ? { SecretHash: secretHash } : {}),
      }),
    );
  } catch (error) {
    if (error instanceof LimitExceededException || error instanceof TooManyRequestsException) {
      throw new AppError("VALIDATION_ERROR", "Demasiados intentos. Espera unos minutos.", 429, {
        reason: "tooManyAttempts",
      });
    }
    if (
      error instanceof UserNotFoundException ||
      error instanceof NotAuthorizedException ||
      error instanceof InvalidParameterException
    ) {
      console.warn("No se envió código de restablecimiento", (error as Error).name);
      return;
    }
    mapCognitoError(error);
  }
}

/**
 * Correo de bienvenida: el mismo código de ForgotPassword, que el usuario usa en /set-password para
 * crear su contraseña. A diferencia de sendPasswordResetCode, aquí sí se reporta la falla, porque
 * quien da de alta necesita saber si el correo salió para poder reenviarlo.
 * ClientMetadata.flow = "welcome" permite a un trigger Custom Message distinguirlo de un "olvidé mi contraseña".
 */
export async function sendWelcomeCode(email: string): Promise<void> {
  const { clientId } = getConfig();
  const client = getClient();
  const secretHash = computeSecretHash(email);

  try {
    await client.send(
      new ForgotPasswordCommand({
        ClientId: clientId,
        Username: email,
        ClientMetadata: { flow: "welcome" },
        ...(secretHash ? { SecretHash: secretHash } : {}),
      }),
    );
  } catch (error) {
    if (error instanceof LimitExceededException || error instanceof TooManyRequestsException) {
      throw new AppError("VALIDATION_ERROR", "Demasiados intentos. Espera unos minutos.", 429, {
        reason: "tooManyAttempts",
      });
    }
    console.error("No se envió el correo de bienvenida", (error as Error).name);
    throw new AppError("INTERNAL_ERROR", "No se pudo enviar el correo de bienvenida.", 502, {
      reason: "welcomeFailed",
    });
  }
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const { clientId } = getConfig();
  const client = getClient();
  const secretHash = computeSecretHash(email);

  try {
    await client.send(
      new ConfirmForgotPasswordCommand({
        ClientId: clientId,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
        ...(secretHash ? { SecretHash: secretHash } : {}),
      }),
    );
  } catch (error) {
    // Usuario inexistente se reporta igual que código incorrecto, para no revelar cuentas.
    if (
      error instanceof CodeMismatchException ||
      error instanceof UserNotFoundException ||
      error instanceof NotAuthorizedException
    ) {
      throw new AppError("VALIDATION_ERROR", "El código no es correcto.", 400, {
        reason: "codeWrong",
      });
    }
    if (error instanceof ExpiredCodeException) {
      throw new AppError("VALIDATION_ERROR", "El código ya venció.", 400, { reason: "codeExpired" });
    }
    if (error instanceof InvalidPasswordException) {
      throw new AppError("VALIDATION_ERROR", "La contraseña no cumple la política del User Pool.", 400, {
        reason: "passwordPolicy",
      });
    }
    if (
      error instanceof LimitExceededException ||
      error instanceof TooManyRequestsException ||
      error instanceof TooManyFailedAttemptsException
    ) {
      throw new AppError("VALIDATION_ERROR", "Demasiados intentos. Espera unos minutos.", 429, {
        reason: "tooManyAttempts",
      });
    }
    mapCognitoError(error);
  }
}

/**
 * Crea al usuario sin correo de Cognito (SUPPRESS) y con una contraseña interna aleatoria que nadie
 * conoce: así queda CONFIRMED, el único estado en que ForgotPassword manda el código de bienvenida
 * (un usuario en FORCE_CHANGE_PASSWORD no puede restablecer). La contraseña real la crea la persona.
 */
export async function adminCreateCognitoUser(input: {
  email: string;
  name?: string;
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
          ...(input.name ? [{ Name: "name", Value: input.name }] : []),
        ],
      }),
    );

    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: generateTemporaryPassword(24),
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

/** Encender o apagar el acceso en Cognito. A diferencia de disableCognitoUser, sí propaga el error. */
export async function setCognitoUserEnabled(username: string, enabled: boolean): Promise<void> {
  const { userPoolId } = getConfig();
  const client = getClient();

  try {
    await client.send(
      enabled
        ? new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: username })
        : new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: username }),
    );
  } catch (error) {
    mapCognitoError(error);
  }
}

/** Mueve al usuario al grupo del rol nuevo y actualiza custom:role. */
export async function changeCognitoUserRole(
  username: string,
  fromRole: UserRole,
  toRole: UserRole,
): Promise<void> {
  const { userPoolId } = getConfig();
  const client = getClient();

  try {
    await client.send(
      new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: username, GroupName: toRole }),
    );
    await client.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: fromRole,
      }),
    );
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [{ Name: "custom:role", Value: toRole }],
      }),
    );
  } catch (error) {
    mapCognitoError(error);
  }
}
