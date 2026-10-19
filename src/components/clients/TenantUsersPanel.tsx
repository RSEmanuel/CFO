"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableScroll } from "@/components/ui/table-scroll";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { canRegisterRole } from "@/auth/rbac";
import { formatDate } from "@/i18n/format";
import type { TranslateFn } from "@/i18n/translate";
import { ApiError, apiRequest } from "@/lib/api";
import type { SessionUser } from "@/lib/session-types";
import type { AdminAuditRow, TenantAccessView, TenantUserRow } from "@/services/admin/userAdmin";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Role = SessionUser["role"];

const ALL_ROLES: readonly Role[] = ["ADMIN", "CFO_PARTNER", "CLIENT_VIEWER"];

type WelcomeEmailStatus = "sent" | "failed" | "skipped";

type CreatedUser = TenantUserRow & { welcomeEmail: WelcomeEmailStatus };

/** Aviso tras el alta: a quién se le mandó (o no) el correo de bienvenida. */
type WelcomeNotice = { userId: string; email: string; status: WelcomeEmailStatus; resent: boolean };

const thClass = "pb-2 pr-4 font-medium";
const tdClass = "py-3 pr-4 align-middle";

/**
 * Personas con acceso a un cliente: lista, alta (con correo de bienvenida), cambio de rol, apagar
 * acceso y bitácora. Quien lo monta ya validó que la sesión es ADMIN o CFO_PARTNER.
 */
