export const FAVORITES_STORAGE_KEY = "cfo_virtual_favorites";
export const FAVORITES_CHANGED_EVENT = "cfo:favorites-changed";

export type FavoritesState = {
  favoriteMetricIds: string[];
  favoriteChartIds: string[];
  /** KPIs, gráficos y tablas de módulos registrados en favoritesRegistry. */
  favoriteWidgetIds: string[];
};

export function emptyFavorites(): FavoritesState {
  return { favoriteMetricIds: [], favoriteChartIds: [], favoriteWidgetIds: [] };
}

export function toggleFavoriteId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export function parseFavorites(raw: string | null): FavoritesState {
  if (!raw) {
    return emptyFavorites();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FavoritesState>;
    return {
      favoriteMetricIds: stringIds(parsed.favoriteMetricIds),
      favoriteChartIds: stringIds(parsed.favoriteChartIds),
      favoriteWidgetIds: stringIds(parsed.favoriteWidgetIds),
    };
  } catch {
    return emptyFavorites();
  }
}

export function favoritesEqual(a: FavoritesState, b: FavoritesState): boolean {
  return (
    a.favoriteMetricIds.length === b.favoriteMetricIds.length &&
    a.favoriteChartIds.length === b.favoriteChartIds.length &&
    a.favoriteWidgetIds.length === b.favoriteWidgetIds.length &&
    a.favoriteMetricIds.every((id, index) => id === b.favoriteMetricIds[index]) &&
    a.favoriteChartIds.every((id, index) => id === b.favoriteChartIds[index]) &&
    a.favoriteWidgetIds.every((id, index) => id === b.favoriteWidgetIds[index])
  );
}

export function readFavoritesFromStorage(): FavoritesState {
  if (typeof window === "undefined") {
    return emptyFavorites();
  }
  try {
    return parseFavorites(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
  } catch {
    return emptyFavorites();
  }
}

export function writeFavoritesToStorage(state: FavoritesState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent<FavoritesState>(FAVORITES_CHANGED_EVENT, { detail: state }));
  } catch {
    // Cuota llena o modo privado: el estado queda solo en memoria.
  }
}
