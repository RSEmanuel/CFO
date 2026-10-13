import type {
  BalanzaRow,
  EgresoRow,
  MasterWorkbook,
  QualityIssue,
  TesoreriaRow,
  VentaRow,
} from "@/services/ingestionTypes";
import { MONEY_TOLERANCE, nearlyEqual, round2, toNumber } from "@/services/money";

export type LineaBalanza = {
  debe: number | string | { toString(): string };
  haber: number | string | { toString(): string };
};

/**
 * Valida partida doble: suma de Debe debe igualar suma de Haber.
 */
export function assertPartidaDoble(lineas: LineaBalanza[], tolerancia = MONEY_TOLERANCE): void {
  const issues = collectPartidaDobleIssues(
    lineas.map((linea, index) => ({
      row: index + 2,
      debe: toNumber(linea.debe),
      haber: toNumber(linea.haber),
    })),
  );
  if (issues[0]) {
    throw new Error(issues[0].message);
  }
}

export type PartidaDobleMode = "full" | "balance_only" | "off";

export function collectPartidaDobleIssues(
  lineas: Array<Pick<BalanzaRow, "row" | "debe" | "haber"> & { categoriaMaestra?: BalanzaRow["categoriaMaestra"] }>,
  mode: PartidaDobleMode = "full",
): QualityIssue[] {
  if (mode === "off") {
    return [
      {
        rule: "PARTIDA_DOBLE",
        severity: "WARNING",
        sheet: "balanza_pnl",
        message: "Cifra no comparó cargos contra abonos porque el reporte mezcla cuentas de mayor y subcuentas. Si dudas del archivo, revisa sus totales en CONTPAQi.",
      },
    ];
  }
  const scoped =
    mode === "balance_only"
      ? lineas.filter((linea) =>
          linea.categoriaMaestra
            ? ["Activo", "Pasivo", "Patrimonio"].includes(linea.categoriaMaestra)
            : true,
        )
      : lineas;
  const totalDebe = round2(scoped.reduce((acc, linea) => acc + linea.debe, 0));
  const totalHaber = round2(scoped.reduce((acc, linea) => acc + linea.haber, 0));

  if (nearlyEqual(totalDebe, totalHaber)) {
    return [];
  }

  return [
    {
      rule: "PARTIDA_DOBLE",
      severity: "ERROR",
      sheet: "balanza_pnl",
      message: `Los cargos (${totalDebe.toFixed(2)}) no suman lo mismo que los abonos (${totalHaber.toFixed(2)}). Exporta de nuevo la balanza completa desde CONTPAQi.`,
    },
  ];
}

/**
 * Tesorería vs balanza: el saldo final de bancos/caja debe cuadrar con las
 * cuentas de balanza cuyo id_cuenta coincide con id_banco_caja.
 */
export function collectConciliacionTesoreriaIssues(
  tesoreria: TesoreriaRow[],
  balanza: BalanzaRow[],
): QualityIssue[] {
  const idsBanco = new Set(tesoreria.map((fila) => fila.idBancoCaja));
  const totalTesoreria = round2(
    tesoreria.reduce((acc, fila) => acc + fila.saldoFinalPeriodo, 0),
  );
  const totalBalanzaCaja = round2(
    balanza
      .filter((fila) => idsBanco.has(fila.idCuenta))
      .reduce((acc, fila) => acc + fila.saldoFinal, 0),
  );

  if (idsBanco.size === 0) {
    return [
      {
        rule: "CONCILIACION_TESORERIA",
        sheet: "tesoreria_flujo",
        message: "La balanza no trae cuentas de bancos o caja para comparar con tu tesorería. Revisa que sea la balanza completa.",
      },
    ];
  }

  const missingInBalanza = [...idsBanco].filter(
    (id) => !balanza.some((fila) => fila.idCuenta === id),
  );
  const issues: QualityIssue[] = missingInBalanza.map((id) => ({
    rule: "CONCILIACION_TESORERIA",
    sheet: "tesoreria_flujo",
    message: `La cuenta de banco ${id} no aparece en la balanza. Revisa que el número de cuenta sea el mismo en ambos archivos.`,
  }));

  if (!nearlyEqual(totalTesoreria, totalBalanzaCaja)) {
    issues.push({
      rule: "CONCILIACION_TESORERIA",
      message: `El saldo de bancos de tesorería (${totalTesoreria.toFixed(2)}) no coincide con el de la balanza (${totalBalanzaCaja.toFixed(2)}). Revisa que ambos archivos sean del mismo mes.`,
    });
  }

  return issues;
}

