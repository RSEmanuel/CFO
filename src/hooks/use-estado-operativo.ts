"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { EstadoOperativoPayload } from "@/services/estadoOperativoService";

/** `enabled=false` no pide nada: la pestaña que lo usa aún no está abierta. */
export function useEstadoOperativo(periodo: string, enabled = true) {
  const { tenantId } = useSession();
  const key = tenantId && enabled && periodo
    ? `/api/metrics/estado-operativo?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
    : null;
  const { data, error, loading } = useApiData<EstadoOperativoPayload | null>(key);
  const message = useApiErrorMessage(error, "resultados.operativo.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
