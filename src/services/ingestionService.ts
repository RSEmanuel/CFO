import { AppError } from "@/auth/errors";
import { prisma } from "@/lib/prisma";
import { collectQualityIssues } from "@/services/financialValidations";
import { mapToMasterWorkbook } from "@/services/ingest/applyMapping";
import { resolveBatchPeriod } from "@/services/ingest/batchPolicy";
import type { DetectResult, MappingProfileShape } from "@/services/ingest/types";
import { detectDocument } from "@/services/ingest/detectDocument";
import { listEffectiveProfiles, loadProfileById } from "@/services/ingest/profileStore";
import { getIngestLimits, validateFileCount, validateWorkbookContainer } from "@/services/ingest/limits";
import { ingestionRepository } from "@/services/ingest/ingestionRepository";
import type { MasterWorkbook, QualityIssue } from "@/services/ingestionTypes";
import { parseMasterWorkbook } from "@/services/workbookParser";
import { Prisma } from "@/generated/prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { getDataCapabilities, type MissingInput } from "@/services/dataCapabilities";
import { classifyCommitOutcome } from "@/services/ingest/outcome";

export type IngestUploadInput = {
  tenantId: string;
  periodo: number;
  anio: number;
  filename: string;
  buffer: Buffer;
  userId?: string;
};

export type IngestUploadResult = {
  tenantId: string;
  periodo: number;
  anio: number;
  counts: {
    balanza: number;
    ventas: number;
    egresos: number;
    tesoreria: number;
    auxiliarMovimientos: number;
    polizas: number;
    polizaMovimientos: number;
  };
  outcome?: "COMMITTED" | "COMMITTED_WITH_WARNINGS";
  availableModules?: string[];
  missingInputs?: MissingInput[];
};

async function commitAvailability(
  tenantId: string,
  warnings: QualityIssue[],
): Promise<Pick<IngestUploadResult, "outcome" | "availableModules" | "missingInputs">> {
  const availability = await getDataCapabilities(tenantId);
  const availableModules = Object.entries(availability.capabilities)
    .filter(([, available]) => available)
    .map(([module]) => module);
  return {
    outcome: classifyCommitOutcome(warnings.length, availability.missingInputs.length),
    availableModules,
    missingInputs: availability.missingInputs,
  };
}

function periodDateRange(anio: number, periodo: number): { gte: Date; lte: Date } {
  const gte = new Date(anio, periodo - 1, 1);
  const lte = new Date(anio, periodo, 0, 23, 59, 59, 999);
  return { gte, lte };
}

type PersistFlags = {
  balanza: boolean;
  ventas: boolean;
  egresos: boolean;
  tesoreria: boolean;
};

const ALL_SLICES: PersistFlags = {
  balanza: true,
  ventas: true,
  egresos: true,
  tesoreria: true,
};

