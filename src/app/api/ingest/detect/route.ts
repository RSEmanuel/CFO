import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { previewIngestFiles } from "@/services/ingestionService";
import { withAuth } from "@/middleware/auth";
import { getIngestLimits, validateFileCount } from "@/services/ingest/limits";

export const runtime = "nodejs";

export const POST = withAuth(
  async (request, auth) => {
    const form = await request.formData();
    const tenantIdRaw = form.get("tenantId");
    if (typeof tenantIdRaw !== "string" || !tenantIdRaw) {
      throw new AppError("VALIDATION_ERROR", "El campo tenantId es obligatorio.", 400);
    }
    assertTenantAccess(auth, tenantIdRaw);

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

    return jsonSuccess(await previewIngestFiles(tenantIdRaw, auth.userId, buffers));
  },
  { roles: ["ADMIN", "CFO_PARTNER"] },
);
