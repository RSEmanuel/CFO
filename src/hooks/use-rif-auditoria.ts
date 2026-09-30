"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { RifAuditoriaPayload } from "@/services/rifAuditoriaService";
import { parseIngresoPeriodo } from "@/services/ingresoMix";

/** Carga el payload del tab RIF & Auditoría para el periodo "YYYY-MM". */
export function useRifAuditoria(periodo: string) {
  const { tenantId } = useSession();
  const parsed = parseIngresoPeriodo(periodo);
  const key =
    tenantId && parsed
      ? `/api/metrics/rif-auditoria?tenantId=${encodeURIComponent(tenantId)}&anio=${parsed.anio}&periodo=${parsed.mes}`
      : null;
  const { data, error, loading } = useApiData<RifAuditoriaPayload | null>(key);
  const message = useApiErrorMessage(error, "resultados.rifAuditoria.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
