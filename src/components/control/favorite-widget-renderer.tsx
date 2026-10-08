"use client";

import { CobranzaAgingChart } from "@/components/cobranza/CobranzaAgingChart";
import { CobranzaCarteraKpiCard, type CobranzaCarteraKpiKey } from "@/components/cobranza/CobranzaCarteraSection";
import { ConcentracionParetoCard } from "@/components/cobranza/ConcentracionRiesgoSection";
import { TendenciaIngresosCostosChart } from "@/components/dashboard/TendenciaIngresosCostosChart";
import { FlujoEfectivoView } from "@/components/flujo/FlujoEfectivoView";
import {
  FlujoOperativoKpiCard,
  FlujoOperativoTableroCard,
  type FlujoOperativoKpiKey,
} from "@/components/flujo/FlujoOperativoView";
import { StatementTreeTable } from "@/components/posicion-financiera/StatementTreeTable";
import { CategoryTemporalKpiCard } from "@/components/resultados/CategoryTemporalKpiCard";
import { CategorySeriesCard, IncomeBreakdownCard } from "@/components/resultados/ResultadosCategoryView";
import { CogsAnalisisCard } from "@/components/resultados/CogsAnalisisCard";
import { CogsDesgloseCard } from "@/components/resultados/CogsDesgloseCard";
import { DestacadosRubroCard } from "@/components/resultados/DestacadosRubroCard";
import { EbitdaEbitTtmChart } from "@/components/resultados/EbitdaEbitTtmChart";
import { ErWaterfallChart } from "@/components/resultados/ErWaterfallChart";
import { resultadosMonthsSentence } from "@/components/resultados/resultados-months-sentence";
import { EstadoOperativoCard } from "@/components/resultados/EstadoOperativoCard";
import { GastoControlFavorite } from "@/components/resultados/GastoControlCard";
import { GastoOpexSeriesFavorite } from "@/components/resultados/GastoOpexView";
import { GastoOpexTreemapCard } from "@/components/resultados/GastoOpexTreemap";
import { IngresoMonitor } from "@/components/resultados/IngresoMonitor";
import { ResultadosPresupuestoView } from "@/components/resultados/ResultadosPresupuestoView";
import { ResultadosTop5Card } from "@/components/resultados/ResultadosTop5Charts";
import { useLocale } from "@/context/LocaleContext";
import { useBudgetProjection } from "@/hooks/use-budget-projection";
import { useEstadoOperativo } from "@/hooks/use-estado-operativo";
import { usePosicionFinanciera } from "@/hooks/use-posicion-financiera";
import {
  GASTO_CONTROL_FAVORITE_ID,
  parseCategoryTemporalFavoriteId,
  RESULTADOS_FAVORITE,
  type FavoritableWidget,
  type GastoControlKind,
} from "@/services/favoritesRegistry";
import { buildStackedSeries, type DestacadosKpis, type DestacadosRubro, type MonthlyFinancials } from "@/services/financialDataTransformer";
import { calculateTopKPIs, categoryTemporalCards } from "@/services/resultadosKpis";
import { buildUtilidadRubro, comparableShift, shiftPeriodo } from "@/services/utilidadRubro";
import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import type { DisplayUnits } from "@/services/money";
import { collapseToMayorAccounts, yearColumns } from "@/services/posicionFinanciera";
import { useMemo, type ReactNode } from "react";

/** Datos globales que el Panel de Control hereda de sus filtros (periodo/unidades). */
export type ControlWidgetContext = {
  periodo: string;
  units: DisplayUnits;
  rows: MonthlyFinancials[];
  kpis: DestacadosKpis;
  filters: ResultadosFilters;
};

type PosicionStatementKey = "posicion" | "resultados" | "razones";

const POSICION_FAVORITE_IDS: Record<PosicionStatementKey, string> = {
  posicion: "table-posicion-balance",
  resultados: "table-posicion-resultados",
  razones: "table-posicion-razones",
};

