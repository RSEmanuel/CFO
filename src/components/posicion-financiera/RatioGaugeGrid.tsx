"use client";

import { InsightText } from "@/components/insight-text";
import { useLocale } from "@/context/LocaleContext";
import { CHART_VARS } from "@/lib/chart-theme";
import {
  extractRatioGaugeValues,
  ratioGaugeBands,
  ratioGaugeScaleMax,
  ratioGaugeZone,
  type RatioGaugeId,
  type RatioGaugeZone,
} from "@/lib/posicion-financiera/ratioGaugeZones";
import { formatStatementRatio, type StatementNode } from "@/services/posicionFinanciera";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ZONE_WASH: Record<RatioGaugeZone, string> = {
  red: "rgba(239, 68, 68, 0.18)",
  yellow: "rgba(245, 158, 11, 0.18)",
  green: "rgba(16, 185, 129, 0.18)",
};

const ZONE_FILL: Record<RatioGaugeZone, string> = {
  red: "#EF4444",
  yellow: "#F59E0B",
  green: "#10B981",
};

const GAUGE_IDS: RatioGaugeId[] = ["currentRatio", "operatingMargin", "roe", "dso"];

const GAUGE_FORMAT: Record<RatioGaugeId, "x" | "pct" | "days"> = {
  currentRatio: "x",
  operatingMargin: "pct",
  roe: "pct",
  dso: "days",
};

function BulletTooltip({
  active,
  label,
  formatted,
  zoneLabel,
}: {
  active?: boolean;
  label: string;
  formatted: string;
  zoneLabel: string;
}) {
  if (!active) {
    return null;
  }
  return (
    <div className="rounded-control border border-border bg-card px-3 py-2 text-sm shadow-[var(--shadow-card)]">
      <p className="text-muted-foreground">{label}</p>
      <p className="financial-nums mt-0.5 font-medium text-foreground">{formatted}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{zoneLabel}</p>
    </div>
  );
}

function RatioBullet({
  id,
  value,
  title,
}: {
  id: RatioGaugeId;
  value: number | null;
  title: string;
}) {
  const { t } = useLocale();
  const scaleMax = ratioGaugeScaleMax(id, value);
  const bands = ratioGaugeBands(id, scaleMax);
  const zone = value == null ? null : ratioGaugeZone(id, value);
  const formatted = formatStatementRatio(value, GAUGE_FORMAT[id]);
  const marker = value == null ? 0 : Math.min(Math.max(value, 0), scaleMax);
  const data = [{ name: title, value: marker }];
  const zoneLabel =
    zone == null ? t("posicionFinanciera.gauges.na") : t(`posicionFinanciera.gauges.zones.${zone}`);

  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-base font-medium tracking-tight text-foreground">{title}</h3>
          <InsightText text={t(`posicionFinanciera.gauges.insights.${id}`)} />
        </div>
        <p className="financial-nums text-lg font-semibold tabular-nums text-foreground">{formatted}</p>
      </div>
      {value == null ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("posicionFinanciera.gauges.na")}</p>
      ) : (
        <div className="mt-3 h-[72px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 8 }} barCategoryGap="35%">
              <XAxis
                type="number"
                domain={[0, scaleMax]}
                tick={{ fill: CHART_VARS.mute, fontSize: 10 }}
                axisLine={{ stroke: CHART_VARS.axis }}
                tickLine={false}
                className="financial-nums"
              />
              <YAxis type="category" dataKey="name" hide />
              {bands.map((band) => (
                <ReferenceArea
                  key={`${id}-${band.zone}-${band.from}`}
                  x1={band.from}
                  x2={band.to}
                  fill={ZONE_WASH[band.zone]}
                  fillOpacity={1}
                  ifOverflow="visible"
                />
              ))}
              <Bar dataKey="value" fill={zone ? ZONE_FILL[zone] : CHART_VARS.mute} barSize={8} radius={[999, 999, 999, 999]} maxBarSize={10} />
              <Tooltip
                cursor={false}
                content={
                  <BulletTooltip
                    label={title}
                    formatted={formatted}
                    zoneLabel={zoneLabel}
                  />
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t(`posicionFinanciera.gauges.hints.${id}`)}
        {zone ? ` · ${zoneLabel}` : ""}
      </p>
    </article>
  );
}

type RatioGaugeGridProps = {
  nodes: StatementNode[];
  yearKey: string;
  loading?: boolean;
  empty?: boolean;
};

export function RatioGaugeGrid({ nodes, yearKey, loading, empty }: RatioGaugeGridProps) {
  const { t } = useLocale();
  const values = useMemo(() => extractRatioGaugeValues(nodes, yearKey), [nodes, yearKey]);

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-clay">
          {t("posicionFinanciera.gauges.eyebrow")}
        </p>
        <h2 className="mt-1 font-serif text-xl font-medium tracking-tight text-foreground">
          {t("posicionFinanciera.gauges.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("posicionFinanciera.gauges.help")}</p>
      </div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GAUGE_IDS.map((id) => (
            <div key={id} className="h-36 animate-pulse rounded-card bg-muted" />
          ))}
        </div>
      ) : empty ? (
        <p className="rounded-card border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          {t("posicionFinanciera.gauges.empty")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GAUGE_IDS.map((id) => (
            <RatioBullet
              key={id}
              id={id}
              value={values[id]}
              title={t(`posicionFinanciera.gauges.metrics.${id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
