export const ACCESS_TOKEN_KEY = "cfo.accessToken";
export const REFRESH_TOKEN_KEY = "cfo.refreshToken";

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

// Rutas que no se reintentan: un 401 ahí no significa token vencido.
const NO_REFRESH_PATHS = ["/api/auth/login", "/api/auth/refresh"];

let refreshInFlight: Promise<string | null> | null = null;

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Pide un access token nuevo con el refresh token. Varias llamadas con 401 a la vez comparten la
 * misma renovación. Si falla, borra los dos tokens y regresa null.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    const refreshToken = typeof window === "undefined" ? null : localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      return null;
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    const previous = getToken();
    if (previous) {
      headers.set("Authorization", `Bearer ${previous}`);
    }
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers,
        body: JSON.stringify({ refreshToken }),
      });
      const payload = (await response.json()) as { success: true; data: { accessToken: string } } | ApiErrorBody;
      if (!response.ok || !payload.success || !payload.data.accessToken) {
        clearTokens();
        return null;
      }
      localStorage.setItem(ACCESS_TOKEN_KEY, payload.data.accessToken);
      return payload.data.accessToken;
    } catch {
      clearTokens();
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(path, { ...init, headers });
  };

  const token = getToken();
  let response = await send(token);
  // Token vencido: se renueva una sola vez y se repite la llamada original.
  if (response.status === 401 && token && !NO_REFRESH_PATHS.includes(path)) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      response = await send(renewed);
    }
  }

  let payload: { success: true; data: T } | ApiErrorBody;
  try {
    payload = (await response.json()) as { success: true; data: T } | ApiErrorBody;
  } catch {
    throw new ApiError(
      "INTERNAL_ERROR",
      "La respuesta del servidor no es JSON válido.",
      response.status,
    );
  }

  if (!payload || typeof payload !== "object" || !("success" in payload)) {
    throw new ApiError("INTERNAL_ERROR", "La respuesta del servidor no es JSON válido.", response.status);
  }

  if (!payload.success) {
    throw new ApiError(payload.error.code, payload.error.message, response.status, payload.error.details);
  }
  return payload.data;
}

export async function uploadWithProgress(
  path: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<unknown> {
  const attempt = (token: string | null, retried: boolean): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", path);
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        // Igual que apiRequest: con el token vencido se renueva una vez y se vuelve a subir.
        if (xhr.status === 401 && token && !retried) {
          refreshAccessToken()
            .then((renewed) => (renewed ? attempt(renewed, true) : Promise.reject(new ApiError("UNAUTHORIZED", "La sesión venció.", 401))))
            .then(resolve, reject);
          return;
        }
        try {
          const payload = JSON.parse(xhr.responseText) as { success: true; data: unknown } | ApiErrorBody;
          if (!payload.success) {
            reject(
              new ApiError(payload.error.code, payload.error.message, xhr.status, payload.error.details),
            );
            return;
          }
          onProgress(100);
          resolve(payload.data);
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => reject(new ApiError("INTERNAL_ERROR", "No se pudo completar la carga.", 0));
      xhr.send(formData);
    });

  return attempt(getToken(), false);
}
