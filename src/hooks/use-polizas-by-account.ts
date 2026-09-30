"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { PolizasByAccountResponse } from "@/services/polizasByAccountService";

/**
 * Carga el drill-down de pólizas por cuenta. `codigoCuenta` null = sheet
 * cerrado: no se dispara request (la key va en null).
 */
export function usePolizasByAccount(
  codigoCuenta: string | null,
  anio: number | null,
  periodo: number | null,
) {
  const { tenantId } = useSession();
  const key =
    tenantId && codigoCuenta && anio != null && periodo != null
      ? `/api/polizas/by-account?tenantId=${encodeURIComponent(tenantId)}&anio=${anio}&periodo=${periodo}&codigoCuenta=${encodeURIComponent(codigoCuenta)}`
      : null;
  const { data, error, loading } = useApiData<PolizasByAccountResponse>(key);
  const message = useApiErrorMessage(error, "polizas.audit.loadError");

  return {
    data: data ?? null,
    loading: Boolean(key) && loading,
    error: message,
  };
}