export function startOfPeriod(anio: number, periodo: number): Date {
  return new Date(anio, periodo - 1, 1);
}

export function endOfPeriod(anio: number, periodo: number): Date {
  return new Date(anio, periodo, 0, 23, 59, 59, 999);
}

function isSamePeriod(fecha: Date, anio: number, periodo: number): boolean {
  return fecha.getFullYear() === anio && fecha.getMonth() + 1 === periodo;
}

function isFutureDate(fecha: Date, ahora: Date): boolean {
  const emision = new Date(fecha);
  emision.setHours(0, 0, 0, 0);
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  return emision > hoy;
}

/**
 * Rechaza fechas de emisión futuras (comparación por día calendario).
 */
export function assertFechaEmisionNoFutura(fechaEmision: Date, ahora = new Date()): void {
  if (isFutureDate(fechaEmision, ahora)) {
    throw new Error("La fecha de emisión no puede ser futura.");
  }
}

export function assertPeriodoValido(periodo: number): void {
  if (!Number.isInteger(periodo) || periodo < 1 || periodo > 12) {
    throw new Error("El periodo debe ser un entero entre 1 y 12.");
  }
}

export function collectFechaIssues(
  ventas: VentaRow[],
  egresos: EgresoRow[],
  anio: number,
  periodo: number,
  ahora = new Date(),
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const revisar = (
    sheet: string,
    fila: { row: number; fechaEmision: Date; fechaVencimiento: Date },
  ) => {
    if (isFutureDate(fila.fechaEmision, ahora)) {
      issues.push({
        rule: "FECHAS",
        sheet,
        row: fila.row,
        message: "La fecha de emisión no puede ser futura.",
      });
    }
    if (fila.fechaVencimiento < fila.fechaEmision) {
      issues.push({
        rule: "FECHAS",
        sheet,
        row: fila.row,
        message: "La fecha de vencimiento no puede ser anterior a la de emisión.",
      });
    }
    if (!isSamePeriod(fila.fechaEmision, anio, periodo)) {
      issues.push({
        rule: "FECHAS",
        sheet,
        row: fila.row,
        message: `La fecha de emisión debe pertenecer al periodo ${periodo}/${anio}.`,
      });
    }
  };

  for (const fila of ventas) {
    revisar("auxiliar_ventas", fila);
  }
  for (const fila of egresos) {
    revisar("auxiliar_egresos", fila);
  }

  return issues;
}

export function collectLimitesAuxiliaresIssues(ventas: VentaRow[], egresos: EgresoRow[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const fila of ventas) {
    const total = round2(fila.montoSubtotal + fila.iva);
    if (fila.montoSubtotal < 0 || fila.iva < 0 || fila.montoCobrado < 0) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: "Los montos de ventas no pueden ser negativos.",
      });
      continue;
    }
    if (fila.montoCobrado - total > MONEY_TOLERANCE) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: `Lo cobrado (${fila.montoCobrado.toFixed(2)}) es mayor que el total de la factura con IVA (${total.toFixed(2)}). Corrige el monto cobrado.`,
      });
    }
    if (fila.estatusPago === "Pagado" && !nearlyEqual(fila.montoCobrado, total)) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: "Una factura «Pagada» debe tener cobrado su total con IVA. Corrige el estatus o el monto cobrado.",
      });
    }
    if (fila.estatusPago === "Pendiente" && fila.montoCobrado + MONEY_TOLERANCE >= total) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: "Una factura «Pendiente» debe tener cobrado menos que su total con IVA. Corrige el estatus o el monto cobrado.",
      });
    }
    if (fila.estatusPago === "Cancelado" && !nearlyEqual(fila.montoCobrado, 0)) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: "Una factura «Cancelada» no puede tener cobros. Corrige el estatus o el monto cobrado.",
      });
    }
  }

  for (const fila of egresos) {
    if (fila.montoSubtotal < 0) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_egresos",
        row: fila.row,
        message: "El subtotal de una factura de proveedor no puede ser negativo. Corrígelo en la plantilla.",
      });
    }
  }

  return issues;
}

