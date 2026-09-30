"use client";

import { formatAxisTick, type DisplayUnits } from "@/services/money";
import type { SankeyGraph } from "@/services/resultadosSankey";
import { CHART_AXIS } from "@/lib/chart-theme";
import { useLocale } from "@/context/LocaleContext";
import { SankeyChart, type SankeySeriesOption } from "echarts/charts";
import { TooltipComponent, type TooltipComponentOption } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";

echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

type SankeyOption = echarts.ComposeOption<SankeySeriesOption | TooltipComponentOption>;

type EstadoResultadosSankeyChartProps = {
  graph: SankeyGraph;
  units: DisplayUnits;
  ingresoTotal: number;
};

function sharePct(value: number, ingresoTotal: number): string {
  return ingresoTotal > 0.01 ? ((value / ingresoTotal) * 100).toFixed(1) : "0.0";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nodeDisplayName(
  node: { name: string; labelKey?: string; groupedCount?: number } | undefined,
  fallback: string,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  const base = node?.labelKey ? t(node.labelKey) : (node?.name ?? fallback);
  if (node?.groupedCount != null) {
    return `${base} (${t("resultados.sankey.groupedAccounts", { count: node.groupedCount })})`;
  }
  return base;
}

export function EstadoResultadosSankeyChart({ graph, units, ingresoTotal }: EstadoResultadosSankeyChartProps) {
  const { t } = useLocale();
  const option = useMemo<SankeyOption>(() => {
    const nodeByName = new Map(graph.nodes.map((node) => [node.name, node]));

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
              .map((id) => {
                const linked = nodeByName.get(id);
                return linked?.labelKey ? t(linked.labelKey) : id;
              })
              .join(" → ");
            return `${escapeHtml(flow)}<br/><strong>${formatAxisTick(value, units)}</strong>`;
          }
          const node = nodeByName.get(String(item.name));
          const nodeValue = node?.value ?? value;
          const displayName = nodeDisplayName(node, String(item.name), t);
          const groupedDetail =
            node?.groupedCount != null
              ? [
                  `<br/><span>${escapeHtml(t("resultados.sankey.groupedAccounts", { count: node.groupedCount }))}</span>`,
                  ...(node.groupedItems?.length
                    ? [
                        `<br/><span>${escapeHtml(t("resultados.sankey.topAccounts"))}</span>`,
                        ...node.groupedItems.map(
                          (grouped) =>
                            `<br/><span>• ${escapeHtml(grouped.name)}: ${formatAxisTick(grouped.value, units)}</span>`,
                        ),
                      ]
                    : []),
                ].join("")
              : "";
          return `${escapeHtml(displayName)}<br/><strong>${formatAxisTick(nodeValue, units)}</strong> (${sharePct(nodeValue, ingresoTotal)}%)${groupedDetail}`;
        },
      },
      series: [
        {
          type: "sankey",
          left: 200,
          right: 200,
          top: 16,
          bottom: 16,
          // layoutIterations: 0: el orden vertical es el de `data`, ya ordenado por
          // (depth, sortRank) en generateSankeyData. No reordenar aquí.
          layoutIterations: 0,
          nodeAlign: "left",
          nodeWidth: 18,
          nodeGap: 28,
          draggable: true,
          data: graph.nodes.map((node) => ({
            name: node.name,
            depth: node.depth,
            itemStyle: { color: node.color, borderWidth: 0 },
            label: {
              position: node.labelSide,
              formatter: `${nodeDisplayName(node, node.name, t)}\n${formatAxisTick(node.value, units)} (${sharePct(node.value, ingresoTotal)}%)`,
            },
          })),
          links: graph.links.map((link) => ({
            source: link.source,
            target: link.target,
            value: link.value,
          })),
          label: {
            distance: 12,
            fontSize: 13,
            fontWeight: 500,
            color: CHART_AXIS.tick,
            lineHeight: 18,
          },
          lineStyle: {
            color: "gradient",
            opacity: 0.4,
            curveness: 0.5,
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: { opacity: 0.7 },
          },
          blur: {
            itemStyle: { opacity: 0.45 },
            lineStyle: { opacity: 0.15 },
          },
        },
      ],
    };
  }, [graph, units, ingresoTotal, t]);

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
