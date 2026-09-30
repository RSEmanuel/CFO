import type { FlujoLinea } from "@/services/flujoEfectivo";
import { MONEY_TOLERANCE, round2 } from "@/services/money";

/** Hub central de tesorería del Sankey clásico ingresos → caja → egresos. */
export const FLUJO_SANKEY_CAJA = "__caja__";

export type FlujoSankeyNode = {
  name: string;
  display: string;
  depth: 0 | 1 | 2;
  side: "in" | "caja" | "out";
};

export type FlujoSankeyLink = { source: string; target: string; value: number };

export type FlujoSankeyGraph = {
  nodes: FlujoSankeyNode[];
  links: FlujoSankeyLink[];
};

function positive(value: number): boolean {
  return value > MONEY_TOLERANCE;
}

/**
 * Sankey clásico de origen y aplicación: cada categoría de ingreso alimenta
 * el nodo de tesorería y cada categoría de egreso sale de él.
 * Los labels se toman del reporte (p. ej. "Ingr cobranza", "Egr proveedores").
 */
export function buildFlujoSankey(ingresos: FlujoLinea[], egresos: FlujoLinea[], cajaLabel: string): FlujoSankeyGraph {
  const inLineas = ingresos.filter((linea) => positive(linea.monto));
  const outLineas = egresos.filter((linea) => positive(linea.monto));

  const nodes: FlujoSankeyNode[] = [
    ...inLineas.map((linea) => ({
      name: `in:${linea.categoriaKey}`,
      display: linea.label,
      depth: 0 as const,
      side: "in" as const,
    })),
    {
      name: FLUJO_SANKEY_CAJA,
      display: cajaLabel,
      depth: 1 as const,
      side: "caja" as const,
    },
    ...outLineas.map((linea) => ({
      name: `out:${linea.categoriaKey}`,
      display: linea.label,
      depth: 2 as const,
      side: "out" as const,
    })),
  ];

  const links: FlujoSankeyLink[] = [
    ...inLineas.map((linea) => ({
      source: `in:${linea.categoriaKey}`,
      target: FLUJO_SANKEY_CAJA,
      value: round2(linea.monto),
    })),
    ...outLineas.map((linea) => ({
      source: FLUJO_SANKEY_CAJA,
      target: `out:${linea.categoriaKey}`,
      value: round2(linea.monto),
    })),
  ];

  return { nodes, links };
}
