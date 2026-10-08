/**
 * Caché corta en memoria del servidor para respuestas ya calculadas.
 * - Una repetición dentro de la ventana no vuelve a leer la base.
 * - Si dos widgets piden lo mismo a la vez, comparten un solo cálculo.
 * - Las llaves siempre llevan el tenantId, así que `invalidateTenantCache`
 *   limpia solo lo de esa empresa (se llama al subir una balanza nueva).
 * Los errores no se guardan.
 */
export const SERVER_CACHE_TTL_MS = 30_000;
const MAX_ENTRIES = 200;

type Entry = { value?: unknown; expiresAt: number; inflight?: Promise<unknown>; tenantId: string };

const globalForCache = globalThis as unknown as { cifraServerCache?: Map<string, Entry> };
const store = (globalForCache.cifraServerCache ??= new Map<string, Entry>());

export async function cachedForTenant<T>(
  tenantId: string,
  key: string,
  compute: () => Promise<T>,
  ttlMs = SERVER_CACHE_TTL_MS,
  now: () => number = Date.now,
): Promise<T> {
  const fullKey = `${tenantId}|${key}`;
  const hit = store.get(fullKey);
  if (hit) {
    if (hit.inflight) return hit.inflight as Promise<T>;
    if (hit.expiresAt > now()) return hit.value as T;
    store.delete(fullKey);
  }

  if (store.size >= MAX_ENTRIES) {
    for (const [candidate, entry] of store) {
      if (!entry.inflight && entry.expiresAt <= now()) store.delete(candidate);
    }
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
  }

  const entry: Entry = { expiresAt: 0, tenantId };
  const inflight = compute().then(
    (value) => {
      if (store.get(fullKey) === entry) {
        entry.value = value;
        entry.inflight = undefined;
        entry.expiresAt = now() + ttlMs;
      }
      return value;
    },
    (error) => {
      if (store.get(fullKey) === entry) store.delete(fullKey);
      throw error;
    },
  );
  entry.inflight = inflight;
  store.set(fullKey, entry);
  return inflight;
}

export function invalidateTenantCache(tenantId: string): void {
  for (const [key, entry] of store) {
    if (entry.tenantId === tenantId) store.delete(key);
  }
}

export function clearServerCache(): void {
  store.clear();
}
