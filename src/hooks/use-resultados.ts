"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { ResultadosPayload } from "@/services/resultadosService";

export function useResultados() {
  const { tenantId } = useSession();
  const key = tenantId ? `/api/metrics/resultados?tenantId=${encodeURIComponent(tenantId)}` : null;
  const { data, error, loading } = useApiData<ResultadosPayload>(key);
  const message = useApiErrorMessage(error, "resultados.loadError");

  const safeData = data?.tenantId === tenantId ? data : null;
  return {
    data: safeData,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
  };
}
