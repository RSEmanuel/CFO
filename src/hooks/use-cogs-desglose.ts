"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { CogsDesglosePayload } from "@/services/cogsDesgloseService";

export function useCogsDesglose(periodo: string) {
  const { tenantId } = useSession();
  const key = tenantId
    ? `/api/metrics/resultados-cogs?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
    : null;
  const { data, error, loading } = useApiData<CogsDesglosePayload | null>(key);
  const message = useApiErrorMessage(error, "resultados.cogs.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
