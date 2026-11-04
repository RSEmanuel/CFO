export function splitAxisLabel(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return [label];
  }
  return [words[0]!, words.slice(1).join(" ")];
}

const CHAR_PX = 6.6;

/** true cuando el renglón más ancho no cabe en la columna de su barra. */
export function waterfallLabelsOverlap(width: number, labels: string[]): boolean {
  if (width <= 0 || labels.length === 0) {
    return false;
  }
  const slot = (width - 88) / labels.length;
  const widest = Math.max(
    ...labels.map((label) => Math.max(...splitAxisLabel(label).map((line) => line.length))),
  );
  return widest * CHAR_PX > slot - 6;
}
