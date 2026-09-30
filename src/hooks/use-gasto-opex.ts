"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { GastoOpexPayload } from "@/services/gastoOpexService";

export function useGastoOpex(periodo: string) {
  const { tenantId } = useSession();
  const key = tenantId
    ? `/api/metrics/gasto-opex?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
    : null;
  const { data, error, loading } = useApiData<GastoOpexPayload | null>(key);
  const message = useApiErrorMessage(error, "resultados.opex.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
