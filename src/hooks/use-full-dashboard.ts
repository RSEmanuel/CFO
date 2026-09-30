"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { FullDashboard, ModulePack } from "@/services/metricsTypes";
import { useMemo } from "react";

export function useFullDashboard() {
  const { tenantId, anio, periodo, periodView } = useSession();
  // Solo pide la vista activa: el pack YTD se difiere hasta que el usuario lo elija.
  const key = tenantId
    ? `/api/metrics/full-dashboard?tenantId=${encodeURIComponent(tenantId)}&year=${anio}&period=${periodo}&view=${periodView}`
    : null;
  const { data, error, loading } = useApiData<FullDashboard>(key);
  const message = useApiErrorMessage(error, "metrics.loadError");

  const safeData =
    data?.tenantId === tenantId && data.year === anio && data.period === periodo ? data : null;
  const pack: ModulePack | null = useMemo(() => {
    if (!safeData?.views) {
      return null;
    }
    return periodView === "ytd" ? safeData.views.ytd ?? null : safeData.views.mensual ?? null;
  }, [safeData, periodView]);

  return {
    data: safeData,
    pack,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
    periodView,
    anio,
    periodo,
  };
}
