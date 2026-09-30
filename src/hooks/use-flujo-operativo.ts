"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { FlujoOperativoPayload } from "@/services/flujoOperativo";

export function useFlujoOperativo(periodo: string, moneda = "MXN") {
  const { tenantId } = useSession();
  const key =
    tenantId && periodo
      ? `/api/metrics/flujo-operativo?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}&moneda=${encodeURIComponent(moneda)}`
      : null;
  const { data, error, loading } = useApiData<FlujoOperativoPayload>(key);
  const message = useApiErrorMessage(error, "flujo.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
