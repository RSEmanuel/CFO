export type SessionUser = {
  id: string;
  email: string;
  role: "ADMIN" | "CFO_PARTNER" | "CLIENT_VIEWER";
  tenantId: string;
  isActive: boolean;
  tenant: { id: string; name: string; rfc: string };
};

export type TenantOption = {
  id: string;
  name: string;
  rfc: string;
};

export type QualityIssue = {
  rule: string;
  message: string;
  sheet?: string;
  row?: number;
  severity?: "ERROR" | "WARNING";
};

export type PeriodView = "ytd" | "mensual";

export const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function previousPeriod(anio: number, periodo: number): { anio: number; periodo: number } {
  if (periodo === 1) {
    return { anio: anio - 1, periodo: 12 };
  }
  return { anio, periodo: periodo - 1 };
}
