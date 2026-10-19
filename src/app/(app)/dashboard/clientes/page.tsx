"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { NewClientCard } from "@/components/clients/NewClientCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TableScroll } from "@/components/ui/table-scroll";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import { formatNumber } from "@/i18n/format";
import { apiRequest } from "@/lib/api";
import type { ClientRow } from "@/services/admin/clientDesk";
import { ChevronRight, Mail } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const thClass = "pb-2 pr-4 font-medium";
const tdClass = "py-3 pr-4 align-middle";

/** Escritorio de clientes: todas las empresas, aunque haya una sola. */
export default function ClientesPage() {
  const { effectiveRole } = useSession();
  const { locale, t } = useLocale();
  const canManage = Boolean(effectiveRole && USER_ADMIN_ROLES.includes(effectiveRole));
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setClients(await apiRequest<ClientRow[]>("/api/admin/clients"));
    } catch {
      setClients(null);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (canManage) {
      void load();
    }
  }, [canManage, load]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tracking-tight text-clay">{t("nav.clients")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("clients.help")}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/dashboard/clientes/correo-bienvenida">
            <Mail className="h-4 w-4" aria-hidden />
            {t("welcomeEmail.tab")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("clients.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadFailed ? (
            <p className="text-sm">{t("clients.loadFailed")}</p>
          ) : clients === null ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clients.empty")}</p>
          ) : (
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    <th className={thClass}>{t("clients.colClient")}</th>
                    <th className={thClass}>{t("clients.colRfc")}</th>
                    <th className={`${thClass} text-right`}>{t("clients.colPeople")}</th>
                    <th className={thClass}>{t("clients.colBalanza")}</th>
                    <th className={`${thClass} pr-0`}>
                      <span className="sr-only">{t("clients.open")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const href = `/dashboard/clientes/${encodeURIComponent(client.id)}`;
                    return (
                      <tr key={client.id} className="border-b border-border last:border-0 hover:bg-secondary/60">
                        <td className={tdClass}>
                          <Link href={href} className="font-medium text-foreground hover:text-clay">
                            {client.name}
                          </Link>
                        </td>
                        <td className={`${tdClass} cifra-num text-muted-foreground`}>{client.rfc}</td>
                        <td className={`${tdClass} cifra-num text-right`}>{formatNumber(client.activeUsers, locale)}</td>
                        <td className={tdClass}>
                          <span
                            className={
                              client.hasBalanza
                                ? "inline-flex items-center gap-2 text-foreground"
                                : "inline-flex items-center gap-2 text-muted-foreground"
                            }
                          >
                            <span aria-hidden="true">
                              <CifraMark state={client.hasBalanza ? "confirmed" : "missing"} size={16} />
                            </span>
                            {t(client.hasBalanza ? "clients.balanzaYes" : "clients.balanzaNo")}
                          </span>
                        </td>
                        <td className={`${tdClass} pr-0 text-right`}>
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1 text-sm font-medium text-clay hover:underline"
                            aria-label={t("clients.openAria", { name: client.name })}
                          >
                            {t("clients.open")}
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      <NewClientCard onCreated={() => void load()} />
    </div>
  );
}
