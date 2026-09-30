"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { Tooltip as Hint, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/context/LocaleContext";
import { useGastoOpex } from "@/hooks/use-gasto-opex";
import { monthLabelKey } from "@/i18n/format";
import { CHART, OPEX_SPLIT } from "@/lib/chart-theme";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { formatMxn } from "@/services/money";
import {
  cleanOpexCuentaNombre,
  type GastoOpexTreemap,
  type OpexTreemapBucket,
  type OpexTreemapLeaf,
} from "@/services/gastoOpexTreemap";
import { TreemapChart, type TreemapSeriesOption } from "echarts/charts";
import { TooltipComponent, type TooltipComponentOption } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { HelpCircle } from "lucide-react";
import { useMemo, useState } from "react";

echarts.use([TreemapChart, TooltipComponent, CanvasRenderer]);

type TreemapOption = echarts.ComposeOption<TreemapSeriesOption | TooltipComponentOption>;

type GastoOpexTreemapProps = {
  periodo: string;
  treemap: GastoOpexTreemap;
};

type TreemapNodeData = {
  name: string;
  value: number;
  pctTotal: number;
  deltaMomPct: number | null;
  idCuenta?: string;
  esOtrosMenores?: boolean;
  itemStyle: { color: string };
  children?: TreemapNodeData[];
};

