"use client";

import { useLocale } from "@/context/LocaleContext";
import { CHART } from "@/lib/chart-theme";
import type { FlujoLinea } from "@/services/flujoEfectivo";
import { buildFlujoSankey } from "@/services/flujoSankey";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import { SankeyChart, type SankeySeriesOption } from "echarts/charts";
import { TooltipComponent, type TooltipComponentOption } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";

echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

type SankeyOption = echarts.ComposeOption<SankeySeriesOption | TooltipComponentOption>;

const LABEL_COLOR = "#1A1915";
const EGRESO_COLORS = [CHART.coral, CHART.sand];

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
    const graph = buildFlujoSankey(ingresos, egresos, t("flujo.efectivo.caja"));
    const displayByName = new Map(graph.nodes.map((node) => [node.name, node.display]));
    const outIndex = new Map<string, number>();
    let outCount = 0;
    for (const node of graph.nodes) {
      if (node.side === "out") {
        outIndex.set(node.name, outCount);
        outCount += 1;
      }
    }

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
          left: 240,
          right: 240,
          top: 48,
          bottom: 36,
          layoutIterations: 0,
          nodeAlign: "justify",
          nodeWidth: 16,
          nodeGap: 28,
          draggable: false,
          data: graph.nodes.map((node) => ({
            name: node.name,
            itemStyle: {
              color:
                node.side === "in"
                  ? CHART.olive
                  : node.side === "caja"
                    ? CHART.clay
                    : EGRESO_COLORS[(outIndex.get(node.name) ?? 0) % EGRESO_COLORS.length],
              borderWidth: 0,
            },
            label: {
              position: node.side === "in" ? "left" : node.side === "out" ? "right" : "top",
            },
          })),
          links: graph.links,
          label: {
            distance: 12,
            fontSize: 13,
            fontWeight: 500,
            color: LABEL_COLOR,
            lineHeight: 18,
            overflow: "none",
            formatter: (params) => {
              const name = displayByName.get(String(params.name)) ?? String(params.name);
              return `${name}\n${formatAxisTick(Number(params.value) || 0, units)}`;
            },
          },
          lineStyle: {
            color: "gradient",
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
