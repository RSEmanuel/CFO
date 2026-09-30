import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { ingestMasterTemplate } from "@/services/ingestionService";
import { withAuth } from "@/middleware/auth";
import { getIngestLimits, validateWorkbookContainer } from "@/services/ingest/limits";

export const runtime = "nodejs";

export const POST = withAuth(
  async (request, auth) => {
    const form = await request.formData();
    const tenantIdRaw = form.get("tenantId");
    const periodoRaw = form.get("periodo");
    const anioRaw = form.get("anio");
    const file = form.get("file");

    if (typeof tenantIdRaw !== "string" || !tenantIdRaw) {
      throw new AppError("VALIDATION_ERROR", "El campo tenantId es obligatorio.", 400);
    }
    assertTenantAccess(auth, tenantIdRaw);

    const periodo = Number(periodoRaw);
    const anio = Number(anioRaw);
    if (!Number.isInteger(periodo) || !Number.isInteger(anio)) {
      throw new AppError("VALIDATION_ERROR", "periodo y anio deben ser enteros.", 400);
    }

    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "Debes adjuntar el archivo Excel en el campo file.", 400);
    }

    if (file.size > getIngestLimits().maxFileBytes) {
      throw new AppError("VALIDATION_ERROR", `${file.name}: excede el límite configurado por archivo.`, 413);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    validateWorkbookContainer(buffer, file.name);
    const result = await ingestMasterTemplate({
      tenantId: tenantIdRaw,
      periodo,
      anio,
      filename: file.name,
      buffer,
      userId: auth.userId,
    });

    return jsonSuccess(result, 201);
  },
  { roles: ["ADMIN", "CFO_PARTNER"] },
);
