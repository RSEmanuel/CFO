/**
 * Parte una frase en tramos de texto y tramos de cifra para que la interfaz
 * resalte solo lo que el usuario busca al leer: montos, porcentajes, plazos y
 * veces. Una sola regla para toda la app; los textos no llevan marcado propio.
 */
export type TramoFrase = { texto: string; cifra: boolean };

const SIGNO = "[+\\-−]?";
const NUMERO = "\\d[\\d,]*(?:\\.\\d+)?";
const FIN_PALABRA = "(?![\\p{L}\\d])";

const MONTO = `${SIGNO}\\$\\s?${NUMERO}(?:\\s?[KMB]${FIN_PALABRA}|\\s(?:mil(?:lones)?|millón|mdp)${FIN_PALABRA})?`;
const PORCENTAJE = `${SIGNO}${NUMERO}\\s?%`;
const PLAZO = `${NUMERO}\\+?\\s(?:días|día|days|day|meses|mes|months|month|años|año|years|year|semanas|semana|weeks|week)${FIN_PALABRA}`;
const VECES = `${NUMERO}\\s?(?:x|veces|times)${FIN_PALABRA}`;
const CENTAVOS = `${NUMERO}\\s(?:centavos|cents)${FIN_PALABRA}`;

const CIFRA = new RegExp(`${MONTO}|${PORCENTAJE}|${PLAZO}|${VECES}|${CENTAVOS}`, "gu");

export function tramosConCifras(frase: string): TramoFrase[] {
  const tramos: TramoFrase[] = [];
  let desde = 0;
  for (const match of frase.matchAll(CIFRA)) {
    const inicio = match.index ?? 0;
    if (inicio > desde) tramos.push({ texto: frase.slice(desde, inicio), cifra: false });
    tramos.push({ texto: match[0], cifra: true });
    desde = inicio + match[0].length;
  }
  if (desde < frase.length) tramos.push({ texto: frase.slice(desde), cifra: false });
  return tramos;
}