async function persistWorkbook(
  tenantId: string,
  periodo: number,
  anio: number,
  workbook: MasterWorkbook,
  flags: PersistFlags = ALL_SLICES,
): Promise<void> {
  const fechas = periodDateRange(anio, periodo);

  await prisma.$transaction(async (tx) => {
    if (flags.balanza) {
      await tx.balanzaPnL.deleteMany({ where: { tenantId, periodo, anio } });
    }
    if (flags.tesoreria) {
      await tx.tesoreriaFlujo.deleteMany({ where: { tenantId, periodo, anio } });
    }
    if (flags.ventas) {
      await tx.auxiliarVentas.deleteMany({
        where: { tenantId, fechaEmision: fechas },
      });
    }
    if (flags.egresos) {
      await tx.auxiliarEgresos.deleteMany({
        where: { tenantId, fechaEmision: fechas },
      });
    }

    if (flags.balanza && workbook.balanza.length > 0) {
      await tx.balanzaPnL.createMany({
        data: workbook.balanza.map((fila) => ({
          tenantId,
          idCuenta: fila.idCuenta,
          nombreCuenta: fila.nombreCuenta,
          categoriaMaestra: fila.categoriaMaestra,
          saldoInicial: fila.saldoInicial,
          debe: fila.debe,
          haber: fila.haber,
          saldoFinal: fila.saldoFinal,
          montoPresupuestado: fila.montoPresupuestado,
          depreciacionAmortizacion: fila.depreciacionAmortizacion,
          periodo: fila.periodo,
          anio: fila.anio,
        })),
      });
    }

    if (flags.ventas && workbook.ventas.length > 0) {
      await tx.auxiliarVentas.createMany({
        data: workbook.ventas.map((fila) => ({
          tenantId,
          idCliente: fila.idCliente,
          nombreCliente: fila.nombreCliente,
          folioFactura: fila.folioFactura,
          fechaEmision: fila.fechaEmision,
          fechaVencimiento: fila.fechaVencimiento,
          montoSubtotal: fila.montoSubtotal,
          iva: fila.iva,
          montoCobrado: fila.montoCobrado,
          estatusPago: fila.estatusPago,
          lineaNegocio: fila.lineaNegocio,
        })),
      });
    }

    if (flags.egresos && workbook.egresos.length > 0) {
      await tx.auxiliarEgresos.createMany({
        data: workbook.egresos.map((fila) => ({
          tenantId,
          idProveedor: fila.idProveedor,
          nombreProveedor: fila.nombreProveedor,
          folioDocumento: fila.folioDocumento,
          fechaEmision: fila.fechaEmision,
          fechaVencimiento: fila.fechaVencimiento,
          montoSubtotal: fila.montoSubtotal,
          centroDeCostos: fila.centroDeCostos,
          clasificacionGasto: fila.clasificacionGasto,
          tipoInversion: fila.tipoInversion,
          estatusPago: fila.estatusPago,
        })),
      });
    }

    if (flags.tesoreria && workbook.tesoreria.length > 0) {
      await tx.tesoreriaFlujo.createMany({
        data: workbook.tesoreria.map((fila) => ({
          tenantId,
          idBancoCaja: fila.idBancoCaja,
          saldoInicialPeriodo: fila.saldoInicialPeriodo,
          entradasOperativas: fila.entradasOperativas,
          salidasOperativas: fila.salidasOperativas,
          salidasCapex: fila.salidasCapex,
          servicioDeuda: fila.servicioDeuda,
          saldoFinalPeriodo: fila.saldoFinalPeriodo,
          periodo: fila.periodo,
          anio: fila.anio,
        })),
      });
    }
  });
}

export async function ingestMasterTemplate(input: IngestUploadInput): Promise<IngestUploadResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }

  if (!Number.isInteger(input.periodo) || input.periodo < 1 || input.periodo > 12) {
    throw new AppError("VALIDATION_ERROR", "El periodo debe ser un entero entre 1 y 12.", 400);
  }

  const workbook = await parseMasterWorkbook(input.buffer, input.filename);
  if (
    workbook.balanza.length === 0 ||
    workbook.tesoreria.length === 0
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La plantilla debe incluir al menos una fila en balanza_pnl y tesoreria_flujo.",
      400,
    );
  }

  const issues = collectQualityIssues(workbook, input.anio, input.periodo);
  if (issues.length > 0) {
    throw new AppError(
      "QUALITY_ERROR",
      "La plantilla no superó las reglas de calidad. No se persistió ningún dato.",
      422,
      { issues },
    );
  }

  await persistWorkbook(input.tenantId, input.periodo, input.anio, workbook);

  const counts = {
    balanza: workbook.balanza.length,
    ventas: workbook.ventas.length,
    egresos: workbook.egresos.length,
    tesoreria: workbook.tesoreria.length,
    auxiliarMovimientos: 0,
    polizas: 0,
    polizaMovimientos: 0,
  };

  if (input.userId) {
    const totalRows = counts.balanza + counts.ventas + counts.egresos + counts.tesoreria;
    await prisma.ingestBatch.create({
      data: {
        detectionId: randomUUID(),
        tenantId: input.tenantId,
        userId: input.userId,
        status: "COMMITTED",
        periodo: input.periodo,
        anio: input.anio,
        fileCount: 1,
        counts,
        files: {
          create: [
            {
              tenantId: input.tenantId,
              userId: input.userId,
              sha256: createHash("sha256").update(input.buffer).digest("hex"),
              originalName: input.filename,
              periodo: input.periodo,
              anio: input.anio,
              rowsRead: totalRows,
              rowsAccepted: totalRows,
              status: "COMMITTED",
            },
          ],
        },
      },
    });
  }

  return {
    tenantId: input.tenantId,
    periodo: input.periodo,
    anio: input.anio,
    counts,
  };
}

