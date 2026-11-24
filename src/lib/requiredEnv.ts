/**
 * Datos sin los cuales la app no abre la base ni el acceso. Solo se revisa si existen: nunca se lee
 * ni se imprime su valor.
 */
type Env = Record<string, string | undefined>;

const DATABASE_KEYS = ["DATABASE_URL"] as const;
// Con el modo desarrollo sin Cognito activo, el acceso no necesita estas llaves.
const ACCESS_KEYS = ["AWS_REGION", "COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID"] as const;

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export function missingRequiredEnv(env: Env): string[] {
  const keys: string[] = [...DATABASE_KEYS];
  if (env.DEV_AUTH_BYPASS !== "true") {
    keys.push(...ACCESS_KEYS);
  }
  return keys.filter((key) => isBlank(env[key]));
}

/** Una frase con los nombres que faltan, sin valores. */
export function describeMissingEnv(missing: readonly string[]): string {
  const list = missing.join(", ");
  return missing.length === 1
    ? `Cifra no puede arrancar: falta ${list} en .env (o .env.local). Cópialo de .env.example y llena su valor.`
    : `Cifra no puede arrancar: faltan ${list} en .env (o .env.local). Cópialos de .env.example y llena sus valores.`;
}
