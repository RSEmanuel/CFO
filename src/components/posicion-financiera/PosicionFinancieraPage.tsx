"use client";

import { PosicionFinancieraFilterBar } from "@/components/posicion-financiera/PosicionFinancieraFilterBar";
import { RatioGaugeGrid } from "@/components/posicion-financiera/RatioGaugeGrid";
import { StatementTreeTable } from "@/components/posicion-financiera/StatementTreeTable";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { usePosicionFinanciera } from "@/hooks/use-posicion-financiera";
import { cn } from "@/lib/utils";
import { BALANZA_COLUMNS, yearColumns } from "@/services/posicionFinanciera";
import { useEffect, useMemo, useState } from "react";

const TABS = [
  { value: "posicion", labelKey: "posicionFinanciera.tabBs" },
  { value: "razones", labelKey: "posicionFinanciera.tabRatios" },
  { value: "balanza", labelKey: "posicionFinanciera.tabTrial" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function PosicionFinancieraPage() {
  const { t } = useLocale();
  const { anio } = useSession();
  const [tab, setTab] = useState<TabValue>("posicion");
  const [year, setYear] = useState<number | null>(anio);
  const [period, setPeriod] = useState<number | null>(null);
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);
  const { data, loading, error, refetch } = usePosicionFinanciera(year, tab === "balanza" ? period : null);

  useEffect(() => {
    if (!data) {
      return;
    }
    if (year == null || (data.availableYears.length > 0 && !data.availableYears.includes(year))) {
      setYear(data.year);
    }
    if (period == null || (data.availablePeriods.length > 0 && !data.availablePeriods.includes(period))) {
      setPeriod(data.period);
    }
  }, [data, year, period]);

  const columns = useMemo(() => (data ? yearColumns(data.years) : []), [data]);
  const empty = Boolean(data && !data.hasBalanza);
  const resetKey = `${tab}-${data?.year ?? ""}-${data?.period ?? ""}`;

  // El drill-down audita el mes de corte que la API resolvió para el año en
  // pantalla (en la tab Balanza respeta el periodo seleccionado).
  const handleAuditAccount = useMemo(() => {
    if (!data) return undefined;
    return (target: { codigoCuenta: string; nombreCuenta: string }) =>
      setAuditTarget({ ...target, anio: data.year, periodo: data.period });
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 bg-background">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
        <div className="sticky top-0 z-20 -mx-4 -mt-4 bg-background px-4 pb-4 pt-4 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
          <p className="mb-2 text-lg font-bold tracking-tight text-clay">{t("nav.position")}</p>
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 border-0 bg-transparent p-0">
            {TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  "rounded-full border-0 bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-none",
                  "hover:bg-muted/80 hover:text-foreground",
                  "data-[state=active]:border-0 data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground data-[state=active]:shadow-none",
                )}
              >
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-4">
          <PosicionFinancieraFilterBar
            year={year}
            period={period}
            availableYears={data?.availableYears ?? []}
            availablePeriods={data?.availablePeriods ?? []}
            showPeriod={tab === "balanza"}
            onYearChange={setYear}
            onPeriodChange={setPeriod}
          />
        </div>

        {error ? <p className="mt-4 text-sm text-desfavorable">{error}</p> : null}

        <TabsContent value="posicion" className="mt-4">
          <StatementTreeTable
            title={t("posicionFinanciera.titlePosition")}
            titleHint={t("posicionFinanciera.positionHint")}
            nodes={data?.statements.posicion ?? []}
            columns={columns}
            numberMode="money"
            showYoY
            loading={loading}
            empty={empty}
            resetKey={resetKey}
            onRefresh={refetch}
            favoriteId="table-posicion-balance"
            onAuditAccount={handleAuditAccount}
          />
        </TabsContent>
        <TabsContent value="razones" className="mt-4 space-y-4">
          <RatioGaugeGrid
            nodes={data?.statements.razones ?? []}
            yearKey={String(data?.year ?? year ?? "")}
            loading={loading}
            empty={empty}
          />
          <StatementTreeTable
            title={t("posicionFinanciera.titleRatios")}
            titleHint={t("posicionFinanciera.ratiosHint")}
            nodes={data?.statements.razones ?? []}
            columns={columns}
            numberMode="ratio"
            showYoY
            showEmptyToggle={false}
            loading={loading}
            empty={empty}
            resetKey={resetKey}
            onRefresh={refetch}
            favoriteId="table-posicion-razones"
          />
        </TabsContent>
        <TabsContent value="balanza" className="mt-4">
          <StatementTreeTable
            title={t("posicionFinanciera.titleTrial")}
            titleHint={t("posicionFinanciera.trialHint")}
            nodes={data?.statements.balanza ?? []}
            columns={BALANZA_COLUMNS}
            numberMode="money"
            showCode
            loading={loading}
            empty={empty}
            resetKey={resetKey}
            onRefresh={refetch}
            onAuditAccount={handleAuditAccount}
          />
        </TabsContent>
      </Tabs>
      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  );
}