/** Tinte del color base mezclado con blanco (0 = base, 1 = blanco). */
function tintWithWhite(hex: string, ratio: number): string {
  const raw = hex.replace("#", "");
  const channel = (index: number) => parseInt(raw.slice(index, index + 2), 16);
  const mixed = [0, 2, 4].map((index) => Math.round(channel(index) + (255 - channel(index)) * ratio));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** Hojas de un bucket: la mayor usa el color base; las menores, tintes crecientes. */
function leafColor(bucket: OpexTreemapBucket, index: number, count: number): string {
  const base = OPEX_SPLIT[bucket];
  if (count <= 1) {
    return base;
  }
  const ratio = 0.12 + (0.5 * index) / Math.max(1, count - 1);
  return tintWithWhite(base, Math.min(0.62, ratio));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSignedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function GastoOpexTreemap({ periodo, treemap }: GastoOpexTreemapProps) {
  const { t } = useLocale();
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);
  const auditPeriod = parseIngresoPeriodo(periodo);

  const bucketLabel = (bucket: OpexTreemapBucket): string =>
    t(
      bucket === "venta"
        ? "resultados.opex.treemap.bucketVenta"
        : bucket === "admin"
          ? "resultados.opex.treemap.bucketAdmin"
          : "resultados.opex.treemap.bucketOtros",
    );

  const priorLabel = useMemo(() => {
    if (!treemap.periodoAnterior) {
      return null;
    }
    const match = treemap.periodoAnterior.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return treemap.periodoAnterior;
    }
    const abbr = t(monthLabelKey(Number(match[2]) - 1)).slice(0, 3);
    return `${abbr}-${match[1].slice(-2)}`;
  }, [treemap.periodoAnterior, t]);

  const option = useMemo<TreemapOption>(() => {
    const data: TreemapNodeData[] = treemap.buckets.map((bucket) => ({
      name: bucketLabel(bucket.bucket),
      value: bucket.monto,
      pctTotal: bucket.pctTotal,
      deltaMomPct: bucket.deltaMomPct,
      itemStyle: { color: OPEX_SPLIT[bucket.bucket] },
      children: bucket.leaves.map((leaf: OpexTreemapLeaf, index: number) => ({
        name: leaf.esOtrosMenores
          ? t("resultados.opex.treemap.otrosMenores")
          : cleanOpexCuentaNombre(leaf.nombreCuenta),
        value: leaf.monto,
        pctTotal: leaf.pctTotal,
        deltaMomPct: leaf.deltaMomPct,
        ...(leaf.idCuenta ? { idCuenta: leaf.idCuenta } : {}),
        ...(leaf.esOtrosMenores ? { esOtrosMenores: true } : {}),
        itemStyle: { color: leafColor(bucket.bucket, index, bucket.leaves.length) },
      })),
    }));

    return {
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        textStyle: { fontSize: 13 },
        extraCssText: "border-radius:8px;box-shadow:0 4px 16px rgb(40 30 20 / 0.12);",
        formatter: (params) => {
          const item = (Array.isArray(params) ? params[0] : params) as
            | { name?: string; value?: unknown; data?: TreemapNodeData }
            | undefined;
          const node = item?.data;
          if (!node) {
            return "";
          }
          const monto = Number(node.value);
          const pct = typeof node.pctTotal === "number" ? node.pctTotal : 0;
          const deltaLine = priorLabel
            ? `<br/><span style="color:${CHART.mute}">${escapeHtml(
                t("resultados.opex.treemap.tooltipDelta", {
                  periodo: priorLabel,
                  valor:
                    node.deltaMomPct == null
                      ? t("resultados.opex.na")
                      : formatSignedPct(node.deltaMomPct),
                }),
              )}</span>`
            : "";
          return [
            `<strong>${escapeHtml(node.name)}</strong>`,
            `<br/>${escapeHtml(formatMxn(monto))}`,
            `<br/><span style="color:${CHART.mute}">${escapeHtml(
              t("resultados.opex.treemap.tooltipShare", { pct: pct.toFixed(1) }),
            )}</span>`,
            deltaLine,
          ].join("");
        },
      },
      series: [
        {
          type: "treemap",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          width: "100%",
          height: "100%",
          data,
          label: {
            show: true,
            fontSize: 11,
            lineHeight: 14,
            color: "#FFFFFF",
            overflow: "truncate",
            formatter: (params) => {
              const node = params.data as TreemapNodeData | undefined;
              const pct = node?.pctTotal;
              if (typeof pct !== "number" || pct < 2) {
                return "";
              }
              return `${params.name}\n${pct.toFixed(1)}%`;
            },
          },
          upperLabel: {
            show: true,
            height: 22,
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: "transparent",
          },
          itemStyle: {
            borderColor: CHART.card,
            borderWidth: 2,
            gapWidth: 2,
          },
          levels: [
            {
              itemStyle: { borderWidth: 0, gapWidth: 3 },
            },
            {
              itemStyle: { gapWidth: 2 },
              upperLabel: { show: true },
            },
            {
              itemStyle: { gapWidth: 1 },
            },
          ],
        },
      ],
    };
    // bucketLabel es estable (usa t); priorLabel se memoiza aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treemap, t, priorLabel]);

  if (treemap.buckets.length === 0) {
    return null;
  }

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <div className="flex items-center gap-1.5">
          <h2 className="font-serif text-xl font-medium text-foreground">{t("resultados.opex.treemap.title")}</h2>
          <FavoriteStarButton widgetId="chart-gasto-treemap" label={t("resultados.opex.treemap.title")} />
          <TooltipProvider delayDuration={200}>
            <Hint>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("resultados.opex.treemap.helpTooltip")}
                  className="text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("resultados.opex.treemap.helpTooltip")}</TooltipContent>
            </Hint>
          </TooltipProvider>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("resultados.opex.treemap.help")}</p>
      </div>
      <div className="h-[380px] w-full min-w-0 md:h-[420px]">
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge
          lazyUpdate
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          onEvents={{
            click: (params: { data?: TreemapNodeData }) => {
              const node = params.data;
              if (!node?.idCuenta || !auditPeriod) {
                return;
              }
              setAuditTarget({
                codigoCuenta: node.idCuenta,
                nombreCuenta: node.name,
                anio: auditPeriod.anio,
                periodo: auditPeriod.mes,
              });
            },
          }}
        />
      </div>
      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </section>
  );
}

/**
 * Variante auto-fetch para el Panel de Control: pide el payload de gasto/opex
 * del periodo (deduplicado por api-cache) y renderiza solo el treemap.
 */
export function GastoOpexTreemapCard({ periodo }: { periodo: string }) {
  const { data, loading, error } = useGastoOpex(periodo);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data?.treemap) {
    return null;
  }
  return <GastoOpexTreemap periodo={data.periodo} treemap={data.treemap} />;
}