export type IngestFileInput = {
  filename: string;
  buffer: Buffer;
};

export async function previewIngestFiles(
  tenantId: string,
  userId: string,
  files: IngestFileInput[],
): Promise<{ detectionId: string; previews: DetectResult[] }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }
  validateFileCount(files.length);
  const limits = getIngestLimits();
  const profiles = await listEffectiveProfiles(tenantId);
  const detectionId = randomUUID();
  const previews: DetectResult[] = [];
  try {
    for (const file of files) {
      validateWorkbookContainer(file.buffer, file.filename, limits);
      const result = await detectDocument(file.buffer, file.filename, profiles);
      const profile = result.selectedProfileId
        ? profiles.find((candidate) => candidate.id === result.selectedProfileId)
        : null;
      let mappedRowCount: number | undefined;
      if (
        profile &&
        result.persistable &&
        result.documentType === "balanza" &&
        result.inferredPeriodo &&
        result.inferredAnio
      ) {
        const mapped = await mapToMasterWorkbook({
          buffer: file.buffer,
          filename: file.filename,
          documentType: result.documentType,
          sourceSystem: result.sourceSystem,
          sheetName: result.sheetName,
          profile,
          periodo: result.inferredPeriodo,
          anio: result.inferredAnio,
        });
        mappedRowCount = mapped.workbook.balanza.length;
      }
      previews.push({ ...result, detectionId, mappedRowCount });
    }
  } catch (error) {
    const failed = files[previews.length] ?? files[0];
    await prisma.ingestBatch.create({
      data: {
        detectionId,
        tenantId,
        userId,
        status: "REJECTED",
        fileCount: files.length,
        issues: [error instanceof Error ? error.message : "Error de validación"] as Prisma.InputJsonValue,
        files: failed ? {
          create: [{
            tenantId,
            userId,
            sha256: createHash("sha256").update(failed.buffer).digest("hex"),
            originalName: failed.filename,
            status: "REJECTED",
            errors: [error instanceof Error ? error.message : "Error de validación"] as Prisma.InputJsonValue,
          }],
        } : undefined,
      },
    });
    throw error;
  }
  if (new Set(previews.map((preview) => preview.sha256)).size !== previews.length) {
    throw new AppError("VALIDATION_ERROR", "El lote contiene archivos duplicados.", 400);
  }
  await prisma.ingestBatch.create({
    data: {
      detectionId,
      tenantId,
      userId,
      status: "DETECTED",
      fileCount: files.length,
      files: {
        create: previews.map((preview) => ({
          tenantId,
          userId,
          sha256: preview.sha256,
          originalName: preview.filename,
          profileId: preview.selectedProfileId,
          profileKey: preview.profileCandidates.find((candidate) => candidate.profileId === preview.selectedProfileId)?.profileKey,
          profileVersion: preview.profileCandidates.find((candidate) => candidate.profileId === preview.selectedProfileId)?.profileVersion,
          periodo: preview.inferredPeriodo,
          anio: preview.inferredAnio,
          rowsRead: preview.rowCountEstimate,
          rowsAccepted: preview.mappedRowCount ?? 0,
          status: "DETECTED",
          warnings: preview.notes as Prisma.InputJsonValue,
          errors: preview.errorCode ? [preview.errorCode] : Prisma.JsonNull,
        })),
      },
    },
  });
  return { detectionId, previews };
}

