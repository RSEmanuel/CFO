import type { FlujoLinea } from "@/services/flujoEfectivo";
import { MONEY_TOLERANCE, round2 } from "@/services/money";

/** Nodo central: junta todas las categorías de ingreso y de él salen los egresos. */
export const FLUJO_SANKEY_TOTAL_INGRESOS = "__total_ingresos__";

export type FlujoSankeyNode = {
  name: string;
  display: string;
  depth: 0 | 1 | 2;
  side: "in" | "totalIn" | "out";
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
 * Sankey de origen y aplicación en tres columnas: cada categoría de ingreso alimenta "Total de
 * ingresos" y cada categoría de egreso sale de él. Sin ingresos no hay nodo central y los egresos
 * quedan sin origen (no se inventa un nodo vacío).
 * Los labels se toman del reporte (p. ej. "Ingr cobranza", "Egr proveedores").
 */
export function buildFlujoSankey(
  ingresos: FlujoLinea[],
  egresos: FlujoLinea[],
  labels: { totalIngresos: string },
): FlujoSankeyGraph {
  const inLineas = ingresos.filter((linea) => positive(linea.monto));
  const outLineas = egresos.filter((linea) => positive(linea.monto));
  const hasIngresos = inLineas.length > 0;

  const nodes: FlujoSankeyNode[] = [
    ...inLineas.map((linea) => ({
      name: `in:${linea.categoriaKey}`,
      display: linea.label,
      depth: 0 as const,
      side: "in" as const,
    })),
    ...(hasIngresos
      ? [{ name: FLUJO_SANKEY_TOTAL_INGRESOS, display: labels.totalIngresos, depth: 1 as const, side: "totalIn" as const }]
      : []),
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
      target: FLUJO_SANKEY_TOTAL_INGRESOS,
      value: round2(linea.monto),
    })),
    ...(hasIngresos
      ? outLineas.map((linea) => ({
          source: FLUJO_SANKEY_TOTAL_INGRESOS,
          target: `out:${linea.categoriaKey}`,
          value: round2(linea.monto),
        }))
      : []),
  ];

  return { nodes, links };
}
