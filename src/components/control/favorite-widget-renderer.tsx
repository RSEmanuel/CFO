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
import { CogsDesgloseCard } from "@/components/resultados/CogsDesgloseCard";
import { DestacadosRubroCard } from "@/components/resultados/DestacadosRubroCard";
import { GastoOpexTreemapCard } from "@/components/resultados/GastoOpexTreemap";
import { ResultadosTop5Card } from "@/components/resultados/ResultadosTop5Charts";
import { ResultadosWaterfallChart } from "@/components/resultados/ResultadosWaterfallChart";
import { INITIAL_RESULTADOS_FILTERS } from "@/components/resultados/resultados-filter-bar";
import { useLocale } from "@/context/LocaleContext";
import { usePosicionFinanciera } from "@/hooks/use-posicion-financiera";
import type { FavoritableWidget } from "@/services/favoritesRegistry";
import type {
  DestacadosKpis,
  DestacadosRubro,
  MonthlyFinancials,
} from "@/services/financialDataTransformer";
import type { DisplayUnits } from "@/services/money";
import { yearColumns } from "@/services/posicionFinanciera";
import { useMemo, type ReactNode } from "react";

/** Datos globales que el Panel de Control hereda de sus filtros (periodo/unidades). */
export type ControlWidgetContext = {
  periodo: string;
  units: DisplayUnits;
  rows: MonthlyFinancials[];
  kpis: DestacadosKpis;
};

type PosicionStatementKey = "posicion" | "resultados" | "razones";

const POSICION_FAVORITE_IDS: Record<PosicionStatementKey, string> = {
  posicion: "table-posicion-balance",
  resultados: "table-posicion-resultados",
  razones: "table-posicion-razones",
};

/** Estado financiero auto-fetch (año de corte resuelto por la API). */
function PosicionStatementFavorite({ statement }: { statement: PosicionStatementKey }) {
  const { t } = useLocale();
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
        ? data?.statements.resultados ?? []
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
    case "tendenciaIngresosCostos":
      return <TendenciaIngresosCostosChart rows={context.rows} units={context.units} endPeriod={context.periodo} />;
    case "top5Clientes":
      return <ResultadosTop5Card kind="clientes" periodo={context.periodo} units={context.units} />;
    case "top5Lineas":
      return <ResultadosTop5Card kind="lineas" periodo={context.periodo} units={context.units} />;
    case "cogsDesglose":
      return <CogsDesgloseCard periodo={context.periodo} units={context.units} />;
    case "gastoTreemap":
      return context.periodo ? <GastoOpexTreemapCard periodo={context.periodo} /> : null;
    case "resultadosWaterfall":
      return (
        <ResultadosWaterfallChart
          filters={{
            ...INITIAL_RESULTADOS_FILTERS,
            periodo: context.periodo,
            units: context.units,
          }}
          rows={context.rows}
        />
      );
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
