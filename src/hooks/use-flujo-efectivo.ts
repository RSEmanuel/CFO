"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { FlujoEfectivoPayload } from "@/services/flujoService";

export function useFlujoEfectivo(periodo: string) {
  const { tenantId } = useSession();
  const key = tenantId
    ? `/api/metrics/flujo-efectivo?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
    : null;
  const { data, error, loading } = useApiData<FlujoEfectivoPayload | null>(key);
  const message = useApiErrorMessage(error, "flujo.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
