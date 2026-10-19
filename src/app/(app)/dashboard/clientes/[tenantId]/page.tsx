"use client";

import { TenantUsersPanel } from "@/components/clients/TenantUsersPanel";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import { ArrowLeft, LineChart } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

/** Detalle de un cliente: sus personas con acceso y la entrada a sus cifras. */
export default function ClienteDetallePage() {
  const params = useParams<{ tenantId: string }>();
  const router = useRouter();
  const { effectiveRole, tenants, loading, setTenantId } = useSession();
  const { t } = useLocale();
  const canManage = Boolean(effectiveRole && USER_ADMIN_ROLES.includes(effectiveRole));
  const tenantId = decodeURIComponent(params.tenantId);
  const client = tenants.find((item) => item.id === tenantId);

  const back = (
    <Link href="/dashboard/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {t("nav.clients")}
    </Link>
  );

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.clients")}</CardTitle>
          <CardDescription>{t("clients.teamOnly")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        {back}
        <p className="text-sm text-muted-foreground">{loading ? t("common.loading") : t("clients.notFound")}</p>
      </div>
    );
  }

  function openNumbers(): void {
    setTenantId(tenantId);
    router.push("/dashboard/control");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {back}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight text-clay">{client.name}</p>
            <p className="cifra-num mt-1 text-sm text-muted-foreground">{client.rfc}</p>
          </div>
          <Button type="button" className="gap-2" onClick={openNumbers}>
            <LineChart className="h-4 w-4" aria-hidden />
            {t("clients.openNumbers")}
          </Button>
        </div>
      </div>
      <TenantUsersPanel tenantId={tenantId} companyName={client.name} />
    </div>
  );
}
