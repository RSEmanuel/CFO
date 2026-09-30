"use client";

import { MetricsCatalog } from "@/components/metrics/metrics-catalog";
import { DashboardDataProvider } from "@/context/DashboardDataContext";

export default function MetricsPage() {
  return (
    <DashboardDataProvider>
      <MetricsCatalog />
    </DashboardDataProvider>
  );
}