async function commitIngestFilesInternal(input: {
  tenantId: string;
  userId: string;
  periodo: number;
  anio: number;
  files: IngestFileInput[];
  useFilePeriod?: boolean;
  detectionId?: string;
  selectedProfiles?: Record<string, string>;
}): Promise<IngestUploadResult & { warnings: QualityIssue[]; previews: DetectResult[] }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }
  if (!Number.isInteger(input.periodo) || input.periodo < 1 || input.periodo > 12) {
    throw new AppError("VALIDATION_ERROR", "El periodo debe ser un entero entre 1 y 12.", 400);
  }

  validateFileCount(input.files.length);
  const limits = getIngestLimits();
  const profiles = await listEffectiveProfiles(input.tenantId);
  const previews: DetectResult[] = [];
  const merged: MasterWorkbook = {
    balanza: [],
    ventas: [],
    egresos: [],
    tesoreria: [],
    tesoreriaDetalle: [],
    auxiliarMovimientos: [],
    auxiliarResumen: [],
    polizas: [],
    polizaMovimientos: [],
  };
  const warnings: QualityIssue[] = [];
  let partidaDobleMode: "full" | "balance_only" | "off" = "full";
  let periodo = input.periodo;
  let anio = input.anio;

  const prepared: Array<{ file: IngestFileInput; detected: DetectResult; profile: MappingProfileShape | null }> = [];
  for (const file of input.files) {
    validateWorkbookContainer(file.buffer, file.filename, limits);
    let detected = await detectDocument(file.buffer, file.filename, profiles);
    const manuallySelectedId = input.selectedProfiles?.[detected.sha256];
    let profile = manuallySelectedId
      ? await loadProfileById(input.tenantId, manuallySelectedId)
      : detected.selectedProfileId
        ? profiles.find((candidate) => candidate.id === detected.selectedProfileId) ?? null
        : null;
    if (detected.errorCode === "AMBIGUOUS_MAPPING" && !profile) {
      throw new AppError(
        "VALIDATION_ERROR",
        `${file.filename}: selecciona manualmente uno de los perfiles candidatos.`,
        422,
        { previews: [...previews, detected] },
      );
    }
    if (profile) {
      const candidate = detected.profileCandidates.find((item) => item.profileId === profile.id);
      if (!candidate || candidate.score < (profile.matcherConfig.minimumScore ?? 0.7)) {
        throw new AppError("VALIDATION_ERROR", `${file.filename}: el perfil seleccionado no coincide con el contenido.`, 422);
      }
      detected = {
        ...detected,
        sourceSystem: profile.sourceSystem,
        documentType: profile.documentType,
        persistable:
          profile.documentType === "balanza" ||
          profile.documentType === "flujo_efectivo" ||
          profile.documentType === "auxiliar_cuentas" ||
          profile.documentType === "diarios_polizas" ||
          profile.sourceSystem === "master_template",
        selectedProfileId: profile.id,
        errorCode: undefined,
      };
    }
    previews.push(detected);
    prepared.push({ file, detected, profile });
  }
  if (new Set(previews.map((preview) => preview.sha256)).size !== previews.length) {
    throw new AppError("VALIDATION_ERROR", "El lote contiene archivos duplicados.", 400);
  }
  if (input.detectionId) {
    const detectedBatch = await prisma.ingestBatch.findFirst({
      where: { detectionId: input.detectionId, tenantId: input.tenantId, userId: input.userId },
      include: { files: true },
    });
    const expected = new Set(detectedBatch?.files.map((file) => file.sha256) ?? []);
    if (!detectedBatch || expected.size !== previews.length || previews.some((preview) => !expected.has(preview.sha256))) {
      throw new AppError("VALIDATION_ERROR", "Los archivos cambiaron desde la detección. Vuelve a analizarlos.", 409);
    }
  }
  ({ periodo, anio } = resolveBatchPeriod(
    previews,
    { periodo: input.periodo, anio: input.anio },
    input.useFilePeriod,
  ));

  for (const { file, detected, profile } of prepared) {
    if (!detected.persistable) {
      warnings.push({
        rule: "PARSEO",
        severity: "WARNING",
        message: `${file.filename}: ${detected.notes[0] ?? "sin mapeo automático"}. No se persistió.`,
      });
      continue;
    }
    if (detected.documentType === "master_workbook") continue;
    const mapped = await mapToMasterWorkbook({
      buffer: file.buffer,
      filename: file.filename,
      documentType: detected.documentType,
      sourceSystem: detected.sourceSystem,
      sheetName: detected.sheetName,
      profile,
      periodo,
      anio,
    });
    detected.mappedRowCount =
      mapped.workbook.balanza.length ||
      mapped.workbook.tesoreriaDetalle.length ||
      mapped.workbook.auxiliarMovimientos.length ||
      mapped.workbook.polizas.length;
    warnings.push(...mapped.warnings);
    merged.balanza.push(...mapped.workbook.balanza);
    merged.ventas.push(...mapped.workbook.ventas);
    merged.egresos.push(...mapped.workbook.egresos);
    merged.tesoreria.push(...mapped.workbook.tesoreria);
    merged.tesoreriaDetalle.push(...mapped.workbook.tesoreriaDetalle);
    merged.auxiliarMovimientos.push(...mapped.workbook.auxiliarMovimientos);
    merged.auxiliarResumen.push(...mapped.workbook.auxiliarResumen);
    merged.polizas.push(...mapped.workbook.polizas);
    merged.polizaMovimientos.push(...mapped.workbook.polizaMovimientos);
    if (profile && detected.documentType === "balanza") {
      partidaDobleMode = profile.partidaDobleMode;
    }
  }

  const master = prepared.find(({ detected }) => detected.documentType === "master_workbook" && detected.persistable);
  if (master) {
    const result = await ingestMasterTemplate({
      tenantId: input.tenantId,
      periodo,
      anio,
      filename: master.file.filename,
      buffer: master.file.buffer,
      userId: input.detectionId ? undefined : input.userId,
    });
    if (input.detectionId) {
      const masterBatch = await prisma.ingestBatch.findFirst({
        where: { detectionId: input.detectionId, tenantId: input.tenantId },
      });
      if (masterBatch) {
        await prisma.ingestBatch.update({
          where: { id: masterBatch.id },
          data: { status: "COMMITTED", periodo, anio, counts: result.counts },
        });
        await prisma.ingestFileAudit.updateMany({
          where: { batchId: masterBatch.id },
          data: { status: "COMMITTED", periodo, anio },
        });
      }
    }
    return {
      ...result,
      ...(await commitAvailability(input.tenantId, warnings)),
      warnings,
      previews,
    };
  }

  if (merged.balanza.length === 0 && merged.tesoreria.length === 0 && merged.auxiliarMovimientos.length === 0 && merged.polizas.length === 0) {
    throw new AppError(
      "QUALITY_ERROR",
      "Ningún archivo produjo una balanza, flujo de efectivo, auxiliar o póliza usable. No se persistió ningún dato.",
      422,
      { issues: warnings, previews },
    );
  }

  const tesoreriaFromReporte = prepared.some(
    ({ detected }) => detected.persistable && detected.documentType === "flujo_efectivo",
  );
  const quality = collectQualityIssues(merged, anio, periodo, new Date(), {
    partidaDobleMode,
    requireTesoreria: merged.tesoreria.length > 0,
    skipTesoreriaChecks: tesoreriaFromReporte,
  });
  const errors = quality.filter((issue) => issue.severity === "ERROR");
  const allWarnings = [...warnings, ...quality.filter((issue) => issue.severity === "WARNING")];
  if (errors.length > 0) {
    throw new AppError(
      "QUALITY_ERROR",
      "La carga no superó las reglas de calidad. No se persistió ningún dato.",
      422,
      { issues: [...errors, ...allWarnings], previews },
    );
  }

  const profile = prepared.find(({ detected }) => detected.persistable)?.profile;
  const sha256 = prepared.find(({ detected }) => detected.persistable)?.detected.sha256;
  const previous = sha256 && profile
    ? await prisma.ingestFileAudit.findFirst({
        where: {
          tenantId: input.tenantId,
          sha256,
          profileKey: profile.profileKey,
          profileVersion: profile.version,
          periodo,
          anio,
          status: "COMMITTED",
        },
        include: { batch: true },
      })
    : null;
  if (previous) {
    return {
      tenantId: input.tenantId,
      periodo,
      anio,
      counts: (previous.batch.counts as IngestUploadResult["counts"] | null) ?? {
        balanza: merged.balanza.length, ventas: 0, egresos: 0, tesoreria: 0, auxiliarMovimientos: 0,
        polizas: merged.polizas.length, polizaMovimientos: merged.polizaMovimientos.length,
      },
      warnings: allWarnings,
      previews,
      ...(await commitAvailability(input.tenantId, allWarnings)),
    };
  }
  let auditBatch = input.detectionId
    ? await prisma.ingestBatch.findFirst({ where: { detectionId: input.detectionId, tenantId: input.tenantId } })
    : null;
  if (!auditBatch) {
    auditBatch = await prisma.ingestBatch.create({
      data: {
        detectionId: randomUUID(),
        tenantId: input.tenantId,
        userId: input.userId,
        status: "VALIDATED",
        periodo,
        anio,
        fileCount: prepared.length,
        files: {
          create: prepared.map(({ file, detected, profile: selected }) => ({
            tenantId: input.tenantId,
            userId: input.userId,
            sha256: detected.sha256,
            originalName: file.filename,
            profileId: selected?.id,
            profileKey: selected?.profileKey,
            profileVersion: selected?.version,
            periodo: detected.persistable ? periodo : detected.inferredPeriodo,
            anio: detected.persistable ? anio : detected.inferredAnio,
            rowsRead: detected.rowCountEstimate,
            rowsAccepted: detected.persistable ? merged.balanza.length : 0,
            status: "VALIDATED",
            warnings: detected.notes as Prisma.InputJsonValue,
          })),
        },
      },
    });
  } else {
    await prisma.ingestBatch.update({
      where: { id: auditBatch.id },
      data: {
        status: "VALIDATED",
        periodo,
        anio,
        issues: allWarnings as unknown as Prisma.InputJsonValue,
        files: {
          updateMany: {
            where: {},
            data: { status: "VALIDATED" },
          },
        },
      },
    });
  }
  await ingestionRepository.replaceBalance(input.tenantId, periodo, anio, merged, auditBatch.id);

  return {
    tenantId: input.tenantId,
    periodo,
    anio,
    counts: {
      balanza: merged.balanza.length,
      ventas: merged.ventas.length,
      egresos: merged.egresos.length,
      tesoreria: merged.tesoreria.length,
      auxiliarMovimientos: merged.auxiliarMovimientos.length,
      polizas: merged.polizas.length,
      polizaMovimientos: merged.polizaMovimientos.length,
    },
    warnings: allWarnings,
    previews,
    ...(await commitAvailability(input.tenantId, allWarnings)),
  };
}

