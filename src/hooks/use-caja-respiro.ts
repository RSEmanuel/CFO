"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData } from "@/lib/api-cache";
import type { CajaPayload } from "@/services/cajaService";

export function useCajaRespiro(periodo: string) {
  const { tenantId } = useSession();
  const key =
    tenantId && periodo
      ? `/api/metrics/caja?tenantId=${encodeURIComponent(tenantId)}&periodo=${encodeURIComponent(periodo)}`
      : null;
  const { data, loading } = useApiData<CajaPayload | null>(key);
  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData) };
}
