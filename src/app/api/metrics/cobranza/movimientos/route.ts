import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getCobranzaCarteraMovimientos } from "@/services/cobranzaCarteraMovimientosService";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);

  const cuenta = params.get("cuenta")?.trim();
  if (!cuenta) {
    throw new AppError("VALIDATION_ERROR", "Falta la cuenta de cartera.", 400);
  }
  const anio = parsePositiveInt(params.get("anio"));
  const periodoParam = parsePositiveInt(params.get("periodo"));
  const periodo = periodoParam && periodoParam <= 12 ? periodoParam : null;
  if (!anio || !periodo) {
    throw new AppError("VALIDATION_ERROR", "Periodo inválido.", 400);
  }
  const moneda = params.get("moneda") ?? "MXN";
  return jsonSuccess(await getCobranzaCarteraMovimientos(tenantId, cuenta, anio, periodo, moneda));
});
