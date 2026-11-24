import { getIngestLimits, type IngestLimits } from "@/services/ingest/limits";
import { leerXlsx } from "@/services/ingest/loaders/xlsx";
import type { DocumentoLeido, Seccion } from "@/services/ingest/types";

export { hojaLegible, type HojaLegible } from "@/services/ingest/loaders/hojaLegible";

/**
 * Lee el archivo una sola vez y lo entrega como `DocumentoLeido`. Hoy solo hay
 * lector de Excel moderno; cada formato nuevo (CSV, TXT, .xls, XML del SAT)
 * será otro lector aquí, sin tocar la detección ni el mapeo.
 */
export async function leerDocumento(
  buffer: Buffer,
  filename: string,
  limits: IngestLimits = getIngestLimits(),
): Promise<DocumentoLeido> {
  return leerXlsx(buffer, filename, limits);
}

/** La hoja cuyo nombre contiene `sheetMatch` (sin acentos), o la primera. */
export function buscarSeccion(documento: DocumentoLeido, sheetMatch: string | null): Seccion | undefined {
  const needle = (sheetMatch ?? "").toLowerCase();
  return (
    documento.secciones.find((seccion) =>
      seccion.nombre
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .includes(needle),
    ) ?? documento.secciones[0]
  );
}
