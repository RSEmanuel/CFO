export type SankeyFrame = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  fontSize: number;
  lineHeight: number;
  nodeGap: number;
  labelWidth: number;
  showAmount: boolean;
  totalFontSize: number;
};

const TOP = 64;
const BOTTOM = 24;

function labelBand(lineHeight: number, twoLine: boolean): number {
  return twoLine ? lineHeight * 2 + 8 : lineHeight + 8;
}

/** Alto del mapa cuando no está expandido: una banda por categoría, para que las chicas no se encimen. */
export function sankeyChartHeight(nodeCount: number): number {
  const count = Math.max(nodeCount, 1);
  const bands = Math.max(count - 1, 1);
  const needed = TOP + BOTTOM + count * 6 + bands * labelBand(18, true);
  return Math.max(540, Math.min(960, needed));
}

/**
 * Márgenes y tipo según el recuadro real.
 * Si no cabe el monto debajo del nombre, la etiqueta queda en un renglón y el monto sigue en el tooltip.
 * El hueco entre nodos es al menos el alto de la etiqueta, porque las categorías chicas si no se pisan.
 */
export function sankeyFrame(width: number, height: number, nodeCount: number): SankeyFrame {
  const safeWidth = width > 0 ? width : 1200;
  const safeHeight = height > 0 ? height : 540;
  const count = Math.max(nodeCount, 1);
  const bands = Math.max(count - 1, 1);
  const narrow = safeWidth < 1040;
  const side = narrow ? Math.round(Math.min(188, Math.max(108, safeWidth * 0.23))) : 220;
  const fontSize = narrow ? 11 : 13;
  const lineHeight = narrow ? 14 : 18;
  const twoLineNeeded = TOP + BOTTOM + count * 6 + bands * labelBand(lineHeight, true);
  const showAmount = twoLineNeeded <= safeHeight;
  const nodeGap = labelBand(lineHeight, showAmount);
  return {
    left: side,
    right: side,
    top: TOP,
    bottom: BOTTOM,
    fontSize,
    lineHeight,
    nodeGap,
    labelWidth: Math.max(84, side - 28),
    showAmount,
    totalFontSize: narrow ? 15 : 18,
  };
}
