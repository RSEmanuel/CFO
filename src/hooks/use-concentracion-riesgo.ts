"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type {
  ConcentracionRiesgoPayload,
  ConcentracionTipo,
} from "@/services/concentracionRiesgoService";

export function useConcentracionRiesgo(tipo: ConcentracionTipo, moneda = "MXN") {
  const { tenantId, anio, periodo } = useSession();
  const key = tenantId
    ? `/api/metrics/cobranza/concentracion?tenantId=${encodeURIComponent(tenantId)}&anio=${anio}&periodo=${periodo}&moneda=${encodeURIComponent(moneda)}&tipo=${tipo}`
    : null;
  const { data, error, loading } = useApiData<ConcentracionRiesgoPayload>(key);
  const message = useApiErrorMessage(error, "cobranza.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return {
    data: safeData,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
  };
}
