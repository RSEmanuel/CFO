import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import {
  getConcentracionRiesgo,
  type ConcentracionTipo,
} from "@/services/concentracionRiesgoService";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTipo(value: string | null): ConcentracionTipo {
  return value === "proveedores" ? "proveedores" : "clientes";
}

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const anio = parsePositiveInt(params.get("anio"));
  const periodoParam = parsePositiveInt(params.get("periodo"));
  const periodo = periodoParam && periodoParam <= 12 ? periodoParam : null;
  const moneda = params.get("moneda") ?? "MXN";
  const tipo = parseTipo(params.get("tipo"));
  return jsonSuccess(await getConcentracionRiesgo(tenantId, anio, periodo, moneda, tipo));
});
