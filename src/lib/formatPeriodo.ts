/** «2026-07» → «Julio 2026» (es) / «July 2026» (en). Si el periodo no se entiende, lo devuelve tal cual. */
export function formatPeriodoMesAnio(periodo: string, locale: string): string {
  const match = /^(\d{4})-(\d{1,2})$/.exec(periodo.trim());
  if (!match) return periodo;
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) return periodo;
  // Sin year en el Intl: en español insertaría «de».
  const nombre = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)));
  return `${nombre.charAt(0).toLocaleUpperCase(locale === "en" ? "en-US" : "es-MX")}${nombre.slice(1)} ${anio}`;
}
