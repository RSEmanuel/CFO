"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TableScroll } from "@/components/ui/table-scroll";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { INGEST_HISTORY_ROLES } from "@/auth/rbac";
import { formatDate, formatNumber, monthLabelKey } from "@/i18n/format";
import type { TranslateFn } from "@/i18n/translate";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { LoadHistoryRow, LoadHistoryView } from "@/services/admin/ingestHistory";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const thClass = "whitespace-nowrap pb-2 pr-4 font-medium";
const tdClass = "py-3 pr-4 align-middle";

export default function ControlCargasPage() {
  const { user, tenants, tenantId } = useSession();
  const { locale, t } = useLocale();
  const allowed = Boolean(user && INGEST_HISTORY_ROLES.includes(user.role));
  const empresa = tenants.find((item) => item.id === tenantId)?.name ?? user?.tenant.name ?? "—";

  const [view, setView] = useState<LoadHistoryView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!allowed || !tenantId) {
      return;
    }
    let cancelled = false;
    setView(null);
    setLoadFailed(false);
    apiRequest<LoadHistoryView>(`/api/ingest/history?tenantId=${encodeURIComponent(tenantId)}`)
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

  const header = (
    <div>
      <p className="text-lg font-bold tracking-tight text-clay">{t("nav.loadControl")}</p>
      <p className="text-sm text-muted-foreground">{t("loads.intro", { company: empresa })}</p>
    </div>
  );

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.loadControl")}</CardTitle>
          <CardDescription>{t("loads.viewerOnly")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!tenantId) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-sm text-muted-foreground">{t("loads.selectCompany")}</p>
      </div>
    );
  }

  const num = (value: number) => formatNumber(value, locale);

  return (
    <div className="space-y-6">
      {header}

      {loadFailed ? (
        <Card>
          <CardContent className="pt-6 text-sm">{t("loads.loadFailed")}</CardContent>
        </Card>
      ) : null}

      {view && view.totals.pending > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card border border-border border-l-4 border-l-[var(--cifra-warn)] bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cifra-warn)]" aria-hidden="true" />
            <span>{t("loads.pendingAlert", { count: view.totals.pending })}</span>
          </p>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/ingesta">{t("loads.goIngest")}</Link>
          </Button>
        </div>
      ) : null}

      {view ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              ["loads.totalFiles", view.totals.files],
              ["loads.totalSaved", view.totals.SAVED],
              ["loads.totalPending", view.totals.pending],
              ["loads.totalRejected", view.totals.REJECTED],
            ] as const
          ).map(([labelKey, value]) => (
            <Card key={labelKey}>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{t(labelKey)}</p>
                <p className="cifra-num text-2xl font-semibold text-foreground">{num(value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("loads.tableTitle")}</CardTitle>
          <CardDescription>{t("loads.tableHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {view && view.rows.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">{t("loads.empty")}</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/ingesta">{t("loads.goIngest")}</Link>
              </Button>
            </div>
          ) : (
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    <th className={thClass}>{t("loads.colFile")}</th>
                    <th className={thClass}>{t("loads.colStatus")}</th>
                    <th className={thClass}>{t("loads.colMonth")}</th>
                    <th className={thClass}>{t("loads.colUploadedBy")}</th>
                    <th className={`${thClass} text-right`}>{t("loads.colRowsRead")}</th>
                    <th className={`${thClass} text-right`}>{t("loads.colRowsAccepted")}</th>
                    <th className={`${thClass} pr-0 text-right`}>{t("loads.colRowsRejected")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(view?.rows ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        row.pending && "bg-[var(--cifra-warn-soft)]",
                      )}
                    >
                      <td className={cn(tdClass, "max-w-[220px]")}>
                        <span className="block truncate font-medium text-foreground" title={row.originalName}>
                          {row.originalName}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <LoadStatus row={row} t={t} />
                      </td>
                      <td className={cn(tdClass, "cifra-num whitespace-nowrap")}>
                        {row.periodo && row.anio ? (
                          `${t(monthLabelKey(row.periodo - 1))} ${row.anio}`
                        ) : (
                          <span className="text-muted-foreground">{t("loads.noMonth")}</span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span className="block text-foreground">{row.uploadedBy}</span>
                        <span className="cifra-num block whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(row.uploadedAt, locale, {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className={cn(tdClass, "cifra-num text-right")}>{num(row.rowsRead)}</td>
                      <td className={cn(tdClass, "cifra-num text-right")}>{num(row.rowsAccepted)}</td>
                      <td className={cn(tdClass, "cifra-num pr-0 text-right")}>{num(row.rowsRejected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          {view?.truncated ? (
            <p className="text-xs text-muted-foreground">
              {t("loads.truncated", { count: view.rows.length })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Guardado -> punto sólido (la cifra ya está en la contabilidad).
 * No guardado -> óvalo discontinuo sin punto (ese archivo no está en tus cifras).
 */
function LoadStatus({ row, t }: { row: LoadHistoryRow; t: TranslateFn }) {
  const saved = row.state === "SAVED";
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap font-medium",
          saved ? "text-foreground" : row.pending ? "text-[var(--cifra-warn)]" : "text-muted-foreground",
        )}
      >
        <span aria-hidden="true">
          <CifraMark state={saved ? "confirmed" : "missing"} size={16} />
        </span>
        {t(`loads.state.${row.state}`)}
      </span>
      {row.savedInAnotherLoad ? (
        <span className="pl-6 text-xs text-muted-foreground">{t("loads.savedLater")}</span>
      ) : null}
    </span>
  );
}