export function TenantUsersPanel({ tenantId, companyName }: { tenantId: string; companyName: string }) {
  const { user } = useSession();
  const { locale, t } = useLocale();
  const empresa = companyName;

  const [view, setView] = useState<TenantAccessView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("CLIENT_VIEWER");
  const [creating, setCreating] = useState(false);
  const [welcome, setWelcome] = useState<WelcomeNotice | null>(null);
  const [resending, setResending] = useState(false);

  const grantableRoles = user ? ALL_ROLES.filter((option) => canRegisterRole(user.role, option)) : [];

  const errorMessage = useCallback(
    (error: unknown, fallbackKey: string): string => {
      if (!(error instanceof ApiError)) {
        return t(fallbackKey);
      }
      const reason = typeof error.details?.reason === "string" ? error.details.reason : null;
      if (reason) {
        return t(`users.errors.${reason}`);
      }
      if (error.code === "CONFLICT" || error.code === "VALIDATION_ERROR") {
        return t(`users.errors.${error.code}`);
      }
      return t(`errors.${error.code}`);
    },
    [t],
  );

  const load = useCallback(async () => {
    if (!tenantId) {
      return;
    }
    setLoadFailed(false);
    try {
      setView(await apiRequest<TenantAccessView>(`/api/admin/users?tenantId=${encodeURIComponent(tenantId)}`));
    } catch {
      setView(null);
      setLoadFailed(true);
    }
  }, [tenantId]);

  useEffect(() => {
    setView(null);
    setWelcome(null);
    void load();
  }, [load]);

  function canChange(target: TenantUserRow): boolean {
    return Boolean(user && target.id !== user.id && canRegisterRole(user.role, target.role));
  }

  async function patchUser(target: TenantUserRow, change: { isActive?: boolean; role?: Role }) {
    setBusyUserId(target.id);
    try {
      const updated = await apiRequest<TenantUserRow>("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ tenantId, userId: target.id, ...change }),
      });
      if (change.role) {
        toast.success(t("users.roleChanged", { email: updated.email, role: t(`common.roles.${updated.role}`) }));
      } else {
        toast.success(t(updated.isActive ? "users.accessOn" : "users.accessOff", { email: updated.email }));
      }
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "users.saveFailed"));
    } finally {
      setBusyUserId(null);
    }
  }

  function onToggleAccess(target: TenantUserRow) {
    if (target.isActive && !window.confirm(t("users.confirmOff", { email: target.email }))) {
      return;
    }
    void patchUser(target, { isActive: !target.isActive });
  }

  function onChangeRole(target: TenantUserRow, nextRole: Role) {
    if (nextRole === target.role) {
      return;
    }
    if (!window.confirm(t("users.confirmRole", { email: target.email, role: t(`common.roles.${nextRole}`) }))) {
      return;
    }
    void patchUser(target, { role: nextRole });
  }

  async function onDelete(target: TenantUserRow) {
    if (!window.confirm(t("users.confirmDelete", { email: target.email }))) {
      return;
    }
    setBusyUserId(target.id);
    try {
      const result = await apiRequest<{ email: string; reassignedUploads: number }>("/api/admin/users", {
        method: "DELETE",
        body: JSON.stringify({ tenantId, userId: target.id }),
      });
      toast.success(
        result.reassignedUploads > 0
          ? t("users.deletedWithUploads", { email: result.email, count: result.reassignedUploads })
          : t("users.deleted", { email: result.email }),
      );
      if (welcome?.userId === target.id) {
        setWelcome(null);
      }
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "users.deleteFailed"));
    } finally {
      setBusyUserId(null);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setWelcome(null);
    try {
      const created = await apiRequest<CreatedUser>("/api/auth/register-user", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role, tenantId }),
      });
      toast.success(t("users.added", { email: created.email, company: empresa }));
      setWelcome({ userId: created.id, email: created.email, status: created.welcomeEmail, resent: false });
      setEmail("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "users.saveFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function onResendWelcome() {
    if (!welcome) {
      return;
    }
    setResending(true);
    try {
      const result = await apiRequest<{ welcomeEmail: WelcomeEmailStatus }>("/api/admin/users/welcome", {
        method: "POST",
        body: JSON.stringify({ tenantId, userId: welcome.userId }),
      });
      setWelcome({ ...welcome, status: result.welcomeEmail, resent: true });
      if (result.welcomeEmail === "sent") {
        toast.success(t("users.resent", { email: welcome.email }));
      }
    } catch (error) {
      setWelcome({ ...welcome, status: "failed" });
      toast.error(errorMessage(error, "users.resendFailed"));
    } finally {
      setResending(false);
    }
  }

  const members = view?.members ?? [];

  return (
    <div className="space-y-6">
      {loadFailed ? (
        <Card>
          <CardContent className="pt-6 text-sm">{t("users.loadFailed")}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("users.listTitle")}</CardTitle>
          <CardDescription>{t("users.listHelp")}</CardDescription>
        </CardHeader>
        <CardContent>
          {view && members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("users.empty")}</p>
          ) : (
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    <th className={thClass}>{t("users.colPerson")}</th>
                    <th className={thClass}>{t("users.colRole")}</th>
                    <th className={thClass}>{t("users.colAccess")}</th>
                    <th className={thClass}>{t("users.colSince")}</th>
                    <th className={`${thClass} text-right`}>{t("users.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const editable = canChange(member);
                    const busy = busyUserId === member.id;
                    const roleOptions = ALL_ROLES.filter(
                      (option) => option === member.role || grantableRoles.includes(option),
                    );
                    return (
                      <tr key={member.id} className="border-b border-border last:border-0">
                        <td className={tdClass}>
                          <span className="font-medium text-foreground">{member.email}</span>
                          {member.id === user?.id ? (
                            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-clay">
                              {t("users.you")}
                            </span>
                          ) : null}
                        </td>
                        <td className={tdClass}>
                          {editable ? (
                            <select
                              aria-label={t("users.roleSelectAria", { email: member.email })}
                              className="h-9 rounded-control border border-input bg-background px-2 text-sm"
                              value={member.role}
                              disabled={busy}
                              onChange={(event) => onChangeRole(member, event.target.value as Role)}
                            >
                              {roleOptions.map((option) => (
                                <option key={option} value={option}>
                                  {t(`common.roles.${option}`)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            t(`common.roles.${member.role}`)
                          )}
                        </td>
                        <td className={tdClass}>
                          <AccessState active={member.isActive} t={t} />
                        </td>
                        <td className={`${tdClass} cifra-num text-muted-foreground`}>
                          {formatDate(member.createdAt, locale)}
                        </td>
                        <td className={`${tdClass} pr-0 text-right`}>
                          {editable ? (
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={member.isActive ? "secondary" : "outline"}
                                disabled={busy}
                                onClick={() => onToggleAccess(member)}
                              >
                                {t(member.isActive ? "users.turnOff" : "users.turnOn")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground"
                                disabled={busy}
                                aria-label={t("users.deleteAria", { email: member.email })}
                                onClick={() => void onDelete(member)}
                              >
                                {t("users.delete")}
                              </Button>
                            </div>
                          ) : null}
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

      <Card>
        <CardHeader>
          <CardTitle>{t("users.addTitle")}</CardTitle>
          <CardDescription>{t("users.addHelp", { company: empresa })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end" onSubmit={onCreate}>
            <div className="space-y-2">
              <Label htmlFor="new-user-email">{t("users.email")}</Label>
              <Input
                id="new-user-email"
                type="email"
                autoComplete="off"
                placeholder={t("users.emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-role">{t("users.role")}</Label>
              <select
                id="new-user-role"
                className="flex h-10 w-full rounded-control border border-input bg-background px-3 py-2 text-sm"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {grantableRoles.map((option) => (
                  <option key={option} value={option}>
                    {t(`common.roles.${option}`)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? t("users.adding") : t("users.add")}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">{t(`users.roleHelp.${role}`)}</p>

          {welcome ? (
            <div className="space-y-3 rounded-control border border-border bg-secondary p-4" role="status">
              {welcome.status === "skipped" ? (
                <p className="text-sm text-muted-foreground">{t("users.welcomeSkipped")}</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    {welcome.status === "sent"
                      ? t(welcome.resent ? "users.resent" : "users.welcomeSent", { email: welcome.email })
                      : t("users.welcomeFailed", { email: welcome.email })}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("users.welcomeHelp")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={resending} onClick={() => void onResendWelcome()}>
                      {resending ? t("users.resending") : t("users.resend")}
                    </Button>
                    <Button type="button" size="sm" onClick={() => setWelcome(null)}>
                      {t("users.welcomeDone")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {view && view.portfolioStaff.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("users.staffTitle")}</CardTitle>
            <CardDescription>{t("users.staffHelp")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {view.portfolioStaff.map((person) => (
                <li key={person.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="font-medium text-foreground">{person.email}</span>
                  <span className="text-muted-foreground">
                    {t(`common.roles.${person.role}`)} · {t("users.staffHome", { company: person.homeTenantName })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("users.auditTitle")}</CardTitle>
          <CardDescription>{t("users.auditHelp")}</CardDescription>
        </CardHeader>
        <CardContent>
          {view && view.audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("users.auditEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(view?.audit ?? []).map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-4">
                  <span className="cifra-num shrink-0 text-muted-foreground sm:w-44">
                    {formatDate(entry.createdAt, locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-foreground">{auditSentence(entry, t)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AccessState({ active, t }: { active: boolean; t: TranslateFn }) {
  return (
    <span className={active ? "inline-flex items-center gap-2 text-foreground" : "inline-flex items-center gap-2 text-muted-foreground"}>
      <span aria-hidden="true">
        <CifraMark state={active ? "confirmed" : "missing"} size={16} />
      </span>
      {t(active ? "users.accessYes" : "users.accessNo")}
    </span>
  );
}

function auditSentence(entry: AdminAuditRow, t: TranslateFn): string {
  const role = (value: Role | null) => (value ? t(`common.roles.${value}`) : "—");
  return t(`users.audit.${entry.action}`, {
    actor: entry.actorEmail,
    target: entry.targetEmail,
    role: role(entry.toRole),
    from: role(entry.fromRole),
    to: role(entry.toRole),
  });
}
