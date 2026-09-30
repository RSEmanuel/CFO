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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
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
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    const token = getToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
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
}
