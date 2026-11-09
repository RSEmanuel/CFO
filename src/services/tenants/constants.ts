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

/**
 * Empresa de demostración con cifras de ejemplo. Vive aparte de cualquier cliente real.
 * El nombre lleva «ejemplo» a propósito: el guion de carga se niega a escribir en otra empresa.
 */
export const EXAMPLE_TENANT = {
  name: "Distribuidora Ejemplo (demostración)",
  rfc: "EJEMPLO261109XX0",
} as const;

export function isExampleTenantRfc(rfc: string | null | undefined): boolean {
  return normalizeTenantRfc(rfc ?? "") === EXAMPLE_TENANT.rfc;
}
