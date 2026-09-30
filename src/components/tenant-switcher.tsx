"use client";

import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";

export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { user, tenants, tenantId, setTenantId } = useSession();
  const { t } = useLocale();
  const locked = user?.role === "CLIENT_VIEWER";
  const activeName = tenants.find((item) => item.id === tenantId)?.name ?? t("common.company");

  return (
    <Select value={tenantId} onValueChange={setTenantId} disabled={locked || tenants.length === 0}>
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
  );
}