export async function commitIngestFiles(
  input: Parameters<typeof commitIngestFilesInternal>[0],
): ReturnType<typeof commitIngestFilesInternal> {
  try {
    return await commitIngestFilesInternal(input);
  } catch (error) {
    if (input.detectionId) {
      await prisma.ingestBatch.updateMany({
        where: { detectionId: input.detectionId, tenantId: input.tenantId },
        data: {
          status: "REJECTED",
          issues: [error instanceof Error ? error.message : "Error de validación"] as Prisma.InputJsonValue,
        },
      });
      const batch = await prisma.ingestBatch.findFirst({
        where: { detectionId: input.detectionId, tenantId: input.tenantId },
      });
      if (batch) {
        const auditedFiles = await prisma.ingestFileAudit.findMany({
          where: { batchId: batch.id },
          select: { id: true, rowsRead: true },
        });
        for (const auditedFile of auditedFiles) {
          await prisma.ingestFileAudit.update({
            where: { id: auditedFile.id },
            data: {
              status: "REJECTED",
              rowsRejected: auditedFile.rowsRead,
              errors: [
                error instanceof Error ? error.message : "Error de validación",
              ] as Prisma.InputJsonValue,
            },
          });
        }
      }
    } else {
      const uniqueFiles = [...new Map(input.files.map((file) => [
        createHash("sha256").update(file.buffer).digest("hex"),
        file,
      ])).entries()];
      await prisma.ingestBatch.create({
        data: {
          detectionId: randomUUID(),
          tenantId: input.tenantId,
          userId: input.userId,
          status: "REJECTED",
          fileCount: input.files.length,
          issues: [error instanceof Error ? error.message : "Error de validación"] as Prisma.InputJsonValue,
          files: {
            create: uniqueFiles.map(([sha256, file]) => ({
              tenantId: input.tenantId,
              userId: input.userId,
              sha256,
              originalName: file.filename,
              status: "REJECTED",
              errors: [error instanceof Error ? error.message : "Error de validación"] as Prisma.InputJsonValue,
            })),
          },
        },
      });
    }
    throw error;
  }
}
