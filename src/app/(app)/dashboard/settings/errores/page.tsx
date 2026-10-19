"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableScroll } from "@/components/ui/table-scroll";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ERROR_VIEW_ROLES } from "@/auth/rbac";
import { formatNumber } from "@/i18n/format";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ErrorLogRow, ErrorLogView } from "@/services/errorLog";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const thClass = "whitespace-nowrap pb-2 pr-4 font-medium";
const tdClass = "py-3 pr-4 align-top";
const ALL = "all";

type Filters = {
  status: "all" | "unresolved" | "resolved";
  source: "all" | "client" | "server";
  severity: "all" | "error" | "warn";
  tenantId: string;
  from: string;
  to: string;
  q: string;
};

const INITIAL_FILTERS: Filters = { status: "unresolved", source: ALL, severity: ALL, tenantId: ALL, from: "", to: "", q: "" };

function buildQuery(filters: Filters, page: number): string {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.status !== "all") params.set("resolved", filters.status === "resolved" ? "true" : "false");
  if (filters.source !== ALL) params.set("source", filters.source);
  if (filters.severity !== ALL) params.set("severity", filters.severity);
  if (filters.tenantId !== ALL) params.set("tenantId", filters.tenantId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  return params.toString();
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default function ErroresPage() {
  const { effectiveRole, tenants } = useSession();
  const { locale, t } = useLocale();
  const allowed = Boolean(effectiveRole && ERROR_VIEW_ROLES.includes(effectiveRole));

  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  // La búsqueda por texto se aplica al dejar de escribir, no en cada tecla.
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ErrorLogView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((current) => (current.q === q ? current : { ...current, q }));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    if (!allowed) {
      return;
    }
    let cancelled = false;
    setLoadFailed(false);
    apiRequest<ErrorLogView>(`/api/admin/errors?${buildQuery(filters, page)}`)
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, filters, page, reloadKey]);

  const update = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  async function toggleResolved(row: ErrorLogRow) {
    setBusyId(row.id);
    try {
      await apiRequest(`/api/admin/errors`, {
        method: "PATCH",
        body: JSON.stringify({ id: row.id, resolved: !row.resolved }),
      });
      toast.success(row.resolved ? t("errors.markedPending") : t("errors.markedResolved"));
      setReloadKey((key) => key + 1);
    } catch {
      toast.error(t("errors.updateFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.errorLog")}</CardTitle>
          <CardDescription>{t("errors.viewerOnly")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const num = (value: number) => formatNumber(value, locale);
  const dateLocale = locale === "en" ? "en-US" : "es-MX";
  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const dateOnly = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "numeric" });
  const timeOnly = (iso: string) =>
    new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const totalPages = view ? Math.max(1, Math.ceil(view.total / view.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-2xl font-bold tracking-tight text-clay">{t("nav.errorLog")}</p>
      </div>

      {view ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["errors.kpis.last24h", view.last24h],
              ["errors.kpis.unresolved", view.unresolved],
              ["errors.kpis.total", view.total],
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
        <CardContent className="flex flex-wrap gap-3 p-4">
          <FilterField label={t("errors.filters.status")}>
            <Select value={filters.status} onValueChange={(value) => update("status", value as Filters["status"])}>
              <SelectTrigger className="h-10 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("errors.status.all")}</SelectItem>
                <SelectItem value="unresolved">{t("errors.status.unresolved")}</SelectItem>
                <SelectItem value="resolved">{t("errors.status.resolved")}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t("errors.filters.source")}>
            <Select value={filters.source} onValueChange={(value) => update("source", value as Filters["source"])}>
              <SelectTrigger className="h-10 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("errors.filters.all")}</SelectItem>
                <SelectItem value="client">{t("errors.source.client")}</SelectItem>
                <SelectItem value="server">{t("errors.source.server")}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t("errors.filters.severity")}>
            <Select value={filters.severity} onValueChange={(value) => update("severity", value as Filters["severity"])}>
              <SelectTrigger className="h-10 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("errors.filters.all")}</SelectItem>
                <SelectItem value="error">{t("errors.severity.error")}</SelectItem>
                <SelectItem value="warn">{t("errors.severity.warn")}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t("errors.filters.company")}>
            <Select value={filters.tenantId} onValueChange={(value) => update("tenantId", value)}>
              <SelectTrigger className="h-10 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("errors.filters.allCompanies")}</SelectItem>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t("errors.filters.from")}>
            <Input type="date" className="h-10" value={filters.from} max={filters.to || undefined} onChange={(event) => update("from", event.target.value)} />
          </FilterField>
          <FilterField label={t("errors.filters.to")}>
            <Input type="date" className="h-10" value={filters.to} min={filters.from || undefined} onChange={(event) => update("to", event.target.value)} />
          </FilterField>
          <FilterField label={t("errors.filters.search")}>
            <Input
              type="search"
              className="h-10"
              value={q}
              placeholder={t("errors.filters.searchPlaceholder")}
              onChange={(event) => setQ(event.target.value)}
            />
          </FilterField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("errors.tableTitle")}</CardTitle>
          <CardDescription>{t("errors.tableHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadFailed ? <p className="text-sm text-muted-foreground">{t("errors.loadFailed")}</p> : null}
          {view && view.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("errors.empty")}</p>
          ) : null}
          {view && view.rows.length > 0 ? (
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    <th className={thClass}>{t("errors.columns.date")}</th>
                    <th className={thClass}>{t("errors.columns.source")}</th>
                    <th className={thClass}>{t("errors.columns.severity")}</th>
                    <th className={thClass}>{t("errors.columns.message")}</th>
                    <th className={thClass}>{t("errors.columns.company")}</th>
                    <th className={thClass}>{t("errors.columns.user")}</th>
                    <th className={thClass}>{t("errors.columns.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => {
                    const open = expanded === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-border last:border-0">
                          <td className={cn(tdClass, "cifra-num whitespace-nowrap text-xs text-muted-foreground")}>
                            <span className="block">{dateOnly(row.createdAt)}</span>
                            <span className="block">{timeOnly(row.createdAt)}</span>
                          </td>
                          <td className={cn(tdClass, "whitespace-nowrap")}>{t(`errors.source.${row.source}`)}</td>
                          <td className={cn(tdClass, "whitespace-nowrap")}>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                row.severity === "error"
                                  ? "bg-desfavorable/10 text-desfavorable"
                                  : "bg-category-efficiency text-category-efficiencyInk",
                              )}
                            >
                              {t(`errors.severity.${row.severity}`)}
                            </span>
                          </td>
                          <td className={cn(tdClass, "min-w-[13rem] max-w-[20rem]")}>
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : row.id)}
                              aria-expanded={open}
                              className="flex w-full items-start gap-1.5 text-left text-foreground"
                            >
                              {open ? (
                                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                              ) : (
                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                              )}
                              <span className={cn(open ? "break-words" : "line-clamp-2")}>{row.message}</span>
                            </button>
                          </td>
                          <td className={cn(tdClass, "min-w-[8rem]")}>{row.tenantName ?? "—"}</td>
                          <td className={cn(tdClass, "max-w-[11rem] break-all")}>{row.userEmail ?? "—"}</td>
                          <td className={cn(tdClass, "whitespace-nowrap")}>
                            <div className="flex flex-col items-start gap-2">
                              {row.resolved ? (
                                <span className="text-muted-foreground">{t("errors.status.resolved")}</span>
                              ) : (
                                <span className="font-medium text-foreground">{t("errors.status.unresolved")}</span>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busyId === row.id}
                                onClick={() => void toggleResolved(row)}
                              >
                                {row.resolved ? t("errors.markPending") : t("errors.markResolved")}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-b border-border bg-muted/40">
                            <td colSpan={7} className="px-4 py-3">
                              <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                                {row.url ? (
                                  <>
                                    <dt className="text-muted-foreground">{t("errors.detail.url")}</dt>
                                    <dd className="break-all font-mono">{row.url}</dd>
                                  </>
                                ) : null}
                                {row.digest ? (
                                  <>
                                    <dt className="text-muted-foreground">{t("errors.detail.digest")}</dt>
                                    <dd className="font-mono">{row.digest}</dd>
                                  </>
                                ) : null}
                                {row.userAgent ? (
                                  <>
                                    <dt className="text-muted-foreground">{t("errors.detail.userAgent")}</dt>
                                    <dd className="break-all">{row.userAgent}</dd>
                                  </>
                                ) : null}
                                {row.resolved && row.resolvedBy ? (
                                  <>
                                    <dt className="text-muted-foreground">{t("errors.detail.resolvedBy")}</dt>
                                    <dd>
                                      {row.resolvedBy}
                                      {row.resolvedAt ? ` · ${dateTime(row.resolvedAt)}` : ""}
                                    </dd>
                                  </>
                                ) : null}
                              </dl>
                              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-control border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-foreground">
                                {row.stack ?? t("errors.detail.noStack")}
                              </pre>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          ) : null}

          {view && view.total > view.pageSize ? (
            <div className="flex items-center justify-between gap-3 pt-2 text-sm">
              <span className="text-muted-foreground">
                {t("errors.pageOf", { page: num(view.page), pages: num(totalPages) })}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t("errors.prev")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("errors.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
