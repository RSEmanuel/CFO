"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { CobranzaPayload } from "@/services/cobranzaService";

export function useCobranza() {
  const { tenantId } = useSession();
  const key = tenantId ? `/api/metrics/cobranza?tenantId=${encodeURIComponent(tenantId)}` : null;
  const { data, error, loading } = useApiData<CobranzaPayload>(key);
  const message = useApiErrorMessage(error, "cobranza.loadError");

  const safeData = data?.tenantId === tenantId ? data : null;
  return {
    data: safeData,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
  };
}
