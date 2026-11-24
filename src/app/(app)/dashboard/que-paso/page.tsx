"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import { formatDate } from "@/i18n/format";
import { apiRequest } from "@/lib/api";
import type { ActivityFeedView, ActivityItem } from "@/services/admin/activityFeed";
import { describeActivity } from "@/services/admin/activitySentence";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Qué pasó: una sola lista, la más reciente arriba, con los movimientos de personas y de archivos de la
 * empresa abierta. El equipo cambia de empresa con el selector del menú; el cliente nunca entra.
 */
export default function QuePasoPage() {
  const { user, effectiveRole, tenants, tenantId } = useSession();
  const { t } = useLocale();
  const allowed = Boolean(effectiveRole && USER_ADMIN_ROLES.includes(effectiveRole));
  const company = tenants.find((item) => item.id === tenantId)?.name ?? user?.tenant.name ?? "—";

  const [view, setView] = useState<ActivityFeedView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!allowed || !tenantId) {
      return;
    }
    let cancelled = false;
    setView(null);
    setLoadFailed(false);
    apiRequest<ActivityFeedView>(`/api/admin/activity?tenantId=${encodeURIComponent(tenantId)}`)
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, tenantId]);

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("activity.title")}</CardTitle>
          <CardDescription>{t("activity.viewerOnly")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const header = (
    <div className="space-y-1">
      <p className="text-2xl font-medium tracking-tight text-clay">{t("activity.title")}</p>
      {tenantId ? (
        <>
          <p className="text-sm text-foreground">{t("activity.subtitle", { company })}</p>
          <p className="text-xs text-muted-foreground">{t("activity.switchHint")}</p>
        </>
      ) : null}
    </div>
  );

  if (!tenantId) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-sm text-muted-foreground">{t("activity.selectCompany")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {loadFailed ? (
        <Card>
          <CardContent className="pt-6 text-sm">{t("activity.loadFailed")}</CardContent>
        </Card>
      ) : null}

      {view ? (
        <Card>
          <CardContent className="p-0">
            {view.items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">{t("activity.empty")}</p>
            ) : (
              <ol className="divide-y divide-border">
                {view.items.map((item) => (
                  <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      ) : null}

      {view?.truncated ? (
        <p className="text-xs text-muted-foreground">{t("activity.truncated", { count: view.items.length })}</p>
      ) : null}
    </div>
  );
}

/**
 * Archivo aceptado -> punto sólido (ya está en tus cifras). Rechazado o sin guardar -> óvalo sin punto.
 * Los movimientos de personas no son datos contables y llevan un ícono neutro.
 */
function ActivityRow({ item }: { item: ActivityItem }) {
  const { locale, t } = useLocale();
  const sentence = describeActivity(item, t, locale);
  const when = formatDate(item.at, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="flex items-start gap-3 px-4 py-3 md:px-6">
      <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        {item.kind === "load" ? (
          <CifraMark state={item.state === "SAVED" ? "confirmed" : "missing"} size={16} />
        ) : (
          <UserRound className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="break-words text-sm text-foreground">{sentence}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{item.kind === "load" ? t("activity.kindLoad") : t("activity.kindUser")}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.at} className="cifra-num">
            {when}
          </time>
        </p>
      </div>
    </li>
  );
}
