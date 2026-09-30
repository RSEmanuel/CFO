import { AppError, unauthorized } from "@/auth/errors";
import { readDevAccessToken } from "@/auth/devAuth";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { CognitoJwtInvalidTokenUseError, JwtExpiredError } from "aws-jwt-verify/error";

export type CognitoAccessPayload = {
  sub: string;
  username?: string;
  client_id?: string;
  token_use: string;
  email?: string;
};

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getVerifier() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Falta configuración de Cognito (COGNITO_USER_POOL_ID o COGNITO_CLIENT_ID).",
      500,
    );
  }

  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });
  }

  return verifier;
}

export function extractBearerToken(authorizationHeader: string | null): string {
  if (!authorizationHeader) {
    throw unauthorized("Falta el encabezado Authorization.");
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw unauthorized("El encabezado Authorization debe ser Bearer.");
  }

  return token;
}

export async function verifyAccessToken(token: string): Promise<CognitoAccessPayload> {
  const devPayload = readDevAccessToken(token);
  if (devPayload) {
    return devPayload;
  }

  try {
    const payload = await getVerifier().verify(token);
    return {
      sub: String(payload.sub),
      username: typeof payload.username === "string" ? payload.username : undefined,
      client_id: typeof payload.client_id === "string" ? payload.client_id : undefined,
      token_use: String(payload.token_use),
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch (error) {
    if (error instanceof JwtExpiredError) {
      throw unauthorized("El token expiró. Inicia sesión de nuevo.");
    }
    if (error instanceof CognitoJwtInvalidTokenUseError) {
      throw unauthorized("Se requiere un Access Token de Cognito.");
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw unauthorized("El token JWT no es válido.");
  }
}
