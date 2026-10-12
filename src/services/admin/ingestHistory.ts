import { AppError } from "@/auth/errors";
import { prisma } from "@/lib/prisma";
import { isPendingLoad, loadStateFor, type LoadState } from "@/services/admin/loadStatus";

const HISTORY_LIMIT = 200;

export type LoadHistoryRow = {
  id: string;
  batchId: string;
  originalName: string;
  uploadedBy: string;
  uploadedAt: string;
  periodo: number | null;
  anio: number | null;
  state: LoadState;
  /** El mismo archivo (mismo contenido) sí quedó guardado en otra carga de esta empresa. */
  savedInAnotherLoad: boolean;
  pending: boolean;
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
};

export type LoadHistoryView = {
  rows: LoadHistoryRow[];
  totals: Record<LoadState, number> & { files: number; pending: number };
  truncated: boolean;
};

/** Solo lectura sobre IngestFileAudit / IngestBatch, siempre acotado a una empresa. */
export async function getLoadHistory(tenantId: string): Promise<LoadHistoryView> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }

  const [files, savedHashes] = await Promise.all([
    prisma.ingestFileAudit.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT + 1,
      select: {
        id: true,
        batchId: true,
        sha256: true,
        originalName: true,
        createdAt: true,
        periodo: true,
        anio: true,
        status: true,
        rowsRead: true,
        rowsAccepted: true,
        rowsRejected: true,
        user: { select: { email: true } },
      },
    }),
    prisma.ingestFileAudit.findMany({
      where: { tenantId, status: "COMMITTED" },
      select: { sha256: true, batchId: true },
    }),
  ]);

  const savedBatchesByHash = new Map<string, Set<string>>();
  for (const { sha256, batchId } of savedHashes) {
    const batches = savedBatchesByHash.get(sha256) ?? new Set<string>();
    batches.add(batchId);
    savedBatchesByHash.set(sha256, batches);
  }

  const truncated = files.length > HISTORY_LIMIT;
  const rows = files.slice(0, HISTORY_LIMIT).map((file): LoadHistoryRow => {
    const state = loadStateFor(file.status);
    const savedInAnotherLoad =
      state !== "SAVED" &&
      [...(savedBatchesByHash.get(file.sha256) ?? [])].some((batchId) => batchId !== file.batchId);
    return {
      id: file.id,
      batchId: file.batchId,
      originalName: file.originalName,
      uploadedBy: file.user.email,
      uploadedAt: file.createdAt.toISOString(),
      periodo: file.periodo,
      anio: file.anio,
      state,
      savedInAnotherLoad,
      pending: isPendingLoad(state, savedInAnotherLoad),
      rowsRead: file.rowsRead,
      rowsAccepted: file.rowsAccepted,
      rowsRejected: file.rowsRejected,
    };
  });

  const totals = { files: rows.length, pending: 0, SAVED: 0, REVIEWED_ONLY: 0, INTERRUPTED: 0, REJECTED: 0 };
  for (const row of rows) {
    totals[row.state] += 1;
    if (row.pending) {
      totals.pending += 1;
    }
  }

  return { rows, totals, truncated };
}
