import type { IngestAuditStatus } from "@/generated/prisma/enums";

/**
 * Cómo se lee un archivo en Control de cargas.
 * - SAVED: está en las cifras (COMMITTED).
 * - REVIEWED_ONLY: se subió y se revisó, pero nadie confirmó el guardado (DETECTED).
 * - INTERRUPTED: pasó la validación y el guardado no terminó (VALIDATED sin COMMITTED).
 * - REJECTED: no pasó las reglas de calidad; no se guardó nada.
 */
export type LoadState = "SAVED" | "REVIEWED_ONLY" | "INTERRUPTED" | "REJECTED";

export function loadStateFor(status: IngestAuditStatus): LoadState {
  switch (status) {
    case "COMMITTED":
      return "SAVED";
    case "DETECTED":
      return "REVIEWED_ONLY";
    case "VALIDATED":
      return "INTERRUPTED";
    case "REJECTED":
      return "REJECTED";
  }
}

/** Un archivo que no quedó guardado en esa carga y tampoco en otra posterior con el mismo contenido. */
export function isPendingLoad(state: LoadState, savedInAnotherLoad: boolean): boolean {
  return state !== "SAVED" && !savedInAnotherLoad;
}
