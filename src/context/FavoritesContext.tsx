"use client";

import {
  emptyFavorites,
  FAVORITES_CHANGED_EVENT,
  FAVORITES_STORAGE_KEY,
  favoritesEqual,
  readFavoritesFromStorage,
  toggleFavoriteId,
  writeFavoritesToStorage,
  type FavoritesState,
} from "@/lib/favorites-storage";
import {
  getFavoritesByCategory as registryGetFavoritesByCategory,
  resolveStorageBucket,
  type FavoritesCategory,
  type FavoritableWidget,
} from "@/services/favoritesRegistry";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type { FavoritesState };

type FavoritesContextValue = FavoritesState & {
  toggleFavoriteMetric: (id: string) => void;
  toggleFavoriteChart: (id: string) => void;
  toggleFavoriteWidget: (id: string) => void;
  isFavoriteMetric: (id: string) => boolean;
  isFavoriteChart: (id: string) => boolean;
  isFavoriteWidget: (id: string) => boolean;
  /** Genérico: enruta al bucket correcto según el registro de widgets. */
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  getFavoritesByCategory: (category: FavoritesCategory) => FavoritableWidget[];
};

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

function applyIncoming(current: FavoritesState, incoming: FavoritesState): FavoritesState {
  return favoritesEqual(current, incoming) ? current : incoming;
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FavoritesState>(emptyFavorites);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readFavoritesFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    writeFavoritesToStorage(state);
  }, [state, hydrated]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== FAVORITES_STORAGE_KEY && event.key !== null) {
        return;
      }
      setState((current) => applyIncoming(current, readFavoritesFromStorage()));
    };
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<FavoritesState>).detail;
      if (!detail) {
        setState((current) => applyIncoming(current, readFavoritesFromStorage()));
        return;
      }
      setState((current) => applyIncoming(current, detail));
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(FAVORITES_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAVORITES_CHANGED_EVENT, onChanged);
    };
  }, []);

  const toggleFavoriteMetric = useCallback((id: string) => {
    setState((current) => ({ ...current, favoriteMetricIds: toggleFavoriteId(current.favoriteMetricIds, id) }));
  }, []);

  const toggleFavoriteChart = useCallback((id: string) => {
    setState((current) => ({ ...current, favoriteChartIds: toggleFavoriteId(current.favoriteChartIds, id) }));
  }, []);

  const toggleFavoriteWidget = useCallback((id: string) => {
    setState((current) => ({ ...current, favoriteWidgetIds: toggleFavoriteId(current.favoriteWidgetIds, id) }));
  }, []);

  const isFavoriteMetric = useCallback((id: string) => state.favoriteMetricIds.includes(id), [state.favoriteMetricIds]);
  const isFavoriteChart = useCallback((id: string) => state.favoriteChartIds.includes(id), [state.favoriteChartIds]);
  const isFavoriteWidget = useCallback((id: string) => state.favoriteWidgetIds.includes(id), [state.favoriteWidgetIds]);

  const isFavorite = useCallback(
    (id: string) => isFavoriteMetric(id) || isFavoriteChart(id) || isFavoriteWidget(id),
    [isFavoriteMetric, isFavoriteChart, isFavoriteWidget],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      const bucket = resolveStorageBucket(id);
      if (bucket === "metric") {
        toggleFavoriteMetric(id);
      } else if (bucket === "chart") {
        toggleFavoriteChart(id);
      } else {
        toggleFavoriteWidget(id);
      }
    },
    [toggleFavoriteMetric, toggleFavoriteChart, toggleFavoriteWidget],
  );

  const getFavoritesByCategory = useCallback(
    (category: FavoritesCategory) => registryGetFavoritesByCategory(state, category),
    [state],
  );

  const value = useMemo(
    () => ({
      ...state,
      toggleFavoriteMetric,
      toggleFavoriteChart,
      toggleFavoriteWidget,
      isFavoriteMetric,
      isFavoriteChart,
      isFavoriteWidget,
      isFavorite,
      toggleFavorite,
      getFavoritesByCategory,
    }),
    [
      state,
      toggleFavoriteMetric,
      toggleFavoriteChart,
      toggleFavoriteWidget,
      isFavoriteMetric,
      isFavoriteChart,
      isFavoriteWidget,
      isFavorite,
      toggleFavorite,
      getFavoritesByCategory,
    ],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites debe usarse dentro de FavoritesProvider");
  }
  return ctx;
}
