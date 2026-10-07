"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { InfoDialog } from "@/components/ui/info-dialog";
import { useLocale } from "@/context/LocaleContext";
import { useGastoOpex } from "@/hooks/use-gasto-opex";
import { monthLabelKey } from "@/i18n/format";
import { canvasColor, CHART } from "@/lib/chart-theme";
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
  label?: { color: string };
  upperLabel?: { color: string };
  children?: TreemapNodeData[];
};

function hexChannels(color: string): [number, number, number] | null {
  const resolved = canvasColor(color);
  const raw = resolved.replace("#", "");
  if (!/^[\da-fA-F]{6}$/.test(raw)) {
    return null;
  }
  return [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16)) as [number, number, number];
}

function mixHex(from: string, to: string, ratio: number): string {
  const start = hexChannels(from);
  const end = hexChannels(to);
  if (!start || !end) {
    return canvasColor(from);
  }
  const mixed = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** Escala de cobalto: venta más profundo, admin medio, otros más claro. */
function bucketBlue(bucket: OpexTreemapBucket): string {
  if (bucket === "venta") {
    return mixHex("var(--cifra-brand)", "var(--cifra-ink)", 0.32);
  }
  if (bucket === "admin") {
    return canvasColor("var(--cifra-brand)");
  }
  return mixHex("var(--cifra-brand)", "var(--cifra-paper)", 0.45);
}

/** Dentro del grupo, la cuenta mayor conserva el azul base y las menores se aclaran. */
function leafBlue(bucket: OpexTreemapBucket, index: number, count: number): string {
  const base = bucketBlue(bucket);
  if (count <= 1) {
    return base;
  }
  const ratio = 0.16 + (0.58 * index) / Math.max(1, count - 1);
  return mixHex(base, "var(--cifra-paper)", Math.min(0.74, ratio));
}

function labelOn(fill: string): string {
  const channels = hexChannels(fill);
  if (!channels) {
    return canvasColor("var(--cifra-brand-contrast)");
  }
  const [red, green, blue] = channels;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? canvasColor("var(--cifra-ink)") : canvasColor("var(--cifra-brand-contrast)");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
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
    const data: TreemapNodeData[] = treemap.buckets.map((bucket) => {
      const groupColor = bucketBlue(bucket.bucket);
      return {
        name: bucketLabel(bucket.bucket),
        value: bucket.monto,
        pctTotal: bucket.pctTotal,
        deltaMomPct: bucket.deltaMomPct,
        itemStyle: { color: groupColor },
        label: { color: labelOn(groupColor) },
        upperLabel: { color: labelOn(groupColor) },
        children: bucket.leaves.map((leaf: OpexTreemapLeaf, index: number) => {
          const color = leafBlue(bucket.bucket, index, bucket.leaves.length);
          return {
            name: leaf.esOtrosMenores
              ? t("resultados.opex.treemap.otrosMenores")
              : cleanOpexCuentaNombre(leaf.nombreCuenta),
            value: leaf.monto,
            pctTotal: leaf.pctTotal,
            deltaMomPct: leaf.deltaMomPct,
            ...(leaf.idCuenta ? { idCuenta: leaf.idCuenta } : {}),
            ...(leaf.esOtrosMenores ? { esOtrosMenores: true } : {}),
            itemStyle: { color },
            label: { color: labelOn(color) },
          };
        }),
      };
    });

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
          const name = typeof node?.name === "string" ? node.name : typeof item?.name === "string" ? item.name : null;
          if (!node || !name) {
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
            `<strong>${escapeHtml(name)}</strong>`,
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
            fontSize: 13,
            fontWeight: "bold",
            lineHeight: 16,
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
            height: 26,
            fontSize: 13,
            fontWeight: "bold",
            backgroundColor: "transparent",
          },
          itemStyle: {
            borderColor: canvasColor(CHART.card),
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
          <h2 className="font-sans text-xl font-bold text-foreground">{t("resultados.opex.treemap.title")}</h2>
          <FavoriteStarButton widgetId="chart-gasto-treemap" label={t("resultados.opex.treemap.title")} />
          <InfoDialog
            title={t("resultados.opex.treemap.title")}
            body={t("resultados.opex.treemap.helpTooltip")}
            ariaLabel={t("resultados.opex.treemap.title")}
            icon={HelpCircle}
            triggerClassName="p-0 text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground"
          />
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
