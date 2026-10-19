"use client";

import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";

const eyebrowClass =
  "mb-1.5 block px-1 font-mono text-[length:var(--cifra-eyebrow-size)] font-medium uppercase leading-[var(--cifra-eyebrow-lh)] tracking-[0.08em] text-muted-foreground";

/**
 * ADMIN y CFO_PARTNER eligen el cliente; quien solo consulta (o la vista de cliente) ve el nombre de su
 * empresa como texto, no como un menú deshabilitado.
 */
export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { effectiveRole, tenants, tenantId, setTenantId } = useSession();
  const { t } = useLocale();
  const locked = effectiveRole === "CLIENT_VIEWER";
  const activeName = tenants.find((item) => item.id === tenantId)?.name ?? t("common.company");

  if (locked) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm font-medium text-foreground",
          collapsed ? "h-10 w-10 justify-center" : "min-h-10 px-1",
        )}
        title={collapsed ? activeName : undefined}
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {collapsed ? (
          <span className="sr-only">{t("common.yourCompanyIs", { name: activeName })}</span>
        ) : (
          <span className="min-w-0 truncate">{activeName}</span>
        )}
      </div>
    );
  }

  return (
    <div>
      {!collapsed ? <span className={eyebrowClass}>{t("common.clientLabel")}</span> : null}
      <Select value={tenantId} onValueChange={setTenantId} disabled={tenants.length === 0}>
        <SelectTrigger
          className={cn("bg-background", collapsed ? "h-10 w-10 justify-center p-0 [&>svg]:hidden" : "w-full")}
          aria-label={t("common.clientCompany")}
          title={collapsed ? activeName : undefined}
        >
          {collapsed ? <Building2 className="h-4 w-4 shrink-0" /> : <SelectValue placeholder={t("common.selectCompany")} />}
        </SelectTrigger>
        <SelectContent>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id}>
              {tenant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
