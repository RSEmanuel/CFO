import { statementNodeValue } from "@/lib/posicion-financiera/statementNodes";
import type { StatementNode } from "@/services/posicionFinanciera";

export type RatioGaugeId = "currentRatio" | "operatingMargin" | "roe" | "dso";

export type RatioGaugeZone = "red" | "yellow" | "green";

export const RATIO_GAUGE_NODE_IDS: Record<RatioGaugeId, string> = {
  currentRatio: "ratio:currentRatio",
  operatingMargin: "ratio:operatingMargin",
  roe: "ratio:roe",
  dso: "ratio:dso",
};

/**
 * Umbrales por defecto (el árbol de razones no define bandas propias).
 * Current ratio: rojo <1, amarillo 1–1.5, verde ≥1.5 (x).
 * Margen operativo / ROE: puntos porcentuales del catálogo (pctOf).
 * DSO: menor es mejor — verde ≤45d, amarillo 45–60, rojo >60.
 */
export const RATIO_GAUGE_THRESHOLDS = {
  currentRatio: { invert: false, redBelow: 1, greenAtOrAbove: 1.5, scaleMax: 3 },
  operatingMargin: { invert: false, redBelow: 5, greenAtOrAbove: 15, scaleMax: 40 },
  roe: { invert: false, redBelow: 8, greenAtOrAbove: 15, scaleMax: 40 },
  dso: { invert: true, greenAtOrBelow: 45, redAbove: 60, scaleMax: 90 },
} as const;

export function ratioGaugeZone(id: RatioGaugeId, value: number): RatioGaugeZone {
  if (!Number.isFinite(value)) {
    return "red";
  }
  const spec = RATIO_GAUGE_THRESHOLDS[id];
  if (spec.invert) {
    if (value <= spec.greenAtOrBelow) {
      return "green";
    }
    if (value <= spec.redAbove) {
      return "yellow";
    }
    return "red";
  }
  if (value < spec.redBelow) {
    return "red";
  }
  if (value < spec.greenAtOrAbove) {
    return "yellow";
  }
  return "green";
}

export function extractRatioGaugeValues(
  nodes: StatementNode[],
  yearKey: string,
): Record<RatioGaugeId, number | null> {
  return {
    currentRatio: statementNodeValue(nodes, RATIO_GAUGE_NODE_IDS.currentRatio, yearKey),
    operatingMargin: statementNodeValue(nodes, RATIO_GAUGE_NODE_IDS.operatingMargin, yearKey),
    roe: statementNodeValue(nodes, RATIO_GAUGE_NODE_IDS.roe, yearKey),
    dso: statementNodeValue(nodes, RATIO_GAUGE_NODE_IDS.dso, yearKey),
  };
}

export function ratioGaugeScaleMax(id: RatioGaugeId, value: number | null): number {
  const base = RATIO_GAUGE_THRESHOLDS[id].scaleMax;
  if (value == null || !Number.isFinite(value)) {
    return base;
  }
  return Math.max(base, value);
}

export function ratioGaugeBands(
  id: RatioGaugeId,
  scaleMax: number,
): Array<{ zone: RatioGaugeZone; from: number; to: number }> {
  const spec = RATIO_GAUGE_THRESHOLDS[id];
  if (spec.invert) {
    return [
      { zone: "green", from: 0, to: spec.greenAtOrBelow },
      { zone: "yellow", from: spec.greenAtOrBelow, to: spec.redAbove },
      { zone: "red", from: spec.redAbove, to: scaleMax },
    ];
  }
  return [
    { zone: "red", from: 0, to: spec.redBelow },
    { zone: "yellow", from: spec.redBelow, to: spec.greenAtOrAbove },
    { zone: "green", from: spec.greenAtOrAbove, to: scaleMax },
  ];
}
