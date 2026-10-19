"use client";

import { useLocale } from "@/context/LocaleContext";
import { canvasColor, CHART } from "@/lib/chart-theme";
import type { FlujoLinea } from "@/services/flujoEfectivo";
import { buildFlujoSankey, FLUJO_SANKEY_TOTAL_INGRESOS, type FlujoSankeyNode } from "@/services/flujoSankey";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import { SankeyChart, type SankeySeriesOption } from "echarts/charts";
import { TooltipComponent, type TooltipComponentOption } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";

echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

type SankeyOption = echarts.ComposeOption<SankeySeriesOption | TooltipComponentOption>;

const LABEL_COLOR = "var(--cifra-ink)";

// Entradas en verde y salidas en rojo.
const NODE_COLOR: Record<FlujoSankeyNode["side"], string> = {
  in: CHART.olive,
  totalIn: CHART.olive,
  out: CHART.coral,
};

// Ancho de la etiqueta del total: cabe "Total de ingresos" a 18 px en un renglón y el monto debajo.
const TOTAL_LABEL_WIDTH = 220;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function FlujoEfectivoSankey({
  ingresos,
  egresos,
  units,
}: {
  ingresos: FlujoLinea[];
  egresos: FlujoLinea[];
  units: DisplayUnits;
}) {
  const { t } = useLocale();

  const option = useMemo<SankeyOption>(() => {
    const graph = buildFlujoSankey(ingresos, egresos, {
      totalIngresos: t("flujo.efectivo.totalIngresos"),
    });
    const displayByName = new Map(graph.nodes.map((node) => [node.name, node.display]));
    const inflow = canvasColor(CHART.olive);
    const outflow = canvasColor(CHART.coral);

    return {
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        textStyle: { fontSize: 13 },
        extraCssText: "border-radius:8px;",
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          if (!item) {
            return "";
          }
          const raw = Number(item.value);
          const value = Number.isFinite(raw) ? raw : 0;
          if (item.dataType === "edge") {
            const flow = String(item.name)
              .split(" > ")
              .map((id) => displayByName.get(id) ?? id)
              .join(" → ");
            return `${escapeHtml(flow)}<br/><strong>${escapeHtml(formatMxn(value))}</strong>`;
          }
          const name = displayByName.get(String(item.name)) ?? String(item.name);
          return `${escapeHtml(name)}<br/><strong>${escapeHtml(formatMxn(value))}</strong>`;
        },
      },
      series: [
        {
          type: "sankey",
          // Tres columnas: las etiquetas de los extremos van por fuera y la del total, centrada arriba.
          left: 220,
          right: 220,
          top: 72,
          bottom: 36,
          layoutIterations: 0,
          nodeAlign: "justify",
          nodeWidth: 16,
          nodeGap: 32,
          draggable: false,
          data: graph.nodes.map((node) => ({
            name: node.name,
            itemStyle: {
              color: canvasColor(NODE_COLOR[node.side]),
              borderWidth: 0,
            },
            label:
              node.side === "totalIn"
                ? {
                    position: "top",
                    align: "center",
                    width: TOTAL_LABEL_WIDTH,
                    overflow: "break",
                    fontSize: 18,
                    fontWeight: 600,
                    lineHeight: 24,
                  }
                : { position: node.side === "in" ? "left" : "right" },
          })),
          // Color sólido por enlace (sin degradado): verde hacia el total, rojo del total a los egresos.
          links: graph.links.map((link) => ({
            ...link,
            lineStyle: { color: link.source === FLUJO_SANKEY_TOTAL_INGRESOS ? outflow : inflow },
          })),
          label: {
            distance: 12,
            fontSize: 13,
            fontWeight: 500,
            color: canvasColor(LABEL_COLOR),
            lineHeight: 18,
            overflow: "none",
            formatter: (params) => {
              const name = displayByName.get(String(params.name)) ?? String(params.name);
              return `${name}\n${formatAxisTick(Number(params.value) || 0, units)}`;
            },
          },
          lineStyle: {
            opacity: 0.35,
            curveness: 0.5,
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: { opacity: 0.65 },
          },
        },
      ],
    };
  }, [ingresos, egresos, units, t]);

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      style={{ height: "100%", width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
