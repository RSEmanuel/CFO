import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { slugAscii } from "@/services/tableExport";

/**
 * Exportación del escenario What-If. Excel vía la librería `xlsx` (SheetJS,
 * ya instalada para los parsers CONTPAQi). PDF vía `jspdf`, dependencia ya
 * existente en el proyecto (paquete del mes de Resultados): no se agregó
 * ninguna librería nueva.
 */

export type ScenarioRowKind = "money" | "days" | "months" | "pct";

export type ScenarioRow = {
  concept: string;
  base: number | null;
  sim: number | null;
  delta: number | null;
  kind: ScenarioRowKind;
};

export type ScenarioExportInput = {
  tenantName: string;
  periodoLabel: string;
  generatedAt: Date;
  /** [nombre del driver, valor aplicado ya formateado]. */
  driverRows: Array<[string, string]>;
  pnlRows: ScenarioRow[];
  cashRows: ScenarioRow[];
  labels: {
    driversSheet: string;
    pnlSheet: string;
    cashSheet: string;
    driversTitle: string;
    pnlTitle: string;
    cashTitle: string;
    driver: string;
    appliedValue: string;
    concept: string;
    base: string;
    simulated: string;
    delta: string;
    period: string;
    generated: string;
  };
  /** Formateadores por tipo de celda para el PDF (el Excel conserva números). */
  formatters: Record<ScenarioRowKind, (value: number | null) => string>;
};

export function scenarioExportFilename(tenantName: string, periodoLabel: string, kind: "xlsx" | "pdf"): string {
  return `${slugAscii(tenantName)}-simulador-whatif-${slugAscii(periodoLabel)}.${kind}`;
}

function aoaWithHeader(title: string, headers: string[], rows: Array<Array<string | number | null>>): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([[title], [], headers, ...rows]);
}

export function downloadScenarioXlsx(input: ScenarioExportInput): void {
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: `Simulador What-If ${input.periodoLabel}`,
    Author: input.tenantName,
    CreatedDate: input.generatedAt,
  };

  const driversSheet = aoaWithHeader(
    input.labels.driversTitle,
    [input.labels.driver, input.labels.appliedValue],
    input.driverRows,
  );
  driversSheet["!cols"] = [{ wch: 38 }, { wch: 18 }];

  const headers = [input.labels.concept, input.labels.base, input.labels.simulated, input.labels.delta];
  const toAoa = (rows: ScenarioRow[]) => rows.map((row) => [row.concept, row.base, row.sim, row.delta]);
  const pnlSheet = aoaWithHeader(input.labels.pnlTitle, headers, toAoa(input.pnlRows));
  pnlSheet["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  const cashSheet = aoaWithHeader(input.labels.cashTitle, headers, toAoa(input.cashRows));
  cashSheet["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

  XLSX.utils.book_append_sheet(workbook, driversSheet, input.labels.driversSheet.slice(0, 31));
  XLSX.utils.book_append_sheet(workbook, pnlSheet, input.labels.pnlSheet.slice(0, 31));
  XLSX.utils.book_append_sheet(workbook, cashSheet, input.labels.cashSheet.slice(0, 31));
  XLSX.writeFile(workbook, scenarioExportFilename(input.tenantName, input.periodoLabel, "xlsx"));
}

function drawPdfTable(
  doc: jsPDF,
  input: ScenarioExportInput,
  title: string,
  rows: ScenarioRow[],
  startY: number,
): number {
  const colX = [20, 92, 132, 172];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 20, startY);
  const headerY = startY + 8;
  doc.setFontSize(9);
  doc.text(input.labels.concept, colX[0], headerY);
  doc.text(input.labels.base, colX[1], headerY);
  doc.text(input.labels.simulated, colX[2], headerY);
  doc.text(input.labels.delta, colX[3], headerY);
  doc.setLineWidth(0.3);
  doc.line(20, headerY + 2, 190, headerY + 2);

  doc.setFont("helvetica", "normal");
  rows.forEach((row, index) => {
    const y = headerY + 9 + index * 7;
    const format = input.formatters[row.kind];
    doc.text(row.concept, colX[0], y);
    doc.text(format(row.base), colX[1], y);
    doc.text(format(row.sim), colX[2], y);
    doc.text(format(row.delta), colX[3], y);
  });
  return headerY + 9 + rows.length * 7;
}

export function downloadScenarioPdf(input: ScenarioExportInput): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(26, 25, 21);
  doc.text("CFO Virtual", 20, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(input.tenantName, 20, 34);
  doc.text(`${input.labels.period}: ${input.periodoLabel}`, 20, 41);
  doc.text(`${input.labels.generated}: ${input.generatedAt.toISOString().slice(0, 10)}`, 20, 48);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(input.labels.driversTitle, 20, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  input.driverRows.forEach(([driver, value], index) => {
    doc.text(`${driver}: ${value}`, 20, 70 + index * 6);
  });

  const afterPnlY = drawPdfTable(doc, input, input.labels.pnlTitle, input.pnlRows, 70 + input.driverRows.length * 6 + 8);
  drawPdfTable(doc, input, input.labels.cashTitle, input.cashRows, afterPnlY + 8);

  doc.save(scenarioExportFilename(input.tenantName, input.periodoLabel, "pdf"));
}
