"use client";

import { ErWaterfallChart } from "@/components/resultados/ErWaterfallChart";
import { resultadosMonthsSentence } from "@/components/resultados/resultados-months-sentence";
import { StatementTreeTable } from "@/components/posicion-financiera/StatementTreeTable";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { usePosicionFinanciera } from "@/hooks/use-posicion-financiera";
import { collapseToMayorAccounts, yearColumns } from "@/services/posicionFinanciera";
import { useEffect, useMemo, useState } from "react";

type EstadoResultadosViewProps = {
  periodo?: string;
};

export function EstadoResultadosView({ periodo }: EstadoResultadosViewProps) {
  const { t, locale } = useLocale();
  const { anio } = useSession();
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);

  const yearFromPeriod = periodo ? Number(periodo.slice(0, 4)) : null;
  const initialYear = Number.isInteger(yearFromPeriod) && yearFromPeriod! > 2000 ? yearFromPeriod : anio;
  const [year, setYear] = useState<number | null>(initialYear);

  useEffect(() => {
    if (Number.isInteger(yearFromPeriod) && yearFromPeriod! > 2000) {
      setYear(yearFromPeriod);
    }
  }, [yearFromPeriod]);

  const { data, loading, error, refetch } = usePosicionFinanciera(year, null);

  useEffect(() => {
    if (!data) return;
    if (year == null || (data.availableYears.length > 0 && !data.availableYears.includes(year))) {
      setYear(data.year);
    }
  }, [data, year]);

  const columns = useMemo(() => (data ? yearColumns(data.years) : []), [data]);
  const revenueBase = useMemo(() => {
    const tree = data?.statements.resultados ?? [];
    return tree.find((node) => node.id === "pyg:ingresos")?.values;
  }, [data]);
  // La tabla lista solo cuentas de mayor; la cascada sigue usando el árbol completo.
  const tableNodes = useMemo(
    () =>
      collapseToMayorAccounts(data?.statements.resultados ?? [], (data?.years ?? []).map(String), (code) =>
        t("posicionFinanciera.mayorAccount", { code }),
      ),
    [data, t],
  );
  const monthsSentence = useMemo(() => resultadosMonthsSentence(data, t, locale), [data, t, locale]);
  const empty = Boolean(data && !data.hasBalanza);
  const resetKey = `estado-resultados-${data?.year ?? year ?? ""}-${data?.period ?? ""}`;

  const handleAuditAccount = useMemo(() => {
    if (!data) return undefined;
    return (target: { codigoCuenta: string; nombreCuenta: string }) =>
      setAuditTarget({ ...target, anio: data.year, periodo: data.period });
  }, [data]);

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-desfavorable">{error}</p> : null}
      <ErWaterfallChart
        nodes={data?.statements.resultados ?? []}
        yearKey={String(data?.year ?? year ?? "")}
        loading={loading}
        empty={empty}
      />
      <StatementTreeTable
        title={t("posicionFinanciera.titleResults")}
        titleHint={t("posicionFinanciera.resultsHint")}
        subtitle={monthsSentence}
        nodes={tableNodes}
        columns={columns}
        numberMode="money"
        showYoY
        verticalBase={revenueBase}
        loading={loading}
        empty={empty}
        resetKey={resetKey}
        onRefresh={refetch}
        favoriteId="table-posicion-resultados"
        onAuditAccount={handleAuditAccount}
      />
      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  );
}
