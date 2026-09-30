import type { CognitoAccessPayload } from "@/auth/jwt";

/**
 * Modo desarrollo sin AWS Cognito. Permite recorrer el portal con la base local
 * antes de tener un User Pool configurado.
 *
 * Se activa con DEV_AUTH_BYPASS="true" y queda deshabilitado por diseño cuando
 * NODE_ENV=production, para que un despliegue mal configurado no abra el acceso.
 */
const DEV_TOKEN_PREFIX = "dev-bypass.";

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";
}

export function buildDevCognitoSub(email: string): string {
  return `dev-user:${email.trim().toLowerCase()}`;
}

export function buildDevAccessToken(cognitoSub: string): string {
  return `${DEV_TOKEN_PREFIX}${cognitoSub}`;
}

/** Devuelve el payload equivalente al de Cognito, o null si no aplica. */
export function readDevAccessToken(token: string): CognitoAccessPayload | null {
  if (!isDevAuthBypassEnabled() || !token.startsWith(DEV_TOKEN_PREFIX)) {
    return null;
  }

  const sub = token.slice(DEV_TOKEN_PREFIX.length);
  if (!sub) {
    return null;
  }

  return {
    sub,
    username: sub,
    token_use: "access",
  };
}
