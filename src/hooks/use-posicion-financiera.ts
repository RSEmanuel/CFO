"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { PosicionFinancieraPayload } from "@/services/posicionFinanciera";

export function usePosicionFinanciera(year: number | null, period: number | null) {
  const { tenantId } = useSession();
  const params = new URLSearchParams();
  if (tenantId) {
    params.set("tenantId", tenantId);
  }
  if (year != null) {
    params.set("year", String(year));
  }
  if (period != null) {
    params.set("period", String(period));
  }
  const key = tenantId ? `/api/metrics/posicion-financiera?${params.toString()}` : null;
  const { data, error, loading, refetch } = useApiData<PosicionFinancieraPayload>(key);
  const message = useApiErrorMessage(error, "posicionFinanciera.loadError");

  const safeData = data?.tenantId === tenantId ? data : null;
  return {
    data: safeData,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
    refetch,
  };
}
