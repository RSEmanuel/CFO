const ACRONIMOS = new Set([
  "IVA",
  "ISR",
  "PTU",
  "IMSS",
  "SAR",
  "RFC",
  "SAT",
  "MXN",
  "USD",
  "BBVA",
  "SA",
  "CV",
  "SAPI",
  "SOFOM",
  "AC",
  "CFE",
  "IEPS",
  "TDC",
  "NIF",
  "IFRS",
  "CP",
  "LP",
]);

const SIGLAS_PUNTUADAS = new Set(["S.A.", "C.V.", "S.A.P.I.", "S.DE.R.L.", "S.C."]);

/** True cuando las letras vienen todas en mayúscula (típico de CONTPAQi). */
export function esMayusculas(value: string): boolean {
  const letters = value.match(/\p{L}/gu);
  if (!letters || letters.length < 2) return false;
  return letters.every((letter) => letter === letter.toLocaleUpperCase("es-MX") && letter !== letter.toLocaleLowerCase("es-MX"));
}

/**
 * Si el texto viene gritado, lo deja en oración: «SERVICIOS MARÍTIMOS» →
 * «Servicios marítimos», «BBVA BANCOMER» → «BBVA Bancomer». Un nombre que ya
 * trae minúsculas no se toca. No recupera acentos que el archivo no traía.
 */
export function presentarNombre(value: string): string {
  if (!esMayusculas(value)) return value;
  const trimmed = value.trim();
  let primera = true;
  return trimmed
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const match = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}.]+)(.*)$/u);
      if (!match) {
        primera = false;
        return part;
      }
      const [, pre, token, post] = match;
      const upper = token.toLocaleUpperCase("es-MX");
      const compact = upper.replace(/\./g, "");
      const shown =
        SIGLAS_PUNTUADAS.has(upper) || ACRONIMOS.has(upper) || ACRONIMOS.has(compact)
          ? upper
          : capitalizar(token, primera);
      primera = false;
      return `${pre}${shown}${post}`;
    })
    .join("");
}

function capitalizar(token: string, primera: boolean): string {
  const lower = token.toLocaleLowerCase("es-MX");
  if (!primera) return lower;
  return lower.charAt(0).toLocaleUpperCase("es-MX") + lower.slice(1);
}
