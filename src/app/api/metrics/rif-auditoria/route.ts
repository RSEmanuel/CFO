import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { getRifAuditoria } from "@/services/rifAuditoriaService";
import type { PeriodoRef } from "@/services/rifAuditoria";

export const runtime = "nodejs";

/**
 * GET /api/metrics/rif-auditoria?anio=2026&periodo=7
 * GET /api/metrics/rif-auditoria?periodo=2026-07
 *
 * Tab RIF & Auditoría: desglose del Resultado Integral de Financiamiento por
 * subcuenta, monitor de impuestos (PTU/ISR + tasa efectiva) y semáforo de
 * cuentas puente. Sin anio/periodo cae al último periodo con balanza.
 */
function resolveTarget(params: URLSearchParams): PeriodoRef | null {
  const periodoRaw = params.get("periodo");
  const anioRaw = params.get("anio");
  if (periodoRaw && /^\d{4}-\d{2}$/.test(periodoRaw)) {
    return parseIngresoPeriodo(periodoRaw);
  }
  if (periodoRaw == null && anioRaw == null) {
    return null;
  }
  const anio = Number(anioRaw);
  const mes = Number(periodoRaw);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los parámetros anio/periodo deben ser enteros válidos (periodo 1-12) o periodo=YYYY-MM.",
      400,
    );
  }
  return { anio, mes };
}

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  return jsonSuccess(await getRifAuditoria(tenantId, resolveTarget(params)));
});
