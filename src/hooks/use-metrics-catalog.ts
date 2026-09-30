"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { CatalogCategories } from "@/services/financialEngine";

export type CatalogComparable = "mom" | "yoy";

export type MetricsCatalogPayload = {
  tenantId: string;
  year: number;
  period: number;
  comparable: CatalogComparable;
  categories: CatalogCategories;
  assumptions: string[];
};

export function useMetricsCatalog(comparable: CatalogComparable) {
  const { tenantId, anio, periodo } = useSession();
  const key = tenantId
    ? `/api/metrics/catalog?tenantId=${encodeURIComponent(tenantId)}&year=${anio}&period=${periodo}&comparable=${comparable}`
    : null;
  const { data, error, loading, refetch } = useApiData<MetricsCatalogPayload>(key);
  const message = useApiErrorMessage(error, "metrics.loadError");

  const safeData =
    data?.tenantId === tenantId &&
    data.year === anio &&
    data.period === periodo &&
    data.comparable === comparable
      ? data
      : null;
  return {
    data: safeData,
    loading: loading || Boolean(tenantId && data && !safeData),
    error: safeData || !data ? message : null,
    retry: refetch,
    anio,
    periodo,
  };
}
