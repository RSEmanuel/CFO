import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { commitIngestFiles } from "@/services/ingestionService";
import { withAuth } from "@/middleware/auth";
import { getIngestLimits, validateFileCount } from "@/services/ingest/limits";

export const runtime = "nodejs";

export const POST = withAuth(
  async (request, auth) => {
    const form = await request.formData();
    const tenantIdRaw = form.get("tenantId");
    const periodoRaw = form.get("periodo");
    const anioRaw = form.get("anio");
    const useFilePeriod = String(form.get("useFilePeriod") ?? "") === "true";
    const detectionId = typeof form.get("detectionId") === "string" ? String(form.get("detectionId")) : undefined;
    const selectedProfilesRaw = form.get("selectedProfiles");

    if (typeof tenantIdRaw !== "string" || !tenantIdRaw) {
      throw new AppError("VALIDATION_ERROR", "El campo tenantId es obligatorio.", 400);
    }
    assertTenantAccess(auth, tenantIdRaw);

    const periodo = Number(periodoRaw);
    const anio = Number(anioRaw);
    if (!Number.isInteger(periodo) || !Number.isInteger(anio)) {
      throw new AppError("VALIDATION_ERROR", "periodo y anio deben ser enteros.", 400);
    }

    const files = form
      .getAll("files")
      .concat(form.get("file") ? [form.get("file") as File] : [])
      .filter((item): item is File => item instanceof File);

    validateFileCount(files.length);
    const limits = getIngestLimits();
    const buffers = [];
    for (const file of files) {
      if (file.size > limits.maxFileBytes) {
        throw new AppError("VALIDATION_ERROR", `${file.name}: excede el límite configurado por archivo.`, 413);
      }
      buffers.push({
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
    }
    let selectedProfiles: Record<string, string> | undefined;
    if (typeof selectedProfilesRaw === "string" && selectedProfilesRaw) {
      try {
        selectedProfiles = JSON.parse(selectedProfilesRaw) as Record<string, string>;
      } catch {
        throw new AppError("VALIDATION_ERROR", "selectedProfiles debe ser un objeto JSON válido.", 400);
      }
    }

    const result = await commitIngestFiles({
      tenantId: tenantIdRaw,
      userId: auth.userId,
      periodo,
      anio,
      files: buffers,
      useFilePeriod,
      detectionId,
      selectedProfiles,
    });
    return jsonSuccess(result, 201);
  },
  { roles: ["ADMIN", "CFO_PARTNER"] },
);
