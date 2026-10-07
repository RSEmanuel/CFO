"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { FlujoLibrePayload } from "@/services/flujoLibreService";

export function useFlujoLibre(periodo: string) {
  const { tenantId } = useSession();
  const key =
    tenantId && periodo
      ? `/api/metrics/flujo-libre?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
      : null;
  const { data, error, loading } = useApiData<FlujoLibrePayload | null>(key);
  const message = useApiErrorMessage(error, "flujo.libre.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
