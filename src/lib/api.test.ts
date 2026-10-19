import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ACCESS_TOKEN_KEY, ApiError, REFRESH_TOKEN_KEY, apiRequest } from "./api";

type Call = { url: string; auth: string | null };

const store = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};
Object.assign(globalThis, { window: globalThis, localStorage: memoryStorage });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const unauthorized = () => json(401, { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } });

/** fetch falso: las llamadas a datos responden 401 hasta que llega con el token renovado. */
function mockFetch(options: { refreshOk: boolean; acceptRenewed: boolean }): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("Authorization");
    calls.push({ url, auth });
    if (url === "/api/auth/refresh") {
      // Respuesta lenta para que las llamadas en paralelo choquen con la renovación en curso.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return options.refreshOk
        ? json(200, { success: true, data: { accessToken: "renewed" } })
        : unauthorized();
    }
    if (auth === "Bearer renewed" && options.acceptRenewed) {
      return json(200, { success: true, data: { ok: url } });
    }
    return unauthorized();
  }) as typeof fetch;
  return calls;
}

describe("apiRequest con token vencido", () => {
  beforeEach(() => {
    store.clear();
    store.set(ACCESS_TOKEN_KEY, "expired");
    store.set(REFRESH_TOKEN_KEY, "refresh");
  });

  it("401 renueva y reintenta una sola vez", async () => {
    const calls = mockFetch({ refreshOk: true, acceptRenewed: true });
    const data = await apiRequest<{ ok: string }>("/api/admin/users");

    assert.deepEqual(data, { ok: "/api/admin/users" });
    assert.deepEqual(calls, [
      { url: "/api/admin/users", auth: "Bearer expired" },
      { url: "/api/auth/refresh", auth: "Bearer expired" },
      { url: "/api/admin/users", auth: "Bearer renewed" },
    ]);
    assert.equal(store.get(ACCESS_TOKEN_KEY), "renewed");
  });

  it("si el reintento vuelve a dar 401 no renueva otra vez", async () => {
    const calls = mockFetch({ refreshOk: true, acceptRenewed: false });
    await assert.rejects(apiRequest("/api/admin/users"), (error: unknown) => error instanceof ApiError && error.status === 401);

    assert.equal(calls.filter((call) => call.url === "/api/auth/refresh").length, 1);
    assert.equal(calls.length, 3);
  });

  it("varias llamadas con 401 a la vez comparten una sola renovación", async () => {
    const calls = mockFetch({ refreshOk: true, acceptRenewed: true });
    await Promise.all([apiRequest("/api/a"), apiRequest("/api/b"), apiRequest("/api/c")]);

    assert.equal(calls.filter((call) => call.url === "/api/auth/refresh").length, 1);
  });

  it("si la renovación falla borra los dos tokens", async () => {
    mockFetch({ refreshOk: false, acceptRenewed: true });
    await assert.rejects(apiRequest("/api/admin/users"), ApiError);

    assert.equal(store.has(ACCESS_TOKEN_KEY), false);
    assert.equal(store.has(REFRESH_TOKEN_KEY), false);
  });
});
