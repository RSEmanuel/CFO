export const CHART = {
  clay: "var(--cifra-brand)",
  clayHover: "var(--cifra-brand)",
  coral: "var(--cifra-bad)",
  sand: "var(--cifra-warn)",
  olive: "var(--cifra-good)",
  slate: "var(--cifra-brand)",
  mute: "var(--cifra-ink-3)",
  beigeDeep: "var(--cifra-line)",
  canvas: "var(--cifra-paper)",
  card: "var(--cifra-surface)",
} as const;

export const CHART_SERIES = [CHART.clay, CHART.clayHover, CHART.sand, CHART.olive, CHART.mute];

/**
 * Top 5: pasos de cobalto y tinta con contraste entre vecinos.
 * Mezclas de tokens (no hex nuevo) para que las franjas apiladas no se confundan.
 */
export const TOP5_SERIES = [
  "var(--cifra-brand)",
  "var(--cifra-ink)",
  "color-mix(in srgb, var(--cifra-brand) 50%, var(--cifra-paper))",
  "color-mix(in srgb, var(--cifra-brand) 55%, var(--cifra-ink))",
  "var(--cifra-ink-3)",
] as const;

export const TOP5_RESTO = "color-mix(in srgb, var(--cifra-ink-3) 45%, var(--cifra-paper))";

/** Mix 100% COGS: directo (tinta), GIF (grafito), utilidad (cobalto). */
export const COGS_STACK = {
  directo: "var(--cifra-ink)",
  indirecto: "var(--cifra-ink-3)",
  utilidad: "var(--cifra-brand)",
} as const;

/**
 * Split comercial del OPEX (tab Gasto): venta tinta, admin grafito,
 * otros (6301 D&A + demás 6xxx) línea. Lo comparten la barra de
 * split del hero y el treemap (las hojas del treemap son tintes de estos).
 */
export const OPEX_SPLIT = {
  venta: "var(--cifra-ink)",
  admin: "var(--cifra-ink-3)",
  otros: "var(--cifra-line)",
} as const;

/**
 * Cascadas: verde suma al resultado o entra dinero, rojo resta, sale dinero o es
 * pérdida, azul es utilidad o saldo positivo. Uso de señal sobre una cifra real.
 */
export const WATERFALL_TONE = {
  gain: "var(--cifra-good)",
  loss: "var(--cifra-bad)",
  profit: "var(--cifra-brand)",
} as const;

/** Color de una cifra impresa en una cascada: roja si es negativa. */
export function waterfallFigureColor(value: number, fallback: string): string {
  return value < 0 ? WATERFALL_TONE.loss : fallback;
}

export const CHART_AXIS = {
  stroke: CHART.beigeDeep,
  tick: CHART.mute,
} as const;

/**
 * ECharts pinta en canvas y `addColorStop` no acepta `var(--token)`.
 * Lee el valor computado del token para conservar claro/oscuro sin hex en el código.
 */
export function canvasColor(color: string): string {
  if (typeof document === "undefined") {
    return color;
  }
  const token = /^var\((--[\w-]+)\)$/.exec(color.trim());
  if (!token) {
    return color;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(token[1]).trim();
  return value || color;
}

/** Canvas, card, ejes y texto que siguen light/dark vía CSS vars (no hex). */
export const CHART_VARS = {
  canvas: "hsl(var(--background))",
  card: "hsl(var(--card))",
  text: "hsl(var(--card-foreground))",
  mute: "hsl(var(--muted-foreground))",
  axis: "hsl(var(--border))",
} as const;