/** Estado financiero auto-fetch (año de corte resuelto por la API). */
function PosicionStatementFavorite({ statement }: { statement: PosicionStatementKey }) {
  const { t, locale } = useLocale();
  const { data, loading, error, refetch } = usePosicionFinanciera(null, null);
  const columns = useMemo(() => (data ? yearColumns(data.years) : []), [data]);
  const revenueBase = useMemo(() => {
    const tree = data?.statements.resultados ?? [];
    return tree.find((node) => node.id === "pyg:ingresos")?.values;
  }, [data]);

  if (error) {
    return null;
  }

  const nodes =
    statement === "posicion"
      ? data?.statements.posicion ?? []
      : statement === "resultados"
        ? collapseToMayorAccounts(data?.statements.resultados ?? [], (data?.years ?? []).map(String), (code) =>
            t("posicionFinanciera.mayorAccount", { code }),
          )
        : data?.statements.razones ?? [];

  return (
    <StatementTreeTable
      title={
        statement === "posicion"
          ? t("posicionFinanciera.titlePosition")
          : statement === "resultados"
            ? t("posicionFinanciera.titleResults")
            : t("posicionFinanciera.titleRatios")
      }
      titleHint={
        statement === "posicion"
          ? t("posicionFinanciera.positionHint")
          : statement === "resultados"
            ? t("posicionFinanciera.resultsHint")
            : t("posicionFinanciera.ratiosHint")
      }
      subtitle={statement === "resultados" ? resultadosMonthsSentence(data, t, locale) : undefined}
      nodes={nodes}
      columns={columns}
      numberMode={statement === "razones" ? "ratio" : "money"}
      showYoY
      showEmptyToggle={statement !== "razones"}
      verticalBase={statement === "resultados" ? revenueBase : undefined}
      loading={loading}
      empty={Boolean(data && !data.hasBalanza)}
      resetKey={`control-${statement}-${data?.year ?? ""}-${data?.period ?? ""}`}
      onRefresh={refetch}
      favoriteId={POSICION_FAVORITE_IDS[statement]}
    />
  );
}

/**
 * Renderizado dinámico por componentKey: cada widget fijado reutiliza el
 * componente real de su módulo (misma lógica de cálculo, sin duplicarla).
 */
export function FavoriteWidgetRenderer({
  widget,
  context,
}: {
  widget: FavoritableWidget;
  context: ControlWidgetContext;
}): ReactNode {
  switch (widget.componentKey) {
    case "destacadosRubro": {
      const key = widget.id.slice("destacados:".length) as DestacadosRubro["key"];
      const rubro = context.kpis.rubros.find((item) => item.key === key);
      return rubro ? (
        <DestacadosRubroCard rubro={rubro} units={context.units} contextLabel={context.kpis.contextLabel} />
      ) : null;
    }
    case "destacadosUtilidad":
      return <UtilidadFavorite context={context} />;
    case "categoryTemporalKpi":
      return <CategoryTemporalFavorite id={widget.id} context={context} />;
    case "gastoControlKpi": {
      const kind = (Object.entries(GASTO_CONTROL_FAVORITE_ID) as Array<[GastoControlKind, string]>).find(
        ([, id]) => id === widget.id,
      )?.[0];
      return kind ? <GastoControlFavorite kind={kind} periodo={context.periodo} /> : null;
    }
    case "tendenciaIngresosCostos":
      return <TendenciaIngresosCostosChart rows={context.rows} units={context.units} endPeriod={context.periodo} />;
    case "categorySeries":
      return widget.id === RESULTADOS_FAVORITE.serieCosto ? (
        <CategorySeriesFavorite category="Costo" context={context} />
      ) : (
        <CategorySeriesFavorite category="Ingreso" context={context} />
      );
    case "gastoSeries":
      return (
        <GastoOpexSeriesFavorite
          periodo={context.periodo}
          units={context.units}
          comparable={context.filters.comparable}
          rows={context.rows}
        />
      );
    case "incomeBreakdown":
      return <IncomeBreakdownFavorite context={context} />;
    case "ingresoCalidad":
      return <IngresoMonitor periodo={context.periodo} part="calidad" />;
    case "ingresoPacing":
      return <IngresoMonitor periodo={context.periodo} part="pacing" />;
    case "ingresoTabla":
      return <IngresoMonitor periodo={context.periodo} part="tabla" />;
    case "cogsAnalisis":
      return <CogsAnalisisCard periodo={context.periodo} />;
    case "erWaterfall":
      return <ErWaterfallFavorite periodo={context.periodo} />;
    case "ebitdaEbitTtm":
      return <EbitdaTtmFavorite periodo={context.periodo} />;
    case "estadoOperativo":
      return <EstadoOperativoCard periodo={context.periodo} />;
    case "presupuesto":
      return <PresupuestoFavorite filters={context.filters} />;
    case "top5Clientes":
      return <ResultadosTop5Card kind="clientes" periodo={context.periodo} units={context.units} />;
    case "top5Lineas":
      return <ResultadosTop5Card kind="lineas" periodo={context.periodo} units={context.units} />;
    case "cogsDesglose":
      return <CogsDesgloseCard periodo={context.periodo} units={context.units} />;
    case "gastoTreemap":
      return context.periodo ? <GastoOpexTreemapCard periodo={context.periodo} /> : null;
    case "flujoOperativoKpi": {
      const kpi = widget.id.slice("kpi-flujo-".length) as FlujoOperativoKpiKey;
      return <FlujoOperativoKpiCard kpi={kpi} periodo={context.periodo} />;
    }
    case "flujoSankey":
      return <FlujoEfectivoView periodo={context.periodo} units={context.units} />;
    case "flujoTableroDiario":
      return <FlujoOperativoTableroCard periodo={context.periodo} units={context.units} />;
    case "cobranzaCarteraKpi":
    case "cobranzaPlazoKpi": {
      const kpi = widget.id.slice("kpi-cobranza-".length) as CobranzaCarteraKpiKey;
      return <CobranzaCarteraKpiCard kpi={kpi} />;
    }
    case "cobranzaAging":
      return <CobranzaAgingChart />;
    case "cobranzaPareto":
      return <ConcentracionParetoCard />;
    case "posicionStatement": {
      const statement: PosicionStatementKey =
        widget.id === "table-posicion-balance"
          ? "posicion"
          : widget.id === "table-posicion-razones"
            ? "razones"
            : "resultados";
      return <PosicionStatementFavorite statement={statement} />;
    }
    default:
      return null;
  }
}

