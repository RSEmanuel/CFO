export const DEMO_TENANT_RFC = "CSI980315XX1";

export const EMPTY_COMPAC_TENANT = {
  name: "Cliente Compac (balanza julio 2026)",
  rfc: "COMPAC260731XXX",
} as const;

export const EMPTY_COMPAC_USERS = {
  partnerEmail: "compac.partner@cfo.mx",
  viewerEmail: "compac.viewer@cfo.mx",
} as const;

export function normalizeTenantRfc(rfc: string): string {
  return rfc.trim().toUpperCase();
}
