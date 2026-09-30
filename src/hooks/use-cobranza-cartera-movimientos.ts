"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { CobranzaCarteraMovimientosPayload } from "@/services/cobranzaCarteraMovimientos";

/**
 * Fetch lazy del detalle de movimientos de UNA cuenta de cartera: solo se pide
 * cuando la fila está expandida (cuenta != null). El caché de api-cache es
 * compartido y con staleTime infinito: colapsar/reexpandir no refetchea; una
 * re-ingesta invalida el caché vía invalidateApiCache.
 */
export function useCobranzaCarteraMovimientos(cuenta: string | null, moneda: string) {
  const { tenantId, anio, periodo } = useSession();
  const key =
    tenantId && cuenta
      ? `/api/metrics/cobranza/movimientos?tenantId=${encodeURIComponent(tenantId)}&cuenta=${encodeURIComponent(cuenta)}&anio=${anio}&periodo=${periodo}&moneda=${encodeURIComponent(moneda)}`
      : null;
  const { data, error, loading } = useApiData<CobranzaCarteraMovimientosPayload>(
    key,
    Number.POSITIVE_INFINITY,
  );
  const message = useApiErrorMessage(error, "cobranza.cartera.detalleError");
  return { data, loading, error: message };
}
