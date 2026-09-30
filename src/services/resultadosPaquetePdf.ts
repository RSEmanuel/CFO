import { jsPDF } from "jspdf";
import { formatAxisTick, type DisplayUnits } from "@/services/money";
import { slugAscii } from "@/services/tableExport";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

export type PaquetePdfRubro = {
  title: string;
  value: number;
  deltaPct: number | null;
};

export type PaquetePdfInput = {
  empresa: string;
  periodo: string;
  generatedAt: Date;
  units: DisplayUnits;
  contextLabel: string | null;
  rubros: PaquetePdfRubro[];
  locale?: Locale;
  labels?: {
    brand: string;
    period: string;
    date: string;
    packageTitle: string;
    rubro: string;
    amount: string;
    variation: string;
    context: string;
    noComparable: string;
  };
};

function formatDelta(deltaPct: number | null, fallback: string): string {
  if (deltaPct == null) {
    return fallback;
  }
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(1)}%`;
}

export function paquetePdfFilename(empresa: string, periodo: string): string {
  return `${slugAscii(empresa)}-resultados-paquete-del-mes-${slugAscii(periodo)}.pdf`;
}

export function buildPaqueteDelMesPdf(input: PaquetePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const dateLabel = formatDate(input.generatedAt, input.locale ?? "es", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const labels = input.labels ?? {
    brand: "CFO Virtual",
    period: `Periodo: ${input.periodo}`,
    date: `Fecha: ${dateLabel}`,
    packageTitle: "Paquete del mes",
    rubro: "Rubro",
    amount: "Monto",
    variation: "Variación",
    context: "Contexto",
    noComparable: "Sin comparativo",
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(26, 25, 21);
  doc.text(labels.brand, 20, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(input.empresa, 20, 40);
  doc.text(labels.period, 20, 48);
  doc.text(labels.date, 20, 56);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(labels.packageTitle, 20, 74);

  const colX = [20, 70, 130, 165];
  const headerY = 86;
  doc.setFontSize(10);
  doc.text(labels.rubro, colX[0], headerY);
  doc.text(labels.amount, colX[1], headerY);
  doc.text(labels.variation, colX[2], headerY);
  doc.text(labels.context, colX[3], headerY);
  doc.setLineWidth(0.3);
  doc.line(20, headerY + 2, 190, headerY + 2);

  doc.setFont("helvetica", "normal");
  input.rubros.forEach((rubro, index) => {
    const y = headerY + 12 + index * 10;
    doc.text(rubro.title, colX[0], y);
    doc.text(formatAxisTick(rubro.value, input.units), colX[1], y);
    doc.text(formatDelta(rubro.deltaPct, labels.noComparable), colX[2], y);
    doc.text(input.contextLabel ?? "—", colX[3], y);
  });

  return doc;
}

export function downloadPaqueteDelMesPdf(input: PaquetePdfInput): void {
  const doc = buildPaqueteDelMesPdf(input);
  doc.save(paquetePdfFilename(input.empresa, input.periodo));
}
