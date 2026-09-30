export const CHART = {
  clay: "#ff692d",
  clayHover: "#e85d27",
  coral: "#9F1239",
  sand: "#B08442",
  olive: "#4F6F52",
  slate: "#ff692d",
  mute: "#777573",
  beigeDeep: "#dcd9d6",
  canvas: "#ffffff",
  card: "#FFFFFF",
} as const;

export const CHART_SERIES = [CHART.clay, CHART.clayHover, CHART.sand, CHART.olive, CHART.mute];

/** Top 5 Destacados: líder terracota, pizarra, oliva, piedra, verde. */
export const TOP5_SERIES = ["#C25E38", "#334155", "#4d7c0f", "#78716c", "#15803d"] as const;

export const TOP5_RESTO = "#cbd5e1";

/** Mix 100% COGS: directo (gris azulado), GIF (ámbar), utilidad (esmeralda). */
export const COGS_STACK = {
  directo: "#4A6670",
  indirecto: "#F59E0B",
  utilidad: "#2ECC71",
} as const;

/**
 * Split comercial del OPEX (tab Gasto): venta verde seco, admin pizarra
 * azulada, otros (6301 D&A + demás 6xxx) ámbar seco. Lo comparten la barra de
 * split del hero y el treemap (las hojas del treemap son tintes de estos).
 */
export const OPEX_SPLIT = {
  venta: "#4F6F52",
  admin: "#4A6670",
  otros: "#C4A35A",
} as const;

export const CHART_AXIS = {
  stroke: CHART.beigeDeep,
  tick: CHART.mute,
} as const;

/** Canvas, card, ejes y texto que siguen light/dark vía CSS vars (no hex). */
export const CHART_VARS = {
  canvas: "hsl(var(--background))",
  card: "hsl(var(--card))",
  text: "hsl(var(--card-foreground))",
  mute: "hsl(var(--muted-foreground))",
  axis: "hsl(var(--border))",
} as const;
