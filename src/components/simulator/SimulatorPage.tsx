"use client";

import { DataEmptyState } from "@/components/data-empty-state";
import {
  INITIAL_RESULTADOS_FILTERS,
  ResultadosFilterBar,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { SimulatorCards } from "@/components/simulator/SimulatorCards";
import { SimulatorCharts } from "@/components/simulator/SimulatorCharts";
import { SimulatorDriversPanel } from "@/components/simulator/SimulatorDriversPanel";
import {
  downloadScenarioPdf,
  downloadScenarioXlsx,
  type ScenarioRow,
  type ScenarioRowKind,
} from "@/components/simulator/simulatorExport";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { useSimulatorBaseline } from "@/hooks/use-simulator-baseline";
import { formatMxn, type DisplayUnits } from "@/services/money";
import type { SimulatorBaselinePayload } from "@/services/simulatorBaselineService";
import {
  baselineDerived,
  simulate,
  ZERO_DELTAS,
  type SimulationResult,
  type SimulatorBaseline,
  type SimulatorDeltas,
  type SimulatorDriverKey,
} from "@/services/simulatorEngine";
import { useEffect, useMemo, useState } from "react";

function buildDriverRows(t: (key: string) => string, deltas: SimulatorDeltas): Array<[string, string]> {
  const daysLabel = t("simulator.units.days");
  const format = (key: SimulatorDriverKey): string => {
    const value = deltas[key];
    const sign = value > 0 ? "+" : "";
    if (key === "dsoDias" || key === "dpoDias") {
      return `${sign}${value.toFixed(0)} ${daysLabel}`;
    }
    if (key === "tasaInteresDeltaPp") {
      return `${sign}${value.toFixed(2)} pp`;
    }
    return `${sign}${value.toFixed(1)}%`;
  };
  return (Object.keys(deltas) as SimulatorDriverKey[]).map((key) => [
    t(`simulator.drivers.${key}`),
    format(key),
  ]);
}

function moneyRow(concept: string, base: number, sim: number): ScenarioRow {
  return { concept, base, sim, delta: sim - base, kind: "money" };
}

function deltaRow(concept: string, delta: number): ScenarioRow {
  return { concept, base: null, sim: null, delta, kind: "money" };
}

function buildPnlRows(
  t: (key: string) => string,
  baseline: SimulatorBaseline,
  sim: SimulationResult,
): ScenarioRow[] {
  const utilidadBrutaBase = baseline.ventas - baseline.cogs;
  return [
    moneyRow(t("simulator.export.rows.revenue"), baseline.ventas, sim.ingresos),
    moneyRow(t("simulator.export.rows.cogs"), baseline.cogs, sim.cogs),
    moneyRow(t("simulator.export.rows.grossProfit"), utilidadBrutaBase, sim.utilidadBruta),
    moneyRow(t("simulator.export.rows.opex"), baseline.opex, sim.opex),
    moneyRow(t("simulator.export.rows.ebitda"), baseline.ebitda, sim.ebitda),
    moneyRow(t("simulator.export.rows.financialIncome"), baseline.productosFinancieros, sim.productosFinancieros),
    moneyRow(t("simulator.export.rows.financialExpense"), baseline.gastosFinancieros, sim.gastosFinancieros),
    moneyRow(t("simulator.export.rows.rif"), baseline.rif, sim.rif),
    moneyRow(t("simulator.export.rows.ebt"), baseline.ebt, sim.ebt),
    moneyRow(t("simulator.export.rows.taxes"), baseline.impuestos, sim.impuestos),
    moneyRow(t("simulator.export.rows.netIncome"), baseline.utilidadNeta, sim.utilidadNeta),
  ];
}

function buildCashRows(
  t: (key: string) => string,
  baseline: SimulatorBaseline,
  sim: SimulationResult,
): ScenarioRow[] {
  const base = baselineDerived(baseline);
  const daysRow = (concept: string, baseValue: number, simValue: number): ScenarioRow => ({
    concept,
    base: baseValue,
    sim: simValue,
    delta: simValue - baseValue,
    kind: "days",
  });
  return [
    daysRow(t("simulator.export.rows.dso"), baseline.dso, sim.dso),
    daysRow(t("simulator.export.rows.dio"), baseline.dio, sim.dio),
    daysRow(t("simulator.export.rows.dpo"), baseline.dpo, sim.dpo),
    daysRow(t("simulator.export.rows.ccc"), baseline.ccc, sim.ccc),
    deltaRow(t("simulator.export.rows.deltaCxc"), sim.deltaCxc),
    deltaRow(t("simulator.export.rows.deltaCxp"), sim.deltaCxp),
    deltaRow(t("simulator.export.rows.deltaNwc"), sim.deltaNwc),
    deltaRow(t("simulator.export.rows.deltaEbitda"), sim.deltaEbitda),
    deltaRow(t("simulator.export.rows.deltaCash"), sim.deltaCaja),
    moneyRow(t("simulator.export.rows.cash"), baseline.caja, sim.caja),
    { concept: t("simulator.export.rows.burn"), base: baseline.salidasOperativas, sim: sim.burnMensual, delta: null, kind: "money" },
    { concept: t("simulator.export.rows.runway"), base: base.cashRunwayMeses, sim: sim.cashRunwayMeses, delta: null, kind: "months" },
  ];
}

function SimulatorBody({ baseline, units }: { baseline: SimulatorBaselinePayload; units: DisplayUnits }) {
  const { t } = useLocale();
  const { tenants } = useSession();
  const [deltas, setDeltas] = useState<SimulatorDeltas>(ZERO_DELTAS);

  const sim = useMemo(() => simulate(baseline, deltas), [baseline, deltas]);
  const tenantName = tenants.find((tenant) => tenant.id === baseline.tenantId)?.name ?? baseline.tenantId;

  const exportInput = () => {
    const daysLabel = t("simulator.units.days");
    const monthsLabel = t("simulator.units.months");
    const formatters: Record<ScenarioRowKind, (value: number | null) => string> = {
      money: (value) => (value == null ? "—" : formatMxn(value)),
      days: (value) => (value == null ? "—" : `${value.toFixed(1)} ${daysLabel}`),
      months: (value) => (value == null ? "—" : `${value.toFixed(1)} ${monthsLabel}`),
      pct: (value) => (value == null ? "—" : `${value.toFixed(1)}%`),
    };
    return {
      tenantName,
      periodoLabel: `${baseline.anio}-${String(baseline.periodo).padStart(2, "0")}`,
      generatedAt: new Date(),
      driverRows: buildDriverRows(t, sim.deltas),
      pnlRows: buildPnlRows(t, baseline, sim),
      cashRows: buildCashRows(t, baseline, sim),
      labels: {
        driversSheet: t("simulator.export.driversSheet"),
        pnlSheet: t("simulator.export.pnlSheet"),
        cashSheet: t("simulator.export.cashSheet"),
        driversTitle: t("simulator.export.driversTitle"),
        pnlTitle: t("simulator.export.pnlTitle"),
        cashTitle: t("simulator.export.cashTitle"),
        driver: t("simulator.export.driver"),
        appliedValue: t("simulator.export.appliedValue"),
        concept: t("simulator.export.concept"),
        base: t("simulator.chart.base"),
        simulated: t("simulator.chart.simulated"),
        delta: t("simulator.export.delta"),
        period: t("filters.period"),
        generated: t("simulator.export.generated"),
      },
      formatters,
    };
  };

  return (
    <div className="space-y-6">
      <SimulatorDriversPanel
        deltas={deltas}
        onChange={setDeltas}
        onReset={() => setDeltas(ZERO_DELTAS)}
        onExportXlsx={() => downloadScenarioXlsx(exportInput())}
        onExportPdf={() => downloadScenarioPdf(exportInput())}
      />

      <SimulatorCards baseline={baseline} sim={sim} />
      <SimulatorCharts baseline={baseline} sim={sim} units={units} />
    </div>
  );
}

export function SimulatorPage() {
  const { t } = useLocale();
  const { activePeriod, availablePeriods, selectPeriod } = useSession();
  const [filters, setFilters] = useState<ResultadosFilters>({
    ...INITIAL_RESULTADOS_FILTERS,
    periodo: "",
  });

  useEffect(() => {
    setFilters((current) => ({ ...current, periodo: activePeriod ?? "" }));
  }, [activePeriod]);

  const effectivePeriod = filters.periodo || availablePeriods.at(-1) || activePeriod || "";
  const { data, loading, error } = useSimulatorBaseline(effectivePeriod);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 bg-background">
      <header className="space-y-1">
        <p className="text-lg font-bold tracking-tight text-clay">{t("nav.simulator")}</p>
        <p className="text-sm text-muted-foreground">{t("simulator.subtitle")}</p>
      </header>

      <ResultadosFilterBar
        filters={filters}
        availablePeriods={availablePeriods}
        onChange={(next) => {
          setFilters(next);
          if (next.periodo && next.periodo !== filters.periodo) {
            selectPeriod(next.periodo);
          }
        }}
      />

      {error ? <DataEmptyState title={t("simulator.loadError")} message={error} /> : null}
      {!error && data ? <SimulatorBody key={data.periodoLabel} baseline={data} units={filters.units} /> : null}
    </div>
  );
}
