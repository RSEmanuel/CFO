"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { BudgetProjectionPayload } from "@/services/budgetProjectionService";

export function useBudgetProjection(periodo: string) {
  const { tenantId } = useSession();
  const key =
    tenantId && periodo
      ? `/api/metrics/budget-projection?${new URLSearchParams({ tenantId, periodo }).toString()}`
      : null;
  const { data, error, loading, refetch } = useApiData<BudgetProjectionPayload>(key);
  const message = useApiErrorMessage(error, "resultados.projectionError");

  const safeData =
    data?.tenantId === tenantId && data.anchorPeriodo === periodo ? data : null;
  return {
    data: safeData,
    loading: Boolean(tenantId && periodo) && (loading || Boolean(data && !safeData)),
    error: safeData || !data ? message : null,
    refetch,
  };
}
