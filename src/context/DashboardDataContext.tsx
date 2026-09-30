"use client";

import { useFullDashboard } from "@/hooks/use-full-dashboard";
import { useLocale } from "@/context/LocaleContext";
import { monthLabelKey } from "@/i18n/format";
import type { ModulePack } from "@/services/metricsTypes";
import { createContext, useContext, type ReactNode } from "react";

type DashboardData = {
  pack: ModulePack | null;
  loading: boolean;
  error: string | null;
  assumptions: string[];
  corte: string;
};

const DashboardDataContext = createContext<DashboardData | undefined>(undefined);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { data, pack, loading, error, periodView, anio, periodo } = useFullDashboard();
  const corte =
    periodView === "ytd"
      ? t("settings.ytdCutoff", { year: anio })
      : `${t(monthLabelKey((periodo || 1) - 1))} ${anio}`;

  return (
    <DashboardDataContext.Provider
      value={{
        pack,
        loading,
        error,
        assumptions: data?.assumptions ?? [],
        corte,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardData {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error("useDashboardData debe usarse dentro de DashboardDataProvider");
  }
  return ctx;
}
