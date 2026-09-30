"use client";

import { ApiError, apiRequest } from "@/lib/api";
import { useLocale } from "@/context/LocaleContext";
import { useCallback, useEffect, useState } from "react";

/**
 * Caché en memoria para respuestas GET de /api/*, con semantics tipo SWR:
 * - keyed por URL (ya incluye tenantId/periodo/vista), sobrevive a desmontajes.
 * - staleTime: dentro de la ventana no se refetchea al remontar.
 * - stale-while-revalidate: con datos vencidos muestra el caché y revalida atrás.
 * - dedup de requests en vuelo entre componentes que piden la misma key.
 */

export const API_CACHE_STALE_TIME_MS = 30_000;
const MAX_ENTRIES = 60;

type CacheEntry = {
  data: unknown;
  error: unknown;
  fetching: boolean;
  updatedAt: number;
  inflight: Promise<void> | null;
  listeners: Set<() => void>;
};

const cache = new Map<string, CacheEntry>();

function getEntry(key: string): CacheEntry {
  let entry = cache.get(key);
  if (!entry) {
    if (cache.size >= MAX_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [candidateKey, candidate] of cache) {
        if (candidate.inflight) continue;
        if (candidate.updatedAt < oldestAt) {
          oldestAt = candidate.updatedAt;
          oldestKey = candidateKey;
        }
      }
      if (oldestKey) cache.delete(oldestKey);
    }
    entry = {
      data: undefined,
      error: undefined,
      fetching: false,
      updatedAt: 0,
      inflight: null,
      listeners: new Set(),
    };
    cache.set(key, entry);
  }
  return entry;
}

function notify(entry: CacheEntry): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

function fetchEntry(key: string, entry: CacheEntry, force: boolean, staleTime: number): void {
  if (entry.inflight) {
    return;
  }
  const isFresh = entry.data !== undefined && Date.now() - entry.updatedAt < staleTime;
  if (!force && isFresh) {
    return;
  }
  entry.fetching = true;
  entry.inflight = apiRequest<unknown>(key)
    .then((data) => {
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
    })
    .catch((error: unknown) => {
      // Conserva datos previos (si hay) y solo expone el error.
      entry.error = error;
    })
    .finally(() => {
      entry.fetching = false;
      entry.inflight = null;
      notify(entry);
    });
  notify(entry);
}

/** Invalida el caché (p.ej. tras una ingesta). Sin filtro, lo limpia completo. */
export function invalidateApiCache(filter?: (key: string) => boolean): void {
  for (const [key, entry] of cache) {
    if (!filter || filter(key)) {
      entry.data = undefined;
      entry.error = undefined;
      entry.updatedAt = 0;
      notify(entry);
    }
  }
}

type Snapshot = {
  key: string | null;
  data: unknown;
  error: unknown;
  fetching: boolean;
  updatedAt: number;
};

function readSnapshot(key: string | null): Snapshot {
  if (!key) {
    return { key, data: undefined, error: undefined, fetching: false, updatedAt: 0 };
  }
  const entry = getEntry(key);
  return {
    key,
    data: entry.data,
    error: entry.error,
    fetching: entry.fetching,
    updatedAt: entry.updatedAt,
  };
}

export type ApiDataResult<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  fetching: boolean;
  refetch: () => void;
};

export function useApiData<T>(key: string | null, staleTime = API_CACHE_STALE_TIME_MS): ApiDataResult<T> {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => readSnapshot(key));

  useEffect(() => {
    if (!key) {
      setSnapshot({ key, data: undefined, error: undefined, fetching: false, updatedAt: 0 });
      return;
    }
    const entry = getEntry(key);
    const update = () => setSnapshot(readSnapshot(key));
    update();
    entry.listeners.add(update);
    fetchEntry(key, entry, false, staleTime);
    return () => {
      entry.listeners.delete(update);
    };
  }, [key, staleTime]);

  const refetch = useCallback(() => {
    if (!key) {
      return;
    }
    fetchEntry(key, getEntry(key), true, 0);
  }, [key]);

  const current = snapshot.key === key ? snapshot : readSnapshot(key);
  const data = (current.data as T | undefined) ?? null;
  // settled: hubo respuesta (aunque el payload sea null) o error.
  const settled = current.updatedAt > 0 || current.error != null;
  const loading = Boolean(key) && !settled;
  return { data, error: current.error, loading, fetching: current.fetching, refetch };
}

/** Traduce un ApiError a mensaje localizado; cae al fallback si no hay clave. */
export function useApiErrorMessage(error: unknown, fallbackKey: string): string | null {
  const { t } = useLocale();
  if (!error) {
    return null;
  }
  const key = error instanceof ApiError ? `errors.${error.code}` : "";
  const translated = key ? t(key) : "";
  return translated && translated !== key ? translated : t(fallbackKey);
}