function UtilidadFavorite({ context }: { context: ControlWidgetContext }) {
  const priorShift = comparableShift(context.kpis.contextLabel);
  const priorPeriod = priorShift == null ? context.periodo : shiftPeriodo(context.periodo, priorShift);
  const { data: estadoActual } = useEstadoOperativo(context.periodo);
  const { data: estadoPrior } = useEstadoOperativo(priorPeriod);
  const rubro = buildUtilidadRubro(estadoActual, estadoPrior, context.kpis.contextLabel);
  return <DestacadosRubroCard rubro={rubro} units={context.units} contextLabel={context.kpis.contextLabel} />;
}

function CategoryTemporalFavorite({ id, context }: { id: string; context: ControlWidgetContext }) {
  const { t, locale } = useLocale();
  const parsed = parseCategoryTemporalFavoriteId(id);
  if (!parsed || !context.periodo) return null;
  const top = calculateTopKPIs(context.rows, parsed.category, context.periodo);
  const card = categoryTemporalCards(top, context.periodo, parsed.category, t, locale).find(
    (item) => item.key === parsed.key,
  );
  return card ? <CategoryTemporalKpiCard card={card} category={parsed.category} /> : null;
}

function CategorySeriesFavorite({
  category,
  context,
}: {
  category: "Ingreso" | "Costo";
  context: ControlWidgetContext;
}) {
  const series = useMemo(
    () => buildStackedSeries(context.rows, context.filters, category),
    [category, context.filters, context.rows],
  );
  return (
    <CategorySeriesCard
      category={category}
      units={context.units}
      temporalidad={context.filters.temporalidad}
      comparable={context.filters.comparable}
      chartData={series.chartData}
      seriesKeys={series.seriesKeys}
      headlineLabel={series.headlineLabel}
      headlineTotal={series.headlineTotal}
      comparableLabel={series.comparableLabel}
      comparableTotal={series.comparableTotal}
    />
  );
}

function IncomeBreakdownFavorite({ context }: { context: ControlWidgetContext }) {
  const series = useMemo(
    () => buildStackedSeries(context.rows, context.filters, "Ingreso"),
    [context.filters, context.rows],
  );
  return (
    <IncomeBreakdownCard
      rows={context.rows}
      periodo={context.periodo}
      temporalidad={context.filters.temporalidad}
      units={context.units}
      comparable={context.filters.comparable}
      headlineLabel={series.headlineLabel}
    />
  );
}

function ErWaterfallFavorite({ periodo }: { periodo: string }) {
  const yearFromPeriod = periodo ? Number(periodo.slice(0, 4)) : null;
  const year = Number.isInteger(yearFromPeriod) && (yearFromPeriod ?? 0) > 2000 ? yearFromPeriod : null;
  const { data, loading } = usePosicionFinanciera(year, null);
  return (
    <ErWaterfallChart
      nodes={data?.statements.resultados ?? []}
      yearKey={String(data?.year ?? year ?? "")}
      loading={loading}
      empty={Boolean(data && !data.hasBalanza)}
    />
  );
}

function EbitdaTtmFavorite({ periodo }: { periodo: string }) {
  const { data, loading } = useEstadoOperativo(periodo);
  if (loading || !data) {
    return <div className="h-72 animate-pulse rounded-card bg-secondary" />;
  }
  return <EbitdaEbitTtmChart ttm={data.ttm} />;
}

function PresupuestoFavorite({ filters }: { filters: ResultadosFilters }) {
  const { data, loading, error, refetch } = useBudgetProjection(filters.periodo);
  return (
    <ResultadosPresupuestoView
      filters={filters}
      data={data}
      loading={loading}
      error={error}
      onDriversSaved={refetch}
    />
  );
}
