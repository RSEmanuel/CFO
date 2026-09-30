import { prisma, requireCurrentPrismaClient } from "@/lib/prisma";
import type { MasterWorkbook } from "@/services/ingestionTypes";

const CREATE_MANY_CHUNK = 800;

async function createManyInChunks<T>(
  insert: (chunk: T[]) => Promise<unknown>,
  rows: T[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += CREATE_MANY_CHUNK) {
    await insert(rows.slice(index, index + CREATE_MANY_CHUNK));
  }
}

export type PersistenceCounts = {
  balanza: number;
  ventas: number;
  egresos: number;
  tesoreria: number;
  auxiliarMovimientos: number;
  polizas: number;
  polizaMovimientos: number;
};

export interface IngestionRepository {
  replaceBalance(
    tenantId: string,
    periodo: number,
    anio: number,
    workbook: MasterWorkbook,
    auditBatchId?: string,
  ): Promise<void>;
}

export class PrismaIngestionRepository implements IngestionRepository {
  async replaceBalance(
    tenantId: string,
    periodo: number,
    anio: number,
    workbook: MasterWorkbook,
    auditBatchId?: string,
  ): Promise<void> {
    const persistAuxiliar =
      workbook.auxiliarMovimientos.length > 0 || workbook.auxiliarResumen.length > 0;
    const persistPolizas = workbook.polizas.length > 0 || workbook.polizaMovimientos.length > 0;
    if (persistAuxiliar || persistPolizas) {
      requireCurrentPrismaClient();
    }
    await prisma.$transaction(async (tx) => {
      if (workbook.balanza.length > 0) {
        await tx.balanzaPnL.deleteMany({ where: { tenantId, periodo, anio } });
        await tx.balanzaPnL.createMany({
          data: workbook.balanza.map((row) => ({
            tenantId,
            idCuenta: row.idCuenta,
            nombreCuenta: row.nombreCuenta,
            categoriaMaestra: row.categoriaMaestra,
            saldoInicial: row.saldoInicial,
            debe: row.debe,
            haber: row.haber,
            saldoFinal: row.saldoFinal,
            montoPresupuestado: row.montoPresupuestado,
            depreciacionAmortizacion: row.depreciacionAmortizacion,
            periodo: row.periodo,
            anio: row.anio,
          })),
        });
      }
      if (workbook.tesoreria.length > 0) {
        await tx.tesoreriaFlujo.deleteMany({ where: { tenantId, periodo, anio } });
        await tx.tesoreriaFlujo.createMany({
          data: workbook.tesoreria.map((row) => ({
            tenantId,
            idBancoCaja: row.idBancoCaja,
            saldoInicialPeriodo: row.saldoInicialPeriodo,
            entradasOperativas: row.entradasOperativas,
            salidasOperativas: row.salidasOperativas,
            salidasCapex: row.salidasCapex,
            servicioDeuda: row.servicioDeuda,
            saldoFinalPeriodo: row.saldoFinalPeriodo,
            periodo: row.periodo,
            anio: row.anio,
          })),
        });
      }
      if (workbook.tesoreriaDetalle.length > 0) {
        await tx.tesoreriaFlujoDetalle.deleteMany({ where: { tenantId, periodo, anio } });
        await tx.tesoreriaFlujoDetalle.createMany({
          data: workbook.tesoreriaDetalle.map((row) => ({
            tenantId,
            idBancoCaja: row.idBancoCaja,
            direccion: row.direccion,
            categoriaKey: row.categoriaKey,
            labelOrigen: row.labelOrigen,
            monto: row.monto,
            esTraspaso: row.esTraspaso,
            orden: row.orden,
            periodo: row.periodo,
            anio: row.anio,
          })),
        });
      }
      if (workbook.auxiliarMovimientos.length > 0) {
        const monedas = [...new Set(workbook.auxiliarMovimientos.map((row) => row.moneda))];
        await tx.auxiliarMovimiento.deleteMany({
          where: { tenantId, periodo, anio, moneda: { in: monedas } },
        });
        const movimientoRows = workbook.auxiliarMovimientos.map((row) => ({
          tenantId,
          anio: row.anio,
          periodo: row.periodo,
          moneda: row.moneda,
          idCuenta: row.idCuenta,
          nombreCuenta: row.nombreCuenta,
          fecha: row.fecha,
          tipoPoliza: row.tipoPoliza,
          numeroPoliza: row.numeroPoliza,
          concepto: row.concepto,
          referencia: row.referencia,
          cargos: row.cargos,
          abonos: row.abonos,
          saldo: row.saldo,
        }));
        await createManyInChunks((data) => tx.auxiliarMovimiento.createMany({ data }), movimientoRows);
      }
      if (workbook.auxiliarResumen.length > 0) {
        const monedas = [...new Set(workbook.auxiliarResumen.map((row) => row.moneda))];
        await tx.auxiliarCuentaResumen.deleteMany({
          where: { tenantId, periodo, anio, moneda: { in: monedas } },
        });
        const resumenRows = workbook.auxiliarResumen.map((row) => ({
          tenantId,
          anio: row.anio,
          periodo: row.periodo,
          moneda: row.moneda,
          idCuenta: row.idCuenta,
          nombreCuenta: row.nombreCuenta,
          saldoInicial: row.saldoInicial,
          cargos: row.cargos,
          abonos: row.abonos,
          saldoFinal: row.saldoFinal,
        }));
        await createManyInChunks((data) => tx.auxiliarCuentaResumen.createMany({ data }), resumenRows);
      }
      if (persistPolizas) {
        // Idempotencia scoped: se reemplaza el periodo completo de pólizas.
        await tx.polizaMovimiento.deleteMany({ where: { tenantId, periodo, anio } });
        await tx.poliza.deleteMany({ where: { tenantId, periodo, anio } });
        if (workbook.polizas.length > 0) {
          const polizaRows = workbook.polizas.map((row) => ({
            tenantId,
            anio: row.anio,
            periodo: row.periodo,
            tipo: row.tipo,
            numero: row.numero,
            fecha: row.fecha,
            concepto: row.concepto,
            totalCargos: row.totalCargos,
            totalAbonos: row.totalAbonos,
            cuadrada: row.cuadrada,
            movimientosCount: row.movimientosCount,
          }));
          await createManyInChunks((data) => tx.poliza.createMany({ data }), polizaRows);
        }
        if (workbook.polizaMovimientos.length > 0) {
          const movimientoRows = workbook.polizaMovimientos.map((row) => ({
            tenantId,
            anio: row.anio,
            periodo: row.periodo,
            tipoPoliza: row.tipoPoliza,
            numeroPoliza: row.numeroPoliza,
            numeroMovimiento: row.numeroMovimiento,
            codigoCuenta: row.codigoCuenta,
            nombreCuenta: row.nombreCuenta,
            referencia: row.referencia,
            concepto: row.concepto,
            cargo: row.cargo,
            abono: row.abono,
          }));
          await createManyInChunks((data) => tx.polizaMovimiento.createMany({ data }), movimientoRows);
        }
      }
      if (auditBatchId) {
        await tx.ingestBatch.update({
          where: { id: auditBatchId },
          data: {
            status: "COMMITTED",
            periodo,
            anio,
            counts: {
              balanza: workbook.balanza.length,
              ventas: 0,
              egresos: 0,
              tesoreria: workbook.tesoreria.length,
              auxiliarMovimientos: workbook.auxiliarMovimientos.length,
              polizas: workbook.polizas.length,
              polizaMovimientos: workbook.polizaMovimientos.length,
            },
            files: { updateMany: { where: {}, data: { status: "COMMITTED" } } },
          },
        });
      }
    }, { maxWait: 15_000, timeout: 60_000 });
  }
}

export const ingestionRepository = new PrismaIngestionRepository();
