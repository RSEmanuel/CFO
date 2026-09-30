export function parseIngresoPeriodo(periodo: string): { anio: number; mes: number } | null {
  const match = periodo.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const mes = Number(match[2]);
  return mes >= 1 && mes <= 12 ? { anio: Number(match[1]), mes } : null;
}
