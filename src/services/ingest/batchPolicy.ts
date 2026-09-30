import { AppError } from "@/auth/errors";
import type { DetectResult } from "@/services/ingest/types";

export function resolveBatchPeriod(
  previews: DetectResult[],
  session: { periodo: number; anio: number },
  useFilePeriod = false,
): { periodo: number; anio: number } {
  const balances = previews.filter(
    (preview) =>
      preview.persistable &&
      (preview.documentType === "balanza" ||
        preview.documentType === "master_workbook"),
  );
  if (balances.length > 1) {
    throw new AppError(
      "QUALITY_ERROR",
      "El lote contiene dos balanzas para el mismo periodo.",
      422,
    );
  }

  const periodDrivers = previews.filter(
    (preview) =>
      preview.persistable &&
      (preview.documentType === "balanza" ||
        preview.documentType === "master_workbook" ||
        preview.documentType === "flujo_efectivo" ||
        preview.documentType === "auxiliar_cuentas" ||
        preview.documentType === "diarios_polizas"),
  );
  const periods = new Set(
    periodDrivers
      .filter((preview) => preview.inferredPeriodo && preview.inferredAnio)
      .map((preview) => `${preview.inferredAnio}-${preview.inferredPeriodo}`),
  );
  if (periods.size > 1) {
    throw new AppError(
      "QUALITY_ERROR",
      "Los documentos persistibles mezclan periodos distintos.",
      422,
    );
  }

  const driver = periodDrivers.find(
    (preview) => preview.inferredPeriodo && preview.inferredAnio,
  );
  if (!driver?.inferredPeriodo || !driver.inferredAnio) {
    return session;
  }
  void useFilePeriod;
  // El Excel es la fuente de verdad: una balanza de julio no debe colgarse
  // del mes de sesión (p. ej. junio, el último del historial sintético).
  return { periodo: driver.inferredPeriodo, anio: driver.inferredAnio };
}
