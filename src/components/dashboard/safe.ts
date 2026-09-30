import { formatMxn } from "@/services/money";

export function n(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function arr<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/D";
  }
  return `${value.toFixed(digits)}%`;
}

export function fmtDays(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/D";
  }
  return `${value.toFixed(0)} días`;
}

export function fmtRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/D";
  }
  return `${value.toFixed(2)}x`;
}

export function fmtMoney(value: number | null | undefined, formatted?: string | null): string {
  if (formatted) {
    return formatted;
  }
  return formatMxn(n(value));
}

export function chartMoney(value: unknown): string {
  if (Array.isArray(value)) {
    return fmtMoney(Number(value[0] ?? 0));
  }
  return fmtMoney(typeof value === "number" ? value : Number(value ?? 0));
}
