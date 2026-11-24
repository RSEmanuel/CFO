"use client";

import {
  FavoriteWidgetRenderer,
  type ControlWidgetContext,
} from "@/components/control/favorite-widget-renderer";
import { DataEmptyState, DataErrorState } from "@/components/data-empty-state";
import { CatalogFavoritesSection } from "@/components/metrics/favorite-metrics-grid";
import {
  INITIAL_RESULTADOS_FILTERS,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardDataProvider } from "@/context/DashboardDataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { useCajaRespiro } from "@/hooks/use-caja-respiro";
import { useCobranza } from "@/hooks/use-cobranza";
import { useEstadoOperativo } from "@/hooks/use-estado-operativo";
import { useResultados } from "@/hooks/use-resultados";
import { cn } from "@/lib/utils";
import {
  FAVORITES_CATEGORY_LABEL_KEYS,
  FAVORITES_CATEGORY_ORDER,
  getFavoritesByCategory,
  hasAnyFavorites,
  hasCatalogFavorites,
} from "@/services/favoritesRegistry";
import { getDestacadosKpis, periodLabel, trailingMonthlyRows, type MonthlyFinancials } from "@/services/financialDataTransformer";
import { formatMxn } from "@/services/money";
import { buildPortadaMes, type PortadaAlerta } from "@/services/portadaMes";
import { ChevronRight, HandCoins, Hourglass, LineChart as LineChartIcon, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type T = (key: string, values?: Record<string, string | number>) => string;

function nombreDelMes(periodo: string, locale: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (!anio || !mes) {
    return periodo;
  }
  const nombre = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(anio, mes - 1, 1)),
  );
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function alertaTexto(alerta: PortadaAlerta, t: T): string {
  switch (alerta.kind) {
    case "lowRunway":
      return t("flujo.alertsMessages.lowRunway", { caja: formatMxn(alerta.caja), meses: alerta.meses.toFixed(1) });
    case "clienteSuspender":
      return t("cobranza.noPagan.alerta", { cliente: alerta.cliente, monto: formatMxn(alerta.monto), dias: alerta.dias });
    case "clienteRevisar":
      return t("cobranza.sinCobrar.alerta", { cliente: alerta.cliente, monto: formatMxn(alerta.monto), dias: alerta.dias });
    case "perdida":
      return t("control.portada.alertas.perdida", { monto: formatMxn(alerta.monto) });
    case "gastoSube":
      return t("control.portada.alertas.gastoSube", { pct: alerta.pct.toFixed(1), monto: formatMxn(alerta.monto) });
    case "deudaAlta":
      return t("control.portada.alertas.deudaAlta", { anios: alerta.anios.toFixed(1) });
    case "deudaSinOperacion":
      return t("control.portada.alertas.deudaSinOperacion", { monto: formatMxn(alerta.monto) });
  }
}

function alertaAccion(alerta: PortadaAlerta, t: T): { href: string; label: string } {
  switch (alerta.kind) {
    case "lowRunway":
      return { href: "/dashboard/flujo", label: t("laboratorio.reviewCash") };
    case "clienteSuspender":
    case "clienteRevisar":
      return { href: "/dashboard/cobranza", label: t("laboratorio.reviewCollections") };
    case "perdida":
    case "gastoSube":
      return { href: "/dashboard/overview", label: t("laboratorio.reviewResults") };
    case "deudaAlta":
    case "deudaSinOperacion":
      return { href: "/dashboard/posicion-financiera", label: t("laboratorio.reviewResults") };
  }
}

function ControlEmptyState() {
  const { t } = useLocale();
  return (
    <DataEmptyState
      title={t("control.emptyTitle")}
      message={t("control.emptyMessage")}
      description={null}
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/overview">{t("control.emptyCtaResults")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/flujo">{t("control.emptyCtaFlujo")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/cobranza">{t("control.emptyCtaCobranza")}</Link>
          </Button>
        </div>
      }
    />
  );
}

