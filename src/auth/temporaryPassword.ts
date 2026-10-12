import { randomInt } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*-_=+?";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/**
 * Contraseña temporal para altas desde el portal. Cumple la política por defecto
 * de Cognito (mayúscula, minúscula, número y símbolo) y evita caracteres que se
 * confunden al dictarla (0/O, 1/l/I). Se muestra una sola vez y nunca se guarda.
 */
export function generateTemporaryPassword(length = 16): string {
  const required = [UPPER, LOWER, DIGITS, SYMBOLS].map((set) => set[randomInt(set.length)]);
  const rest = Array.from({ length: Math.max(length - required.length, 0) }, () => ALL[randomInt(ALL.length)]);
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
