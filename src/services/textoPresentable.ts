const ACRONIMOS = new Set([
  "IVA",
  "ISR",
  "PTU",
  "IMSS",
  "SAR",
  "INFONAVIT",
  "FONACOT",
  "RFC",
  "SAT",
  "CFDI",
  "SPEI",
  "MXN",
  "USD",
  "BBVA",
  "AMEX",
  "SA",
  "CV",
  "RL",
  "SAPI",
  "SOFOM",
  "ENR",
  "AC",
  "SC",
  "CFE",
  "IEPS",
  "TDC",
  "NIF",
  "IFRS",
  "CP",
  "LP",
  "PF",
  "PM",
  "GB",
  "TB",
]);

const SIGLAS_PUNTUADAS = new Set(["S.A.", "C.V.", "S.A.P.I.", "S.DE.R.L.", "S.C."]);

const ENTIDADES: Record<string, string> = { "&quot;": '"', "&amp;": "&", "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };

/** True cuando las letras vienen todas en mayúscula (típico de CONTPAQi). */
export function esMayusculas(value: string): boolean {
  const letters = value.match(/\p{L}/gu);
  if (!letters || letters.length < 2) return false;
  return letters.every((letter) => letter === letter.toLocaleUpperCase("es-MX") && letter !== letter.toLocaleLowerCase("es-MX"));
}

/** Marca escrita a propósito con mayúsculas internas: iPad, MacBook, AppleCare+. */
function esMarcaMixta(token: string): boolean {
  const letters = token.match(/\p{L}/gu) ?? [];
  if (letters.length < 2) return false;
  const tieneMinuscula = letters.some((letter) => letter !== letter.toLocaleUpperCase("es-MX"));
  const mayusculaInterna = letters.slice(1).some((letter) => letter !== letter.toLocaleLowerCase("es-MX"));
  return tieneMinuscula && mayusculaInterna;
}

/**
 * Deja cualquier nombre (cuenta, cliente, proveedor) en tipo oración, venga
 * como venga: «SERVICIOS MARÍTIMOS», «Impuestos por Recuperar» y «Sueldos y
 * Salarios» quedan «Servicios marítimos», «Impuestos por recuperar» y
 * «Sueldos y salarios». Las siglas conocidas (IVA, ISR, SA de CV) van en
 * mayúscula; en un nombre que ya trae minúsculas también se respetan las
 * palabras escritas todas en mayúscula (siglas propias: «LG», «HP») y las
 * marcas con mayúscula interna («iPad», «MacBook»). No recupera acentos que el
 * archivo no traía. El dato guardado no cambia; esto es solo presentación.
 */
export function presentarNombre(value: string): string {
  const limpio = value.replace(/&(?:quot|amp|#39|apos|lt|gt);/g, (entidad) => ENTIDADES[entidad] ?? entidad).replace(/\s+/g, " ").trim();
  if (!limpio) return limpio;
  const todoMayusculas = esMayusculas(limpio);
  let primera = true;
  return limpio
    .split(" ")
    .map((part) => {
      const match = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}.´'’&+-]+)(.*)$/u);
      if (!match) {
        return part;
      }
      const [, pre, token, post] = match;
      const upper = token.toLocaleUpperCase("es-MX");
      const compact = upper.replace(/\./g, "");
      const tieneLetras = /\p{L}/u.test(token);
      let shown: string;
      const esCodigo = /\p{N}/u.test(token) && tieneLetras && token === upper;
      if (SIGLAS_PUNTUADAS.has(upper) || ACRONIMOS.has(upper) || ACRONIMOS.has(compact)) {
        shown = upper;
      } else if (esCodigo) {
        // Modelo, placa o serie: «Q3», «X390», «1HGRW1892KL911125», «512GB».
        shown = token;
      } else if (!todoMayusculas && tieneLetras && (esMarcaMixta(token) || (token.length > 1 && esMayusculas(token)))) {
        shown = token;
      } else {
        shown = capitalizar(token, primera);
      }
      if (tieneLetras || /\p{N}/u.test(token)) {
        primera = false;
      }
      return `${pre}${shown}${post}`;
    })
    .join(" ");
}

function capitalizar(token: string, primera: boolean): string {
  const lower = token.toLocaleLowerCase("es-MX");
  if (!primera) return lower;
  return lower.charAt(0).toLocaleUpperCase("es-MX") + lower.slice(1);
}
