"use client";

import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { periodLabel } from "@/services/financialDataTransformer";
import {
  buildFlujosPorActividad,
  type FlujoActividadFamily,
  type FlujoMensual,
} from "@/services/flujoTransformer";
import { formatAxisTick, type DisplayUnits } from "@/services/money";
import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

function signedTick(value: number, units: DisplayUnits): string {
  const tick = formatAxisTick(Math.abs(value), units);
  if (value > 0) {
    return `+${tick}`;
  }
  if (value < 0) {
    return `-${tick}`;
  }
  return tick;
}

function DeltaRow({ label, delta, units }: { label: string; delta: number | null; units: DisplayUnits }) {
  if (delta == null) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="financial-nums text-foreground">—</span>
      </div>
    );
  }
  const favorable = delta > 0;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span
          className={cn("inline-block h-2 w-2 shrink-0 rounded-full", favorable ? "" : "bg-desfavorable")}
          style={favorable ? { backgroundColor: "#4F6F52" } : undefined}
          aria-hidden
        />
        {label}
      </span>
      <span className="financial-nums text-foreground">{signedTick(delta, units)}</span>
    </div>
  );
}

function ActividadCard({ family, periodo, units }: { family: FlujoActividadFamily; periodo: string; units: DisplayUnits }) {
  const { t } = useLocale();
  const familyTitle = family.titleKey ? t(family.titleKey) : family.title;
  const insight =
    family.vsMesAnterior == null
      ? null
      : t("flujo.flowChange", {
          activity: familyTitle.toLowerCase(),
          verb: t(family.vsMesAnterior > 0 ? "flujo.increased" : "flujo.decreased"),
          value: formatAxisTick(Math.abs(family.vsMesAnterior), units),
        });

  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <h3 className="font-serif text-lg font-medium text-foreground">{familyTitle}</h3>
      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 lg:w-[65%]">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={family.points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
                  axisLine={{ stroke: CHART_AXIS.stroke }}
                  tickLine={false}
                />
                <YAxis
                  width={64}
                  tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => formatAxisTick(value, units)}
                />
                <Tooltip
                  cursor={{ fill: "rgb(196 93 62 / 0.06)" }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [formatAxisTick(Number(value), units), familyTitle]}
                />
                <Bar dataKey="value" name={familyTitle} maxBarSize={28} radius={[4, 4, 0, 0]}>
                  {family.points.map((point) => (
                    <Cell key={point.periodo} fill={point.value >= 0 ? CHART.clay : CHART.coral} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {insight ? <p className="mt-3 text-[13px] text-muted-foreground">{insight}</p> : null}
        </div>

        <aside className="min-w-0 lg:w-[35%]">
          <h3 className="font-serif text-base font-medium text-foreground">{t("flujo.explanation")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{family.descriptionKey ? t(family.descriptionKey) : family.description}</p>
          <dl className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">
                {t("flujo.currentPeriod", { period: family.points[family.points.length - 1]?.label ?? periodLabel(periodo) })}
              </dt>
              <dd className="financial-nums text-foreground">{formatAxisTick(family.actual, units)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{t("resultados.range")}</dt>
              <dd className="financial-nums text-foreground">
                {formatAxisTick(family.rango.min, units)} – {formatAxisTick(family.rango.max, units)}
              </dd>
            </div>
            <DeltaRow label={t("flujo.vsPreviousMonth")} delta={family.vsMesAnterior} units={units} />
            <DeltaRow label={t("flujo.vsPreviousYear")} delta={family.vsMesAnioAnterior} units={units} />
          </dl>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("flujo.components")}</p>
          <ul className="mt-2 space-y-1.5">
            {family.componentes.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{item.labelKey ? t(item.labelKey) : item.label}</span>
                <span className="financial-nums text-foreground">{formatAxisTick(item.amount, units)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </article>
  );
}

export function FlujoActividadesView({
  periodo, units, rows,
}: { periodo: string; units: DisplayUnits; rows: FlujoMensual[] }) {
  const families = useMemo(() => buildFlujosPorActividad(rows, periodo), [rows, periodo]);

  return (
    <div className="space-y-4">
      {families.map((family) => (
        <ActividadCard key={family.key} family={family} periodo={periodo} units={units} />
      ))}
    </div>
  );
}
