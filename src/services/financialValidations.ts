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
        message: "Partida doble no se validó (modo off: típico si el export mezcla cuentas de resultado y padres).",
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
      message: `La balanza no cumple partida doble. Debe=${totalDebe.toFixed(2)} Haber=${totalHaber.toFixed(2)}.`,
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
        message: "No hay cuentas de banco/caja para conciliar contra la balanza.",
      },
    ];
  }

  const missingInBalanza = [...idsBanco].filter(
    (id) => !balanza.some((fila) => fila.idCuenta === id),
  );
  const issues: QualityIssue[] = missingInBalanza.map((id) => ({
    rule: "CONCILIACION_TESORERIA",
    sheet: "tesoreria_flujo",
    message: `La cuenta de tesorería ${id} no existe en balanza_pnl (id_cuenta).`,
  }));

  if (!nearlyEqual(totalTesoreria, totalBalanzaCaja)) {
    issues.push({
      rule: "CONCILIACION_TESORERIA",
      message: `Conciliación tesorería vs balanza fallida. Tesorería=${totalTesoreria.toFixed(2)} Balanza(caja/bancos)=${totalBalanzaCaja.toFixed(2)}.`,
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
        message: `monto_cobrado (${fila.montoCobrado.toFixed(2)}) excede subtotal+IVA (${total.toFixed(2)}).`,
      });
    }
    if (fila.estatusPago === "Pagado" && !nearlyEqual(fila.montoCobrado, total)) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: "Una factura Pagada debe tener monto_cobrado igual a subtotal+IVA.",
      });
    }
    if (fila.estatusPago === "Pendiente" && fila.montoCobrado + MONEY_TOLERANCE >= total) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: "Una factura Pendiente debe tener monto_cobrado menor a subtotal+IVA.",
      });
    }
    if (fila.estatusPago === "Cancelado" && !nearlyEqual(fila.montoCobrado, 0)) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_ventas",
        row: fila.row,
        message: "Una factura Cancelada debe tener monto_cobrado igual a 0.",
      });
    }
  }

  for (const fila of egresos) {
    if (fila.montoSubtotal < 0) {
      issues.push({
        rule: "LIMITES_AUXILIARES",
        sheet: "auxiliar_egresos",
        row: fila.row,
        message: "El monto_subtotal de egresos no puede ser negativo.",
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
        message: `Fórmula de tesorería inválida. Esperado=${esperado.toFixed(2)} Reportado=${fila.saldoFinalPeriodo.toFixed(2)}.`,
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
        message: `La fila no corresponde al periodo ${periodo}/${anio}.`,
      });
    }
  }
  for (const fila of workbook.tesoreria) {
    if (fila.periodo !== periodo || fila.anio !== anio) {
      issues.push({
        rule: "PERIODO",
        sheet: "tesoreria_flujo",
        row: fila.row,
        message: `La fila no corresponde al periodo ${periodo}/${anio}.`,
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
              message: "No hay tesorería en esta carga. El tablero de flujo mostrará N/D.",
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