function FavoritesGrid({ filters, rows }: { filters: ResultadosFilters; rows: MonthlyFinancials[] }) {
  const { t } = useLocale();
  const favorites = useFavorites();
  const kpis = useMemo(() => getDestacadosKpis(rows, filters), [rows, filters]);
  const context: ControlWidgetContext = useMemo(
    () => ({ periodo: filters.periodo, units: filters.units, rows, kpis, filters }),
    [filters, rows, kpis],
  );

  if (!hasAnyFavorites(favorites)) {
    return <ControlEmptyState />;
  }

  return (
    <>
      {FAVORITES_CATEGORY_ORDER.map((category) => {
        if (category === "METRICAS") {
          return hasCatalogFavorites(favorites) ? (
            <section key={category} className="space-y-3">
              <h2 className="text-lg font-bold tracking-tight text-[var(--lab-navy)]">{t(FAVORITES_CATEGORY_LABEL_KEYS[category])}</h2>
              <CatalogFavoritesSection filters={filters} />
            </section>
          ) : null;
        }

        const widgets = getFavoritesByCategory(favorites, category);
        if (widgets.length === 0) {
          return null;
        }
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight text-[var(--lab-navy)]">{t(FAVORITES_CATEGORY_LABEL_KEYS[category])}</h2>
            <div className="grid grid-cols-12 gap-5">
              {widgets.map((widget) => {
                const spanClass =
                  widget.type === "KPI"
                    ? "col-span-12 md:col-span-6 xl:col-span-3"
                    : widget.type === "CHART"
                      ? widget.wide
                        ? "col-span-12"
                        : "col-span-12 xl:col-span-6"
                      : "col-span-12";
                return (
                  <div key={widget.id} className={spanClass}>
                    <FavoriteWidgetRenderer widget={widget} context={context} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });
const CARD = "rounded-[20px] border-0 bg-card shadow-[var(--lab-shadow)]";

type Kpi = {
  key: string;
  label: string;
  valor: string;
  detalle: string;
  href: string;
  icon: ReactNode;
  /** true = círculo morado con icono blanco; false = círculo claro con icono morado. */
  solid: boolean;
  signal?: boolean;
};

/** Medida de MiniStatistics de Horizon: etiqueta, cifra y círculo de 56px con icono. */
function MiniStatistics({ kpi }: { kpi: Kpi }) {
  return (
    <Link
      href={kpi.href}
      className={cn(CARD, "flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--lab-nav-text)]">{kpi.label}</p>
        <p className={cn("cifra-num mt-1 truncate text-2xl font-bold", kpi.signal ? "text-desfavorable" : "text-[var(--lab-navy)]")}>
          {kpi.valor}
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-[var(--lab-nav-text)]">{kpi.detalle}</p>
      </div>
      <span
        className={cn(
          "flex size-14 shrink-0 items-center justify-center rounded-full",
          kpi.solid ? "bg-[var(--lab-brand)] text-white" : "bg-[var(--lab-bg)] text-[var(--lab-brand)]",
        )}
      >
        {kpi.icon}
      </span>
    </Link>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded-[20px] bg-card", className)} />;
}

export function LaboratorioPage() {
  const { t, locale } = useLocale();
  const { activePeriod, availablePeriods, selectPeriod } = useSession();
  const { data, loading, error } = useResultados();
  const [filters, setFilters] = useState<ResultadosFilters>({
    ...INITIAL_RESULTADOS_FILTERS,
    periodo: "",
  });

  useEffect(() => {
    setFilters((current) => ({ ...current, periodo: activePeriod ?? "" }));
  }, [activePeriod]);

  const rows = useMemo(() => data?.series ?? [], [data]);
  const periods = data?.availablePeriods.length ? data.availablePeriods : availablePeriods;
  const effectivePeriod = filters.periodo || periods.at(-1) || activePeriod || "";
  const estado = useEstadoOperativo(effectivePeriod);
  const caja = useCajaRespiro(effectivePeriod);
  const cobranza = useCobranza();
  const portada = useMemo(
    () => buildPortadaMes({ estado: estado.data, caja: caja.data, cobranza: cobranza.data }),
    [estado.data, caja.data, cobranza.data],
  );
  const chartData = useMemo(
    () => trailingMonthlyRows(rows, effectivePeriod).map((row) => ({ label: periodLabel(row.periodo), ventas: row.ingreso_total })),
    [rows, effectivePeriod],
  );

  if (loading) {
    return (
      <div className="grid grid-cols-12 gap-5 pb-4">
        <Skeleton className="col-span-12 h-28" />
        <Skeleton className="col-span-12 h-80" />
      </div>
    );
  }
  if (error) {
    return <DataErrorState title={t("resultados.loadError")} error={error} />;
  }

  const na = t("common.na");
  const mes = effectivePeriod ? nombreDelMes(effectivePeriod, locale) : "";
  const cifrasLoading = Boolean(effectivePeriod) && (estado.loading || caja.loading || cobranza.loading);
  const gasto = portada.gasto;
  const gastoSube = gasto?.variacionPct != null && gasto.variacionPct > 0.05;
  const perdida = portada.utilidad != null && portada.utilidad < 0;
  const meses = portada.mesesDeRespiro;

  const gastoDetalle = (() => {
    if (!gasto) {
      return t("control.portada.gasto.sinDato");
    }
    if (gasto.variacionPct == null) {
      return t("control.portada.gasto.sinAnterior");
    }
    const pct = Math.abs(gasto.variacionPct).toFixed(1);
    if (Math.abs(gasto.variacionPct) < 0.05) {
      return t("control.portada.gasto.igual");
    }
    return gasto.variacionPct > 0 ? t("control.portada.gasto.mas", { pct }) : t("control.portada.gasto.menos", { pct });
  })();

  const icon = "size-7";
  const kpis: Kpi[] = [
    {
      key: "utilidad",
      label: t("control.portada.utilidad.label"),
      valor: portada.utilidad == null ? na : formatMxn(portada.utilidad),
      detalle:
        portada.utilidad == null
          ? t("control.portada.utilidad.sinDato")
          : portada.utilidadAnterior == null
            ? t("control.portada.utilidad.sinAnterior")
            : t("control.portada.utilidad.anterior", { monto: formatMxn(portada.utilidadAnterior) }),
      href: "/dashboard/overview",
      icon: <LineChartIcon className={icon} aria-hidden />,
      solid: false,
      signal: perdida,
    },
    {
      key: "caja",
      label: t("control.portada.caja.label"),
      valor: portada.caja == null ? na : formatMxn(portada.caja),
      detalle: portada.caja == null ? t("control.portada.caja.sinDato") : t("control.portada.caja.fuente"),
      href: "/dashboard/flujo",
      icon: <Wallet className={icon} aria-hidden />,
      solid: true,
    },
    {
      key: "respiro",
      label: t("control.portada.respiro.label"),
      valor: meses == null ? na : t("common.months", { value: meses.toFixed(1) }),
      detalle: meses == null ? t("control.portada.respiro.sinDato") : t("control.portada.respiro.fuente"),
      href: "/dashboard/flujo",
      icon: <Hourglass className={icon} aria-hidden />,
      solid: false,
    },
    {
      key: "clientes",
      label: portada.clientes?.base === "sinCobrar" ? t("cobranza.sinCobrar.title") : t("cobranza.noPagan.title"),
      valor: portada.clientes == null ? na : formatMxn(portada.clientes.monto),
      detalle:
        portada.clientes == null
          ? t("control.portada.clientes.sinDato")
          : portada.clientes.base === "vencido"
            ? t("control.portada.clientes.vencido")
            : t("control.portada.clientes.sinCobrar"),
      href: "/dashboard/cobranza",
      icon: <HandCoins className={icon} aria-hidden />,
      solid: true,
    },
    {
      key: "gasto",
      label: t("control.portada.gasto.label"),
      valor: gasto == null ? na : formatMxn(gasto.actual),
      detalle: gastoDetalle,
      href: "/dashboard/overview",
      icon: <Receipt className={icon} aria-hidden />,
      solid: false,
      signal: gastoSube,
    },
  ];

  const periodItems = [...periods].sort().reverse();

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--lab-navy)]">
          {mes ? t("control.portada.titulo", { mes }) : t("nav.control")}
        </h1>
        {periodItems.length > 0 ? (
          <Select
            value={effectivePeriod}
            onValueChange={(next) => {
              setFilters((current) => ({ ...current, periodo: next }));
              selectPeriod(next);
            }}
          >
            <SelectTrigger className="h-10 w-[180px] rounded-full border-0 bg-card shadow-[var(--lab-shadow)]" aria-label={t("laboratorio.chart.subtitle")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodItems.map((period) => (
                <SelectItem key={period} value={period}>
                  {nombreDelMes(period, locale)} {period.slice(0, 4)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {cifrasLoading ? (
        <>
          <Skeleton className="h-28" />
          <Skeleton className="h-80" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <MiniStatistics key={kpi.key} kpi={kpi} />
            ))}
          </div>

          <div className="grid grid-cols-12 gap-5">
            <Card className={cn(CARD, "col-span-12 lg:col-span-8")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold tracking-tight text-[var(--lab-navy)]">{t("laboratorio.chart.ventas")}</CardTitle>
                <p className="text-sm text-[var(--lab-nav-text)]">{t("laboratorio.chart.subtitle")}</p>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          tick={{ fontSize: 12, fill: "var(--lab-nav-text)", fontFamily: "var(--font-mono)" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={52}
                          tickFormatter={(value: number) => compact.format(value)}
                          tick={{ fontSize: 12, fill: "var(--lab-nav-text)", fontFamily: "var(--font-mono)" }}
                        />
                        <Tooltip
                          cursor={{ stroke: "hsl(var(--border))" }}
                          content={({ active, payload, label }) =>
                            active && payload?.length ? (
                              <div className="rounded-xl bg-card px-3 py-2 text-xs shadow-[var(--lab-shadow)]">
                                <p className="mb-1 text-[var(--lab-nav-text)]">{label}</p>
                                <p className="cifra-num font-bold text-[var(--lab-navy)]">{formatMxn(Number(payload[0].value))}</p>
                              </div>
                            ) : null
                          }
                        />
                        <Line
                          dataKey="ventas"
                          type="monotone"
                          stroke="var(--lab-brand)"
                          strokeWidth={4}
                          dot={false}
                          activeDot={{ r: 5, fill: "var(--lab-brand)", stroke: "#fff", strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-[var(--lab-nav-text)]">{t("laboratorio.chart.empty")}</p>
                )}
              </CardContent>
            </Card>

            <Card className={cn(CARD, "col-span-12 lg:col-span-4")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold tracking-tight text-[var(--lab-navy)]">{t("laboratorio.alertsTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                {portada.alertas.length === 0 ? (
                  <p className="text-sm text-[var(--lab-nav-text)]">{t("laboratorio.noAlerts")}</p>
                ) : (
                  <ul className="space-y-3">
                    {portada.alertas.map((alerta, index) => {
                      const accion = alertaAccion(alerta, t);
                      return (
                        <li key={`${alerta.kind}-${index}`} className="rounded-2xl bg-[var(--lab-bg)] px-4 py-3">
                          <p className="flex items-start gap-2 text-sm text-[var(--lab-navy)]">
                            <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-desfavorable" aria-hidden />
                            {alertaTexto(alerta, t)}
                          </p>
                          <Link
                            href={accion.href}
                            className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-bold text-[var(--lab-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {accion.label}
                            <ChevronRight className="size-3.5" aria-hidden />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <DashboardDataProvider>
        <FavoritesGrid filters={{ ...filters, periodo: effectivePeriod }} rows={rows} />
      </DashboardDataProvider>
    </div>
  );
}
