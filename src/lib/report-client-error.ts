import { ACCESS_TOKEN_KEY } from "@/lib/api";

let currentTenantId: string | null = null;

/** La sesión avisa qué empresa se está consultando, para atribuirle los errores del navegador. */
export function setErrorReportTenant(tenantId: string | null): void {
  currentTenantId = tenantId || null;
}

/**
 * Manda un error del navegador a /api/admin/errors. Sin sesión no se reporta (el API exige token).
 * Nunca lanza: si el reporte falla, no debe generar otro error que se intente reportar.
 */
export function reportClientError(
  error: unknown,
  info?: { componentStack?: string | null; severity?: "error" | "warn" },
): void {
  if (typeof window === "undefined") {
    return;
  }
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    return;
  }
  const err = error instanceof Error ? error : new Error(String(error));
  const digest = (err as Error & { digest?: unknown }).digest;
  const stack = [err.stack, info?.componentStack ? `Component stack:${info.componentStack}` : null]
    .filter(Boolean)
    .join("\n\n");

  void fetch("/api/admin/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      source: "client",
      severity: info?.severity ?? "error",
      message: err.message || err.name || "Error sin mensaje",
      stack: stack || undefined,
      digest: typeof digest === "string" ? digest : undefined,
      url: window.location.href,
      userAgent: window.navigator.userAgent,
      tenantId: currentTenantId ?? undefined,
    }),
    keepalive: true,
  }).catch(() => undefined);
}
