"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { EstadoOperativoPayload } from "@/services/estadoOperativoService";

export function useEstadoOperativo(periodo: string) {
  const { tenantId } = useSession();
  const key = tenantId
    ? `/api/metrics/estado-operativo?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
    : null;
  const { data, error, loading } = useApiData<EstadoOperativoPayload | null>(key);
  const message = useApiErrorMessage(error, "resultados.operativo.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
