import type { FlujoLinea } from "@/services/flujoEfectivo";
import { MONEY_TOLERANCE, round2 } from "@/services/money";

/** Hub central de tesorería del Sankey ingresos → total de ingresos → caja → egresos. */
export const FLUJO_SANKEY_CAJA = "__caja__";

/** Nodo que junta todas las categorías de ingreso antes de entrar a Caja. */
export const FLUJO_SANKEY_TOTAL_INGRESOS = "__total_ingresos__";

export type FlujoSankeyNode = {
  name: string;
  display: string;
  depth: 0 | 1 | 2 | 3;
  side: "in" | "totalIn" | "caja" | "out";
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
 * Sankey de origen y aplicación: cada categoría de ingreso alimenta "Total de ingresos", que entra a
 * Caja con un solo enlace por la suma; cada categoría de egreso sale de Caja.
 * Los labels se toman del reporte (p. ej. "Ingr cobranza", "Egr proveedores").
 */
export function buildFlujoSankey(
  ingresos: FlujoLinea[],
  egresos: FlujoLinea[],
  labels: { caja: string; totalIngresos: string },
): FlujoSankeyGraph {
  const inLineas = ingresos.filter((linea) => positive(linea.monto));
  const outLineas = egresos.filter((linea) => positive(linea.monto));
  const inLinks: FlujoSankeyLink[] = inLineas.map((linea) => ({
    source: `in:${linea.categoriaKey}`,
    target: FLUJO_SANKEY_TOTAL_INGRESOS,
    value: round2(linea.monto),
  }));
  const totalIngresos = round2(inLinks.reduce((sum, link) => sum + link.value, 0));
  const hasIngresos = inLinks.length > 0;

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
    {
      name: FLUJO_SANKEY_CAJA,
      display: labels.caja,
      depth: 2 as const,
      side: "caja" as const,
    },
    ...outLineas.map((linea) => ({
      name: `out:${linea.categoriaKey}`,
      display: linea.label,
      depth: 3 as const,
      side: "out" as const,
    })),
  ];

  const links: FlujoSankeyLink[] = [
    ...inLinks,
    ...(hasIngresos ? [{ source: FLUJO_SANKEY_TOTAL_INGRESOS, target: FLUJO_SANKEY_CAJA, value: totalIngresos }] : []),
    ...outLineas.map((linea) => ({
      source: FLUJO_SANKEY_CAJA,
      target: `out:${linea.categoriaKey}`,
      value: round2(linea.monto),
    })),
  ];

  return { nodes, links };
}
