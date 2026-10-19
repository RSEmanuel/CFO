"use client";

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, apiRequest } from "@/lib/api";
import { DEV_PARTNER_EMAIL, isClientDevAuthBypass } from "@/lib/dev-flags";
import { setErrorReportTenant } from "@/lib/report-client-error";
import type { PeriodView, SessionUser, TenantOption } from "@/lib/session-types";
import type { LedgerPeriodPayload } from "@/services/ledgerPeriodService";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type SessionContextValue = {
  user: SessionUser | null;
  tenants: TenantOption[];
  tenantId: string;
  anio: number;
  periodo: number;
  periodView: PeriodView;
  availablePeriods: string[];
  activePeriod: string | null;
  periodsLoading: boolean;
  loading: boolean;
  setTenantId: (id: string) => void;
  setPeriodo: (periodo: number) => void;
  setAnio: (anio: number) => void;
  setPeriodView: (view: PeriodView) => void;
  selectPeriod: (value: string) => void;
  setCorte: (value: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  refreshPeriods: () => void;
  /** Rol con el que se pinta la interfaz; difiere de user.role solo en vista de cliente. */
  effectiveRole: SessionUser["role"] | undefined;
  /** Solo puede estar activo para ADMIN o CFO_PARTNER. */
  isClientPreviewMode: boolean;
  canClientPreview: boolean;
  toggleClientPreviewMode: () => void;
};

const CLIENT_PREVIEW_KEY = "cifra.clientPreviewMode";

function readClientPreviewFlag(): boolean {
  try {
    return localStorage.getItem(CLIENT_PREVIEW_KEY) === "true";
  } catch {
    return false;
  }
}

function writeClientPreviewFlag(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(CLIENT_PREVIEW_KEY, "true");
    } else {
      localStorage.removeItem(CLIENT_PREVIEW_KEY);
    }
  } catch {
    // Sin almacenamiento la vista de cliente dura solo esta pestaña.
  }
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [anio, setAnio] = useState(2026);
  const [periodo, setPeriodo] = useState(7);
  const [periodView, setPeriodView] = useState<PeriodView>("ytd");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [activePeriod, setActivePeriod] = useState<string | null>(null);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodRefreshKey, setPeriodRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clientPreviewFlag, setClientPreviewFlag] = useState(false);

  useEffect(() => {
    setClientPreviewFlag(readClientPreviewFlag());
  }, []);

  // Los errores del navegador se atribuyen a la empresa que se está consultando.
  useEffect(() => {
    setErrorReportTenant(tenantId);
  }, [tenantId]);

  const refreshMe = useCallback(async () => {
    const me = await apiRequest<SessionUser>("/api/auth/me");
    setUser(me);
    const list = await apiRequest<TenantOption[]>("/api/tenants");
    setTenants(list);
    setTenantId((current) => {
      if (me.role === "CLIENT_VIEWER") {
        return me.tenantId;
      }
      if (current && list.some((item) => item.id === current)) {
        return current;
      }
      return me.tenantId;
    });
  }, []);

  useEffect(() => {
    if (!tenantId) {
      setAvailablePeriods([]);
      setActivePeriod(null);
      setPeriodsLoading(false);
      return;
    }
    const controller = new AbortController();
    setPeriodsLoading(true);
    apiRequest<LedgerPeriodPayload>(
      `/api/metrics/available-periods?tenantId=${encodeURIComponent(tenantId)}`,
      { signal: controller.signal },
    )
      .then((payload) => {
        if (controller.signal.aborted) return;
        setAvailablePeriods(payload.availablePeriods);
        setActivePeriod((current) => {
          const next =
            current && payload.availablePeriods.includes(current)
              ? current
              : payload.latestPeriod;
          if (next) {
            const [year, month] = next.split("-").map(Number);
            setAnio(year);
            setPeriodo(month);
            setPeriodView("mensual");
          }
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("No se pudieron resolver los periodos del tenant.", error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPeriodsLoading(false);
      });
    return () => controller.abort();
  }, [tenantId, periodRefreshKey]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiRequest<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role: SessionUser["role"]; tenantId: string };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      await refreshMe();
      router.push("/dashboard");
    },
    [refreshMe, router],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot(): Promise<void> {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      try {
        if (!token && isClientDevAuthBypass) {
          await login(DEV_PARTNER_EMAIL, "DevMode123!");
          return;
        }
        if (!token) {
          return;
        }
        await refreshMe();
      } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [login, refreshMe]);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    setTenants([]);
    setClientPreviewFlag(false);
    writeClientPreviewFlag(false);
    router.push("/login");
  }, [router]);

  const setCorte = useCallback((value: string) => {
    if (value === "ytd") {
      setPeriodView("ytd");
      setPeriodo(12);
      return;
    }
    const month = Number(value);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      setPeriodView("mensual");
      setPeriodo(month);
    }
  }, []);

  const selectPeriod = useCallback((value: string) => {
    const [year, month] = value.split("-").map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return;
    setAnio(year);
    setPeriodo(month);
    setActivePeriod(value);
    setPeriodView("mensual");
  }, []);
  const refreshPeriods = useCallback(() => setPeriodRefreshKey((value) => value + 1), []);

  // La vista de cliente es solo de interfaz: la API sigue autorizando con el rol real.
  const canClientPreview = user?.role === "ADMIN" || user?.role === "CFO_PARTNER";
  const isClientPreviewMode = canClientPreview && clientPreviewFlag;
  const effectiveRole: SessionUser["role"] | undefined = isClientPreviewMode ? "CLIENT_VIEWER" : user?.role;
  const toggleClientPreviewMode = useCallback(() => {
    setClientPreviewFlag((current) => {
      const next = !current;
      writeClientPreviewFlag(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      tenants,
      tenantId,
      anio,
      periodo,
      periodView,
      availablePeriods,
      activePeriod,
      periodsLoading,
      loading,
      setTenantId,
      setPeriodo,
      setAnio,
      setPeriodView,
      selectPeriod,
      setCorte,
      login,
      logout,
      refreshMe,
      refreshPeriods,
      effectiveRole,
      isClientPreviewMode,
      canClientPreview,
      toggleClientPreviewMode,
    }),
    [
      user, tenants, tenantId, anio, periodo, periodView, availablePeriods, activePeriod,
      periodsLoading, loading, setCorte, selectPeriod, login, logout, refreshMe, refreshPeriods,
      effectiveRole, isClientPreviewMode, canClientPreview, toggleClientPreviewMode,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession debe usarse dentro de SessionProvider");
  }
  return ctx;
}
