"use client";

import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { CustomizeViewMenu } from "@/components/dashboard/CustomizeViewMenu";
import { TendenciaIngresosCostosChart } from "@/components/dashboard/TendenciaIngresosCostosChart";
import { CogsDesgloseCard } from "@/components/resultados/CogsDesgloseCard";
import { DestacadosRubroCard, rubroTitleKey } from "@/components/resultados/DestacadosRubroCard";
import { ResultadosTop5Charts } from "@/components/resultados/ResultadosTop5Charts";
import { ResultadosWaterfallChart } from "@/components/resultados/ResultadosWaterfallChart";
import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import { Button } from "@/components/ui/button";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { useDashboardWidgets } from "@/hooks/use-dashboard-widgets";
import { getDestacadosKpis, type DestacadosRubro, type MonthlyFinancials } from "@/services/financialDataTransformer";
import { downloadPaqueteDelMesPdf } from "@/services/resultadosPaquetePdf";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ResultadosDestacadosViewProps = {
  filters: ResultadosFilters;
  rows: MonthlyFinancials[];
};

export function ResultadosDestacadosView({ filters, rows }: ResultadosDestacadosViewProps) {
  const { t, locale, formatDate } = useLocale();
  const { tenantId, tenants, user } = useSession();
  const [pending, setPending] = useState(false);
  const { widgets, setWidget } = useDashboardWidgets();
  const kpis = useMemo(() => getDestacadosKpis(rows, filters), [rows, filters]);
  const rubroTitle = (key: DestacadosRubro["key"]) => t(rubroTitleKey(key));
  const empresa =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  const downloadPack = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    const startedAt = Date.now();
    try {
      downloadPaqueteDelMesPdf({
        empresa,
        periodo: filters.periodo,
        generatedAt: new Date(),
        locale,
        labels: {
          brand: t("pdf.brand"),
          period: t("pdf.period", { period: filters.periodo }),
          date: t("pdf.date", { date: formatDate(new Date()) }),
          packageTitle: t("pdf.packageTitle"),
          rubro: t("pdf.rubro"),
          amount: t("pdf.amount"),
          variation: t("pdf.variation"),
          context: t("pdf.context"),
          noComparable: t("pdf.noComparable"),
        },
        units: filters.units,
        contextLabel: kpis.contextLabel,
        rubros: kpis.rubros.map((rubro) => ({
          title: rubroTitle(rubro.key),
          value: rubro.value,
          deltaPct: rubro.deltaPct,
        })),
      });
    } catch {
      toast.error(t("resultados.pdfError"));
    } finally {
      const remaining = Math.max(0, 1_000 - (Date.now() - startedAt));
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining);
        });
      }
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <CustomizeViewMenu widgets={widgets} onToggle={setWidget} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={pending}
          onClick={() => void downloadPack()}
        >
          <FileText className="h-3.5 w-3.5" />
          {t("resultados.budgetPackage")}
        </Button>
      </div>

      {widgets.kpis ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {kpis.rubros.map((rubro) => (
            <DestacadosRubroCard key={rubro.key} rubro={rubro} units={filters.units} contextLabel={kpis.contextLabel} />
          ))}
        </div>
      ) : null}

      {widgets.tendencia ? (
        <TendenciaIngresosCostosChart rows={rows} units={filters.units} endPeriod={filters.periodo} />
      ) : null}

      {widgets.top5 ? (
        <ResultadosTop5Charts periodo={filters.periodo} units={filters.units} />
      ) : null}

      <ChartErrorBoundary
        fallback={
          <section className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
            {t("resultados.waterfallError")}
          </section>
        }
      >
        <ResultadosWaterfallChart filters={filters} rows={rows} />
      </ChartErrorBoundary>

      {widgets.cogs ? (
        <CogsDesgloseCard periodo={filters.periodo} units={filters.units} />
      ) : null}
    </div>
  );
}
