/** Siglas que se conservan en mayúsculas cuando aparecen como palabra completa. */
const ACRONYMS = new Set(["IVA", "ISR", "IEPS", "PTU", "RFC", "USD"]);

/**
 * CONTPAQi exporta los nombres de cuenta en mayúsculas. Los pasa a sentence case al mostrarlos
 * («COSTO DE VENTAS» → «Costo de ventas») sin tocar el dato. Un nombre que ya trae minúsculas se deja igual.
 */
export function formatAccountName(nombre: string): string {
  const hasLetters = /\p{L}/u.test(nombre);
  if (!hasLetters || nombre !== nombre.toLocaleUpperCase("es-MX")) {
    return nombre;
  }
  let first = true;
  return nombre
    .toLocaleLowerCase("es-MX")
    .replace(/\p{L}[\p{L}\p{N}]*/gu, (word) => {
      const upper = word.toLocaleUpperCase("es-MX");
      if (ACRONYMS.has(upper)) {
        first = false;
        return upper;
      }
      if (first) {
        first = false;
        return upper.charAt(0) + word.slice(1);
      }
      return word;
    });
}
