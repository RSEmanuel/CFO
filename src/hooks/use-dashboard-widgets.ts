"use client";

import { useCallback, useEffect, useState } from "react";

export const DASHBOARD_WIDGETS_STORAGE_KEY = "cfo_dashboard_visible_widgets";

export const DASHBOARD_WIDGET_KEYS = [
  "kpis",
  "tendencia",
  "top5",
  "cogs",
] as const;

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGET_KEYS)[number];

export type DashboardWidgetsState = Record<DashboardWidgetKey, boolean>;

// Default: KPIs + Tendencia + Top5 visibles; COGS oculto.
// localStorage viejo con claves ya retiradas (ej. "dupont", "flujoCapital") se
// ignora: solo se leen las claves presentes en DASHBOARD_WIDGET_KEYS.
export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetsState = {
  kpis: true,
  tendencia: true,
  top5: true,
  cogs: false,
};

function readStoredWidgets(): DashboardWidgetsState | null {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_WIDGETS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const stored = parsed as Record<string, unknown>;
    const next = { ...DEFAULT_DASHBOARD_WIDGETS };
    for (const key of DASHBOARD_WIDGET_KEYS) {
      if (typeof stored[key] === "boolean") {
        next[key] = stored[key];
      }
    }
    return next;
  } catch {
    return null;
  }
}

/**
 * Visibilidad de widgets de la pantalla inicial persistida en localStorage.
 * SSR-safe: el primer render (servidor y cliente) usa siempre el default y el
 * valor guardado se aplica tras el mount, así no hay hydration mismatch.
 */
export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<DashboardWidgetsState>(DEFAULT_DASHBOARD_WIDGETS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredWidgets();
    if (stored) {
      setWidgets(stored);
    }
    setHydrated(true);
  }, []);

  const setWidget = useCallback((key: DashboardWidgetKey, visible: boolean) => {
    setWidgets((current) => {
      const next = { ...current, [key]: visible };
      try {
        window.localStorage.setItem(DASHBOARD_WIDGETS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage lleno o bloqueado: la preferencia solo vive en memoria.
      }
      return next;
    });
  }, []);

  const resetWidgets = useCallback(() => {
    setWidgets(DEFAULT_DASHBOARD_WIDGETS);
    try {
      window.localStorage.removeItem(DASHBOARD_WIDGETS_STORAGE_KEY);
    } catch {
      // Mismo criterio que arriba.
    }
  }, []);

  return { widgets, setWidget, resetWidgets, hydrated };
}
