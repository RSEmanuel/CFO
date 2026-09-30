"use client";

import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { formatMxn, round2 } from "@/services/money";
import {
  baselineDerived,
  type SimulationResult,
  type SimulatorBaseline,
} from "@/services/simulatorEngine";
import { useMemo } from "react";

function DeltaPill({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value == null) {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">N/D</span>;
  }
  const sign = value > 0 ? "+" : "";
  return (
    <span
      className={cn(
        "financial-nums rounded-full px-2 py-0.5 text-[11px] font-medium",
        value > 0 && "bg-emerald-50 text-emerald-700",
        value < 0 && "bg-red-50 text-red-700",
        value === 0 && "bg-muted text-muted-foreground",
      )}
    >
      {`${sign}${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix ?? ""}`}
    </span>
  );
}

function CompareCard({
  title,
  base,
  sim,
  format,
  delta,
  footnote,
}: {
  title: string;
  base: number | null;
  sim: number | null;
  format: (value: number) => string;
  delta?: React.ReactNode;
  footnote?: string | null;
}) {
  const { t } = useLocale();
  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="financial-nums mt-3 text-2xl font-semibold tracking-tight text-foreground">
        {sim != null ? format(sim) : "N/D"}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {t("simulator.cards.base")}: <span className="financial-nums">{base != null ? format(base) : "N/D"}</span>
        </span>
        {delta}
      </div>
      {footnote ? <p className="mt-2 text-[11px] text-muted-foreground">{footnote}</p> : null}
    </article>
  );
}

function pctDelta(sim: number, base: number): number | null {
  return Math.abs(base) > 0.005 ? round2(((sim - base) / Math.abs(base)) * 100) : null;
}

export function SimulatorCards({
  baseline,
  sim,
}: {
  baseline: SimulatorBaseline;
  sim: SimulationResult;
}) {
  const { t } = useLocale();
  const base = useMemo(() => baselineDerived(baseline), [baseline]);

  const deltaIngresos = round2(sim.ingresos - baseline.ventas);
  const deltaEbitdaMargin =
    sim.margenEbitdaPct != null && base.margenEbitdaPct != null
      ? round2(sim.margenEbitdaPct - base.margenEbitdaPct)
      : null;
  const deltaNeta = round2(sim.utilidadNeta - baseline.utilidadNeta);

  const cashBadge =
    sim.deltaCaja > 0.005 ? (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
        {t("simulator.cards.cashReleased")}
      </span>
    ) : sim.deltaCaja < -0.005 ? (
      <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
        {t("simulator.cards.cashRequired")}
      </span>
    ) : (
      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
        {t("simulator.cards.noImpact")}
      </span>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CompareCard
          title={t("simulator.cards.revenue")}
          base={baseline.ventas}
          sim={sim.ingresos}
          format={formatMxn}
          delta={
            <>
              <DeltaPill value={pctDelta(sim.ingresos, baseline.ventas)} suffix="%" />
              <span className="financial-nums text-[11px] text-muted-foreground">
                {`${deltaIngresos >= 0 ? "+" : ""}${formatMxn(deltaIngresos)}`}
              </span>
            </>
          }
        />
        <CompareCard
          title={t("simulator.cards.ebitda")}
          base={baseline.ebitda}
          sim={sim.ebitda}
          format={formatMxn}
          delta={<DeltaPill value={deltaEbitdaMargin} suffix={` ${t("simulator.units.pp")}`} />}
          footnote={t("simulator.cards.ebitdaMarginNote")}
        />
        <CompareCard
          title={t("simulator.cards.netIncome")}
          base={baseline.utilidadNeta}
          sim={sim.utilidadNeta}
          format={formatMxn}
          delta={
            <>
              <DeltaPill value={pctDelta(sim.utilidadNeta, baseline.utilidadNeta)} suffix="%" />
              <span className="financial-nums text-[11px] text-muted-foreground">
                {`${deltaNeta >= 0 ? "+" : ""}${formatMxn(deltaNeta)}`}
              </span>
            </>
          }
          footnote={
            baseline.tasaEfectiva <= 0.0001
              ? t("simulator.cards.taxFallbackNote")
              : null
          }
        />

        <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("simulator.cards.cashImpact")}
            </p>
            {cashBadge}
          </div>
          <p
            className={cn(
              "financial-nums mt-3 text-2xl font-semibold tracking-tight",
              sim.deltaCaja > 0.005 && "text-emerald-700",
              sim.deltaCaja < -0.005 && "text-red-700",
              Math.abs(sim.deltaCaja) <= 0.005 && "text-foreground",
            )}
          >
            {`${sim.deltaCaja > 0 ? "+" : ""}${formatMxn(sim.deltaCaja)}`}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("simulator.cards.cashBreakdown", {
              ebitda: `${sim.deltaEbitda >= 0 ? "+" : ""}${formatMxn(sim.deltaEbitda)}`,
              nwc: `${sim.deltaNwc >= 0 ? "+" : ""}${formatMxn(sim.deltaNwc)}`,
            })}
          </p>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CompareCard
          title={t("simulator.cards.ccc")}
          base={baseline.ccc}
          sim={sim.ccc}
          format={(value) => `${value.toFixed(1)} ${t("simulator.units.days")}`}
          delta={<DeltaPill value={round2(sim.ccc - baseline.ccc)} suffix={` ${t("simulator.units.days")}`} />}
          footnote={t("simulator.cards.cccNote", {
            dso: sim.dso.toFixed(1),
            dio: sim.dio.toFixed(1),
            dpo: sim.dpo.toFixed(1),
          })}
        />
        <CompareCard
          title={t("simulator.cards.runway")}
          base={base.cashRunwayMeses}
          sim={sim.cashRunwayMeses}
          format={(value) => `${value.toFixed(1)} ${t("simulator.units.months")}`}
          delta={
            sim.cashRunwayMeses != null && base.cashRunwayMeses != null ? (
              <DeltaPill
                value={round2(sim.cashRunwayMeses - base.cashRunwayMeses)}
                suffix={` ${t("simulator.units.months")}`}
              />
            ) : null
          }
          footnote={t("simulator.cards.runwayNote")}
        />
      </div>
    </div>
  );
}
