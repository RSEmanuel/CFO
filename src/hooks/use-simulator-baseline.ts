"use client";

import { useSession } from "@/context/SessionContext";
import { useApiData, useApiErrorMessage } from "@/lib/api-cache";
import type { SimulatorBaselinePayload } from "@/services/simulatorBaselineService";

export function useSimulatorBaseline(periodoLabel: string) {
  const { tenantId } = useSession();
  const [year, month] = periodoLabel.split("-");
  const key =
    tenantId && year && month
      ? `/api/metrics/simulator-baseline?tenantId=${encodeURIComponent(tenantId)}&anio=${encodeURIComponent(year)}&periodo=${encodeURIComponent(month)}`
      : null;
  const { data, error, loading } = useApiData<SimulatorBaselinePayload | null>(key);
  const message = useApiErrorMessage(error, "simulator.loadError");

  const safeData = data && data.tenantId === tenantId ? data : null;
  return { data: safeData, loading: loading || Boolean(tenantId && data && !safeData), error: message };
}
