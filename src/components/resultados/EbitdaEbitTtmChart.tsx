"use client";

import { InsightText } from "@/components/insight-text";
import { useLocale } from "@/context/LocaleContext";
import { monthLabelKey } from "@/i18n/format";
import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import type { EbitdaTtmPoint } from "@/services/estadoOperativoTtm";
import { formatCompactAxis, formatMxn } from "@/services/money";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * EBITDA vs EBIT — barras agrupadas TTM (tab Estado Operativo, arriba de la
 * tabla del ER). Misma fuente canónica que la tabla (`computeErBuckets`), así
 * que el mes seleccionado en el filtro cuadra con el renglón EBIT/EBITDA.
 *
 * Colores: EBITDA pizarra `#334155`, EBIT terracota `#C25E38`.
 * Negativos se leen por el eje (barra hacia abajo), sin fill condicional.
 */

const COLOR_EBITDA = "#334155";
const COLOR_EBIT = "#C25E38";

type ChartRow = EbitdaTtmPoint & { mesLabel: string };

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
  fontSize: 13,
} as const;

function TtmTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  const { t } = useLocale();
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-medium text-foreground">{point.mesLabel}</p>
      <div className="mt-1 space-y-0.5 financial-nums">
        <p className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_EBITDA }} />
          EBITDA: <strong>{formatMxn(point.ebitda)}</strong>
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_EBIT }} />
          EBIT: <strong>{formatMxn(point.ebit)}</strong>
        </p>
        <p className="text-muted-foreground">
          {t("resultados.operativo.ttm.tooltipDa")}: {formatMxn(point.da)}
        </p>
        <p className="text-muted-foreground">
          {t("resultados.operativo.ttm.tooltipMargin")}:{" "}
          {point.margenEbitda == null ? t("resultados.opex.na") : `${point.margenEbitda.toFixed(1)}%`}
        </p>
      </div>
    </div>
  );
}

export function EbitdaEbitTtmChart({
  ttm,
  insightText,
}: {
  ttm: EbitdaTtmPoint[];
  /** Qué es el EBITDA de la serie. Si se omite, usa resultados.operativo.ttm.help. */
  insightText?: string;
}) {
  const { t } = useLocale();

  const data: ChartRow[] = ttm.map((point) => ({
    ...point,
    mesLabel: `${t(monthLabelKey(point.mes - 1)).slice(0, 3)}-${String(point.anio).slice(-2)}`,
  }));

  if (data.every((point) => !point.hasData)) {
    return null;
  }

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="font-serif text-xl font-medium text-foreground">{t("resultados.operativo.ttm.title")}</h3>
      <InsightText text={insightText ?? t("resultados.operativo.ttm.help")} />
      <div className="mt-4 h-[320px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="22%" barGap={3} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={CHART_AXIS.stroke} vertical={false} />
            <XAxis
              dataKey="mesLabel"
              interval={0}
              tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
              axisLine={{ stroke: CHART_AXIS.stroke }}
              tickLine={false}
            />
            <YAxis
              width={64}
              tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatCompactAxis(value)}
            />
            <Tooltip cursor={{ fill: "rgb(196 93 62 / 0.06)" }} content={<TtmTooltip />} />
            <Legend
              formatter={(value: string) =>
                value === "ebitda" ? t("resultados.operativo.ttm.seriesEbitda") : t("resultados.operativo.ttm.seriesEbit")
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar dataKey="ebitda" fill={COLOR_EBITDA} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="ebit" fill={COLOR_EBIT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
