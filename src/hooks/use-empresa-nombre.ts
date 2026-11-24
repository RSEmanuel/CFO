"use client";

import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";

/** Nombre de la empresa activa para nombrar archivos exportados. */
export function useEmpresaNombre(): string {
  const { t } = useLocale();
  const { tenantId, tenants, user } = useSession();
  return (
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback")
  );
}
