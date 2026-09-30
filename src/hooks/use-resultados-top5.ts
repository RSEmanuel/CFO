"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { ResultadosTop5Payload } from "@/services/resultadosTop5";

export function useResultadosTop5(periodo: string, moneda = "MXN") {
  const { tenantId } = useSession();
  const key = tenantId
    ? `/api/metrics/resultados-top5?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}&moneda=${encodeURIComponent(moneda)}`
    : null;
  const { data, error, loading } = useApiData<ResultadosTop5Payload | null>(key);
  const message = useApiErrorMessage(error, "resultados.top5.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
