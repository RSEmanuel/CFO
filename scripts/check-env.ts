import { loadEnvConfig } from "@next/env";
import { describeMissingEnv, missingRequiredEnv } from "../src/lib/requiredEnv";

/**
 * Corre antes de `next dev` (predev). Carga los mismos archivos .env que Next en desarrollo y, si falta
 * un dato sin el cual la app no abre la base o el acceso, detiene el arranque con una frase. Solo
 * imprime nombres, nunca valores. No corre en producción: `next build` y `next start` no pasan por aquí.
 */
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const missing = missingRequiredEnv(process.env);
if (missing.length > 0) {
  console.error(describeMissingEnv(missing));
  process.exit(1);
}
