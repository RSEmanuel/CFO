import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getCobranzaCartera } from "@/services/cobranzaCarteraService";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const anio = parsePositiveInt(params.get("anio"));
  const periodoParam = parsePositiveInt(params.get("periodo"));
  const periodo = periodoParam && periodoParam <= 12 ? periodoParam : null;
  const moneda = params.get("moneda") ?? "MXN";
  return jsonSuccess(await getCobranzaCartera(tenantId, anio, periodo, moneda));
});
