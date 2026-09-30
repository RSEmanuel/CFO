"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { FlujoPayload } from "@/services/flujoService";

export function useFlujo() {
  const { tenantId } = useSession();
  const key = tenantId ? `/api/metrics/flujo?tenantId=${encodeURIComponent(tenantId)}` : null;
  const { data, error, loading } = useApiData<FlujoPayload>(key);
  const message = useApiErrorMessage(error, "flujo.loadError");

  const safeData = data?.tenantId === tenantId ? data : null;
  return {
    data: safeData,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
  };
}
