"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { IngresoCalidadPayload } from "@/services/ingresoCalidadService";

export function useIngresoCalidad(periodo: string) {
  const { tenantId } = useSession();
  const key = tenantId
    ? `/api/metrics/ingreso-calidad?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
    : null;
  const { data, error, loading } = useApiData<IngresoCalidadPayload | null>(key);
  const message = useApiErrorMessage(error, "resultados.ingreso.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
