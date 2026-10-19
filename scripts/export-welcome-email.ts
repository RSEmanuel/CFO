import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  COGNITO_CODE_PARAMETER,
  PRODUCTION_APP_URL,
  WELCOME_EMAIL_SUBJECT,
  renderWelcomeEmail,
} from "../src/services/email/welcomeEmailTemplate";

/**
 * Escribe docs/templates/welcome-email.html con {####} y la URL de producción, listo para pegar en
 * Cognito → Messaging → Message templates → Verification message.
 */
const OUTPUT = resolve(__dirname, "../docs/templates/welcome-email.html");
// El asunto va aparte para que scripts/upload-welcome-email-cognito.sh lo lea sin compilar TypeScript.
const SUBJECT_OUTPUT = resolve(__dirname, "../docs/templates/welcome-email.subject.txt");
// Límite de Cognito para el cuerpo del mensaje de verificación.
const COGNITO_MAX_CHARS = 20_000;

const html = renderWelcomeEmail(COGNITO_CODE_PARAMETER, PRODUCTION_APP_URL);
if (!html.includes(COGNITO_CODE_PARAMETER)) {
  throw new Error(`La plantilla debe incluir ${COGNITO_CODE_PARAMETER}.`);
}
if (html.length > COGNITO_MAX_CHARS) {
  throw new Error(`La plantilla mide ${html.length} caracteres; Cognito acepta hasta ${COGNITO_MAX_CHARS}.`);
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, html, "utf8");
writeFileSync(SUBJECT_OUTPUT, `${WELCOME_EMAIL_SUBJECT}\n`, "utf8");
console.log(`Plantilla escrita en ${OUTPUT} (${html.length} caracteres).`);
console.log(`Asunto: ${WELCOME_EMAIL_SUBJECT}`);
