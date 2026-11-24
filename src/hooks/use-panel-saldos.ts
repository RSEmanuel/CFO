"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData } from "@/lib/api-cache";
import type { PanelSaldos } from "@/services/panelSaldos";

/** Saldos del Panel de Control al cierre del mes (CxC, CxP, deuda, impuestos). */
export function usePanelSaldos(periodo: string) {
  const { tenantId } = useSession();
  const key =
    tenantId && periodo
      ? `/api/metrics/panel-saldos?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
      : null;
  const { data, loading } = useApiData<PanelSaldos | null>(key);
  const safeData = data && data.tenantId === tenantId && data.periodo === periodo ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData) };
}