/**
 * Identidad de tesorería:
 * saldo_final = saldo_inicial + entradas_operativas - salidas_operativas - salidas_capex - servicio_deuda
 */
export function collectIdentidadTesoreriaIssues(tesoreria: TesoreriaRow[]): QualityIssue[] {
  return tesoreria.flatMap((fila) => {
    const esperado = round2(
      fila.saldoInicialPeriodo +
        fila.entradasOperativas -
        fila.salidasOperativas -
        fila.salidasCapex -
        fila.servicioDeuda,
    );
    if (nearlyEqual(esperado, fila.saldoFinalPeriodo)) {
      return [];
    }
    return [
      {
        rule: "IDENTIDAD_TESORERIA" as const,
        sheet: "tesoreria_flujo",
        row: fila.row,
        message: `El saldo final de este banco no cuadra: debería ser ${esperado.toFixed(2)} y el archivo dice ${fila.saldoFinalPeriodo.toFixed(2)}. Revisa sus entradas y salidas.`,
      },
    ];
  });
}

export function collectPeriodoWorkbookIssues(
  workbook: MasterWorkbook,
  anio: number,
  periodo: number,
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const fila of workbook.balanza) {
    if (fila.periodo !== periodo || fila.anio !== anio) {
      issues.push({
        rule: "PERIODO",
        sheet: "balanza_pnl",
        row: fila.row,
        message: `Esta fila no es del periodo ${periodo}/${anio}. Revisa que el archivo sea del mes correcto.`,
      });
    }
  }
  for (const fila of workbook.tesoreria) {
    if (fila.periodo !== periodo || fila.anio !== anio) {
      issues.push({
        rule: "PERIODO",
        sheet: "tesoreria_flujo",
        row: fila.row,
        message: `Esta fila no es del periodo ${periodo}/${anio}. Revisa que el archivo sea del mes correcto.`,
      });
    }
  }

  return issues;
}

export type QualityOptions = {
  partidaDobleMode?: PartidaDobleMode;
  requireTesoreria?: boolean;
  /** Reportes flujo_efectivo: la conciliación la hace el parser; no aplica contra balanza. */
  skipTesoreriaChecks?: boolean;
};

function withDefaultSeverity(issues: QualityIssue[]): QualityIssue[] {
  return issues.map((issue) => ({ ...issue, severity: issue.severity ?? "ERROR" }));
}

export function collectQualityIssues(
  workbook: MasterWorkbook,
  anio: number,
  periodo: number,
  ahora = new Date(),
  options: QualityOptions = {},
): QualityIssue[] {
  const requireTesoreria = options.requireTesoreria ?? true;
  const tesoreriaIssues = options.skipTesoreriaChecks
    ? []
    : workbook.tesoreria.length === 0
      ? requireTesoreria
        ? withDefaultSeverity(collectConciliacionTesoreriaIssues(workbook.tesoreria, workbook.balanza))
        : [
            {
              rule: "CONCILIACION_TESORERIA" as const,
              severity: "WARNING" as const,
              sheet: "tesoreria_flujo",
              message: "Esta carga no trae tesorería, así que Flujo quedará sin datos. Sube el reporte Flujo de Efectivo de CONTPAQi para verlo.",
            },
          ]
      : [
          ...collectConciliacionTesoreriaIssues(workbook.tesoreria, workbook.balanza),
          ...collectIdentidadTesoreriaIssues(workbook.tesoreria),
        ];

  return withDefaultSeverity([
    ...collectPeriodoWorkbookIssues(workbook, anio, periodo),
    ...collectPartidaDobleIssues(workbook.balanza, options.partidaDobleMode ?? "full"),
    ...tesoreriaIssues,
    ...collectFechaIssues(workbook.ventas, workbook.egresos, anio, periodo, ahora),
    ...collectLimitesAuxiliaresIssues(workbook.ventas, workbook.egresos),
  ]);
}
