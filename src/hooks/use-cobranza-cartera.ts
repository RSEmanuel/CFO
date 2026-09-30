"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { CobranzaCarteraPayload } from "@/services/cobranzaCarteraService";

export function useCobranzaCartera(moneda = "MXN") {
  const { tenantId, anio, periodo } = useSession();
  const key = tenantId
    ? `/api/metrics/cobranza/cartera?tenantId=${encodeURIComponent(tenantId)}&anio=${anio}&periodo=${periodo}&moneda=${encodeURIComponent(moneda)}`
    : null;
  const { data, error, loading } = useApiData<CobranzaCarteraPayload>(key);
  const message = useApiErrorMessage(error, "cobranza.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return {
    data: safeData,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
  };
}
