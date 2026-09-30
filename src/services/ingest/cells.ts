export function normalizeToken(value: unknown): string {
  const parts = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
  const collapsed: string[] = [];
  for (let index = 0; index < parts.length; ) {
    if (parts[index]?.length === 1 && /[a-z]/.test(parts[index] ?? "")) {
      let end = index;
      while (
        end < parts.length &&
        parts[end]?.length === 1 &&
        /[a-z]/.test(parts[end] ?? "")
      ) {
        end += 1;
      }
      if (end - index >= 2) {
        collapsed.push(parts.slice(index, end).join(""));
        index = end;
        continue;
      }
    }
    collapsed.push(parts[index] ?? "");
    index += 1;
  }
  return collapsed.filter(Boolean).join("_");
}

export function squeezeLetters(value: string): string {
  return normalizeToken(value);
}

export function cellText(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "object" && "text" in (value as { text?: string }) && (value as { text?: string }).text) {
    return String((value as { text: string }).text).trim();
  }
  if (typeof value === "object" && "result" in (value as { result?: unknown })) {
    return cellText((value as { result: unknown }).result);
  }
  if (typeof value === "object" && "richText" in (value as { richText?: Array<{ text: string }> })) {
    return ((value as { richText: Array<{ text: string }> }).richText ?? [])
      .map((part) => part.text)
      .join("")
      .trim();
  }
  return String(value).trim();
}

export function optionalNumber(value: unknown): number {
  if (value == null || value === "") {
    return 0;
  }
  if (typeof value === "object" && "result" in (value as { result?: unknown })) {
    return optionalNumber((value as { result: unknown }).result);
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

export function inferPeriodFromText(blob: string): { periodo: number; anio: number } | null {
  // El rango "del ... al ..." es el periodo del reporte; una "Fecha:" suelta es
  // la fecha de impresión (los auxiliares CONTPAQi la ponen un renglón antes).
  const range = blob.match(/del\s+\d{1,2}\/[A-Za-z]{3,}\/\d{4}\s+al\s+\d{1,2}\/([A-Za-z]{3,})\/(\d{4})/i);
  if (range) {
    const mes = MONTHS[range[1]!.toLowerCase().slice(0, 3)];
    const anio = Number(range[2]);
    if (mes && anio) {
      return { periodo: mes, anio };
    }
  }
  const iso = blob.match(/(\d{4})-(\d{2})/);
  if (iso) {
    const anio = Number(iso[1]);
    const periodo = Number(iso[2]);
    if (periodo >= 1 && periodo <= 12) {
      return { periodo, anio };
    }
  }
  const slash = blob.match(/(\d{1,2})\/([A-Za-z]{3})\/(\d{4})/i);
  if (slash) {
    const mes = MONTHS[slash[2]!.toLowerCase().slice(0, 3)];
    const anio = Number(slash[3]);
    if (mes && anio) {
      return { periodo: mes, anio };
    }
  }
  const numeric = blob.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numeric) {
    const periodo = Number(numeric[2]);
    const anio = Number(numeric[3]);
    if (periodo >= 1 && periodo <= 12) {
      return { periodo, anio };
    }
  }
  return null;
}
