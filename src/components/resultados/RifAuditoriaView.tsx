"use client";

import { DataEmptyState } from "@/components/data-empty-state";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { useLocale } from "@/context/LocaleContext";
import { useRifAuditoria } from "@/hooks/use-rif-auditoria";
import { CHART } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { formatMxn } from "@/services/money";
import type {
  ImpuestosMonitor,
  PuenteClaseEstado,
  RifSubcuentaRow,
  RifTotales,
  SemaforoClase,
} from "@/services/rifAuditoria";
import type { RifAuditoriaPayload } from "@/services/rifAuditoriaService";
import { FileText, Landmark, Receipt, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DisplayMode = "pct" | "mxn" | "ambos";

type RifAuditoriaViewProps = {
  periodo: string;
};

const NA = "N/A";
const CORAL = "#EF4444";
const MINT = "#2ECC71";

const SEMAFORO_STYLES: Record<SemaforoClase, { dot: string; chip: string }> = {
  verde: { dot: "bg-[#2ECC71]", chip: "bg-[#E8F8F5] text-[#1E8449]" },
  ambar: { dot: "bg-[#F59E0B]", chip: "bg-[#FEF9C3] text-[#B45309]" },
  rojo: { dot: "bg-[#EF4444]", chip: "bg-[#FEE2E2] text-[#B91C1C]" },
  sinCuentas: { dot: "bg-[#9CA3AF]", chip: "bg-secondary text-muted-foreground" },
};

function formatPctValue(value: number | null): string {
  return value == null ? NA : `${value.toFixed(1)}%`;
}

function pctOf(monto: number, ventas: number | null): number | null {
  return ventas != null && Math.abs(ventas) > 0.005 ? (monto / ventas) * 100 : null;
}

function monthLabel(anio: number, mes: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)));
}

export function RifAuditoriaView({ periodo }: RifAuditoriaViewProps) {
  const { t } = useLocale();
  const { data, loading, error } = useRifAuditoria(periodo);
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);
  const auditPeriod = parseIngresoPeriodo(periodo);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error) {
    return <DataEmptyState title={t("resultados.rifAuditoria.loadError")} message={error} />;
  }
  if (!data || !data.hasBalanza) {
    return (
      <DataEmptyState
        title={t("resultados.rifAuditoria.emptyTitle")}
        message={t("resultados.rifAuditoria.emptyMessage")}
      />
    );
  }

  const openAudit = (codigoCuenta: string, nombreCuenta: string) => {
    if (!auditPeriod) return;
    setAuditTarget({
      codigoCuenta,
      nombreCuenta,
      anio: auditPeriod.anio,
      periodo: auditPeriod.mes,
    });
  };

  return (
    <div className="space-y-6">
      <RifDesgloseSection data={data} onAudit={openAudit} />
      <ImpuestosSection data={data} />
      <CuentasPuenteSection data={data} onAudit={openAudit} />
      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  );
}

/* ------------------------------ Sección 1: RIF ------------------------------ */

type RifLine =
  | { kind: "group"; key: string; labelKey: string }
  | { kind: "item"; row: RifSubcuentaRow }
  | {
      kind: "total";
      key: "totalProductos" | "totalGastos";
      labelKey: string;
      totales: RifTotales;
      invertDelta: boolean;
      auditPrefix: string;
    }
  | { kind: "neto"; totales: RifTotales };

function RifDesgloseSection({
  data,
  onAudit,
}: {
  data: RifAuditoriaPayload;
  onAudit: (codigoCuenta: string, nombreCuenta: string) => void;
}) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState<DisplayMode>("ambos");
  const { rif } = data;

  const lines: RifLine[] = [
    { kind: "group", key: "productos", labelKey: "resultados.rifAuditoria.rif.grupoProductos" },
    ...rif.filas.filter((fila) => fila.naturaleza === "producto").map((row) => ({ kind: "item" as const, row })),
    {
      kind: "total",
      key: "totalProductos",
      labelKey: "resultados.rifAuditoria.rif.totalProductos",
      totales: rif.totalProductos,
      invertDelta: true,
      auditPrefix: "7102,7104",
    },
    { kind: "group", key: "gastos", labelKey: "resultados.rifAuditoria.rif.grupoGastos" },
    ...rif.filas.filter((fila) => fila.naturaleza === "gasto").map((row) => ({ kind: "item" as const, row })),
    {
      kind: "total",
      key: "totalGastos",
      labelKey: "resultados.rifAuditoria.rif.totalGastos",
      totales: rif.totalGastos,
      invertDelta: false,
      auditPrefix: "8101",
    },
    { kind: "neto", totales: rif.rifNeto },
  ];

  const chartData = useMemo(
    () =>
      rif.serieMensual.map((point) => ({
        name: monthLabel(point.anio, point.periodo, locale),
        gastos: point.gastos,
        productos: point.productos,
        rifNeto: point.rifNeto,
      })),
    [rif.serieMensual, locale],
  );

  const modes: Array<{ value: DisplayMode; labelKey: string }> = [
    { value: "pct", labelKey: "resultados.rifAuditoria.rif.modePct" },
    { value: "mxn", labelKey: "resultados.rifAuditoria.rif.modeMxn" },
    { value: "ambos", labelKey: "resultados.rifAuditoria.rif.modeBoth" },
  ];

  const cellView = (monto: number | null, ventas: number | null) => {
    const pct = monto == null ? null : pctOf(monto, ventas);
    const primary =
      mode === "pct" ? formatPctValue(pct) : monto == null ? NA : formatMxn(monto);
    const secondary = mode === "ambos" && monto != null ? formatPctValue(pct) : null;
    return { primary, secondary };
  };

  const variationView = (tot: RifTotales, invertDelta: boolean) => {
    const monto = tot.variacion;
    const pp =
      tot.mesAnterior == null
        ? null
        : (() => {
            const actual = pctOf(tot.mes, rif.ventas.mes);
            const previo = pctOf(tot.mesAnterior, rif.ventas.mesAnterior);
            return actual == null || previo == null ? null : actual - previo;
          })();
    const primary = mode === "pct" ? (pp == null ? NA : formatPp(pp)) : monto == null ? NA : formatMxn(monto);
    const secondary = mode === "ambos" && pp != null ? formatPp(pp) : null;
    return { primary, secondary, tone: deltaTone(mode === "mxn" ? monto : pp, invertDelta) };
  };

  function formatPp(value: number): string {
    const sign = value > 0.005 ? "+" : value < -0.005 ? "−" : "";
    return `${sign}${Math.abs(value).toFixed(1)} ${t("resultados.rifAuditoria.rif.pp")}`;
  }

  function deltaTone(value: number | null, invertDelta = true): string {
    if (value == null || Math.abs(value) < 0.005) {
      return "text-muted-foreground";
    }
    const favorable = invertDelta ? value > 0 : value < 0;
    return favorable ? "text-[#059669]" : "text-[#9F1239]";
  }

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-control bg-[#FEE2E2] text-[#B91C1C]">
            <Landmark className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-serif text-xl font-medium text-foreground">
              {t("resultados.rifAuditoria.rif.title")}
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("resultados.rifAuditoria.rif.help")}
            </p>
          </div>
        </div>
        <div className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5">
          {modes.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={cn(
                "h-9 rounded-control px-3 text-sm font-medium transition-colors",
                mode === option.value
                  ? "bg-secondary text-clay shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-pressed={mode === option.value}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">{t("resultados.rifAuditoria.rif.concepto")}</th>
              <th className="pb-2 pr-3 font-medium">{t("resultados.rifAuditoria.rif.sat")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("resultados.rifAuditoria.rif.acumulado")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("resultados.rifAuditoria.rif.mesActual")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("resultados.rifAuditoria.rif.mesAnterior")}</th>
              <th className="pb-2 text-right font-medium">{t("resultados.rifAuditoria.rif.variacion")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              if (line.kind === "group") {
                return (
                  <tr key={`group-${line.key}`} className={cn(index > 0 && "border-t-2 border-t-foreground/30")}>
                    <td colSpan={6} className="pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {t(line.labelKey)}
                    </td>
                  </tr>
                );
              }
              if (line.kind === "item") {
                const { row } = line;
                const invertDelta = row.naturaleza === "producto";
                const variation = variationView(
                  { ytd: row.ytd, mes: row.mes, mesAnterior: row.mesAnterior, variacion: row.variacion },
                  invertDelta,
                );
                return (
                  <tr
                    key={row.idCuenta}
                    className="cursor-pointer border-t border-border/40 transition-colors hover:bg-secondary/60"
                    onClick={() => onAudit(row.idCuenta, row.nombreCuenta)}
                    title={t("polizas.audit.drillHint")}
                  >
                    <td className="py-2 pr-3 pl-4 text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {row.nombreCuenta}
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">{row.idCuenta}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {row.satRef}
                      </span>
                    </td>
                    <RifCells view={cellView(row.ytd, rif.ventas.ytd)} />
                    <RifCells view={cellView(row.mes, rif.ventas.mes)} />
                    <RifCells view={cellView(row.mesAnterior, rif.ventas.mesAnterior)} />
                    <td className={cn("financial-nums py-2 text-right", variation.tone)}>
                      <div>{variation.primary}</div>
                      {variation.secondary ? <div className="text-[11px] opacity-80">{variation.secondary}</div> : null}
                    </td>
                  </tr>
                );
              }
              if (line.kind === "total") {
                const variation = variationView(line.totales, line.invertDelta);
                return (
                  <tr
                    key={line.key}
                    className="cursor-pointer border-t border-border/40 font-semibold transition-colors hover:bg-secondary/60"
                    onClick={() => onAudit(line.auditPrefix, t(line.labelKey))}
                    title={t("polizas.audit.drillHint")}
                  >
                    <td className="py-2 pr-3 text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {t(line.labelKey)}
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </span>
                    </td>
                    <td className="py-2 pr-3" />
                    <RifCells view={cellView(line.totales.ytd, rif.ventas.ytd)} />
                    <RifCells view={cellView(line.totales.mes, rif.ventas.mes)} />
                    <RifCells view={cellView(line.totales.mesAnterior, rif.ventas.mesAnterior)} />
                    <td className={cn("financial-nums py-2 text-right", variation.tone)}>
                      <div>{variation.primary}</div>
                      {variation.secondary ? <div className="text-[11px] opacity-80">{variation.secondary}</div> : null}
                    </td>
                  </tr>
                );
              }
              const variation = variationView(line.totales, true);
              return (
                <tr
                  key="rif-neto"
                  className="cursor-pointer border-t-2 border-t-foreground/40 bg-[#E8F8F5]/60 font-semibold transition-colors hover:bg-[#E8F8F5]"
                  onClick={() => onAudit("7102,7104,8101", t("resultados.rifAuditoria.rif.rifNeto"))}
                  title={t("polizas.audit.drillHint")}
                >
                  <td className="py-2.5 pr-3 text-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2ECC71]/15 px-2 py-0.5">
                      {t("resultados.rifAuditoria.rif.rifNeto")}
                      <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </span>
                  </td>
                  <td className="py-2.5 pr-3" />
                  <RifCells view={cellView(line.totales.ytd, rif.ventas.ytd)} />
                  <RifCells view={cellView(line.totales.mes, rif.ventas.mes)} />
                  <RifCells view={cellView(line.totales.mesAnterior, rif.ventas.mesAnterior)} />
                  <td className={cn("financial-nums py-2.5 text-right", variation.tone)}>
                    <div>{variation.primary}</div>
                    {variation.secondary ? <div className="text-[11px] opacity-80">{variation.secondary}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <h4 className="font-serif text-base font-medium text-foreground">
          {t("resultados.rifAuditoria.rif.chartTitle")}
        </h4>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("resultados.rifAuditoria.rif.chartHelp")}</p>
        <div className="mt-3 h-[260px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: CHART.mute, fontSize: 11 }}
                axisLine={{ stroke: CHART.mute, opacity: 0.3 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART.mute, fontSize: 11 }}
                tickFormatter={(value: number) => `$${Math.round(value / 1000)}K`}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ fill: "rgba(26,25,21,0.04)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]?.payload as { gastos: number; productos: number; rifNeto: number };
                  return (
                    <div className="rounded-control border border-border bg-card px-3 py-2 text-xs shadow-[var(--shadow-card)]">
                      <p className="font-medium text-foreground">{label}</p>
                      <p className="mt-1 text-muted-foreground">
                        {t("resultados.rifAuditoria.rif.chartGastos")}:{" "}
                        <span className="financial-nums text-foreground">{formatMxn(point.gastos)}</span>
                      </p>
                      <p className="text-muted-foreground">
                        {t("resultados.rifAuditoria.rif.chartProductos")}:{" "}
                        <span className="financial-nums text-foreground">{formatMxn(point.productos)}</span>
                      </p>
                      <p className="mt-1 border-t border-border/50 pt-1 font-medium text-foreground">
                        {t("resultados.rifAuditoria.rif.chartNeto")}:{" "}
                        <span className="financial-nums">{formatMxn(point.rifNeto)}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend
                formatter={(value) =>
                  value === "gastos"
                    ? t("resultados.rifAuditoria.rif.chartGastos")
                    : t("resultados.rifAuditoria.rif.chartProductos")
                }
              />
              <ReferenceLine y={0} stroke={CHART.mute} strokeOpacity={0.4} />
              <Bar dataKey="gastos" fill={CORAL} isAnimationActive={false} radius={[3, 3, 0, 0]} />
              <Bar dataKey="productos" fill={MINT} isAnimationActive={false} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function RifCells({ view }: { view: { primary: string; secondary: string | null } }) {
  return (
    <td className="financial-nums py-2 pr-3 text-right text-foreground">
      {view.primary}
      {view.secondary ? <div className="text-[11px] text-muted-foreground">{view.secondary}</div> : null}
    </td>
  );
}

/* --------------------------- Sección 2: Impuestos --------------------------- */

function ImpuestosSection({ data }: { data: RifAuditoriaPayload }) {
  const { t } = useLocale();
  const { impuestos } = data;

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-control bg-[#EEF2FF] text-[#6366F1]">
          <Receipt className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-serif text-xl font-medium text-foreground">
            {t("resultados.rifAuditoria.impuestos.title")}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("resultados.rifAuditoria.impuestos.help")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ImpuestoCard
          title={t("resultados.rifAuditoria.impuestos.isrTitle")}
          satRef={impuestos.isr.satRef}
          cuenta="6406"
          tone="bg-[#EEF2FF] text-[#6366F1]"
          impuesto={impuestos.isr}
        />
        <ImpuestoCard
          title={t("resultados.rifAuditoria.impuestos.ptuTitle")}
          satRef={impuestos.ptu.satRef}
          cuenta="6405"
          tone="bg-[#F3E8FF] text-[#A855F7]"
          impuesto={impuestos.ptu}
        />
        <TasaEfectivaCard impuestos={impuestos} />
      </div>
    </section>
  );
}

function ImpuestoCard({
  title,
  satRef,
  cuenta,
  tone,
  impuesto,
}: {
  title: string;
  satRef: string;
  cuenta: string;
  tone: string;
  impuesto: ImpuestosMonitor["isr"];
}) {
  const { t } = useLocale();
  return (
    <div
      className={cn(
        "rounded-card border p-4",
        impuesto.sinProvision ? "border-dashed border-[#F59E0B]/50 bg-[#FEF9C3]/40" : "border-border bg-secondary/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>
          {satRef} · {cuenta}
        </span>
      </div>
      {impuesto.sinProvision ? (
        <div className="mt-3">
          <span className="inline-flex items-center rounded-full bg-[#F59E0B]/15 px-2.5 py-1 text-xs font-medium text-[#B45309]">
            {t("resultados.rifAuditoria.impuestos.sinProvision")}
          </span>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("resultados.rifAuditoria.impuestos.sinProvisionHelp")}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">{t("resultados.rifAuditoria.impuestos.mes")}</span>
            <span className="financial-nums text-lg font-semibold text-foreground">{formatMxn(impuesto.mes)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">{t("resultados.rifAuditoria.impuestos.ytd")}</span>
            <span className="financial-nums text-sm font-medium text-foreground">{formatMxn(impuesto.ytd)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TasaEfectivaCard({ impuestos }: { impuestos: ImpuestosMonitor }) {
  const { t } = useLocale();
  const nota = impuestos.notaTasa;
  return (
    <div className="rounded-card border border-border bg-[#E8F8F5]/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{t("resultados.rifAuditoria.impuestos.tasaTitle")}</p>
        <span className="rounded-full bg-[#2ECC71]/15 px-2 py-0.5 text-[11px] font-medium text-[#1E8449]">
          {t("resultados.rifAuditoria.impuestos.ytd")}
        </span>
      </div>
      <p className="financial-nums mt-3 text-2xl font-semibold text-foreground">
        {impuestos.tasaEfectivaYtd == null ? NA : formatPctValue(impuestos.tasaEfectivaYtd)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("resultados.rifAuditoria.impuestos.tasaHelp")}{" "}
        <span className="financial-nums">
          {t("resultados.rifAuditoria.impuestos.ebtLabel")}: {formatMxn(impuestos.ebtYtd)}
        </span>
      </p>
      {nota ? (
        <p className="mt-2 text-xs font-medium text-[#B45309]">
          {nota === "sinProvisionIsr"
            ? t("resultados.rifAuditoria.impuestos.tasaSinProvision")
            : t("resultados.rifAuditoria.impuestos.tasaEbtNegativo")}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------- Sección 3: Cuentas puente ------------------------- */

const MAX_CUENTAS_VISIBLES = 8;

function CuentasPuenteSection({
  data,
  onAudit,
}: {
  data: RifAuditoriaPayload;
  onAudit: (codigoCuenta: string, nombreCuenta: string) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-control bg-[#FEF9C3] text-[#B45309]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-serif text-xl font-medium text-foreground">
            {t("resultados.rifAuditoria.puente.title")}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("resultados.rifAuditoria.puente.help")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.cuentasPuente.map((clase) => (
          <PuenteClaseCard key={clase.key} clase={clase} onAudit={onAudit} />
        ))}
      </div>
    </section>
  );
}

function PuenteClaseCard({
  clase,
  onAudit,
}: {
  clase: PuenteClaseEstado;
  onAudit: (codigoCuenta: string, nombreCuenta: string) => void;
}) {
  const { t } = useLocale();
  const styles = SEMAFORO_STYLES[clase.semaforo];
  const visibles = clase.cuentas.slice(0, MAX_CUENTAS_VISIBLES);
  const restantes = clase.cuentas.length - visibles.length;

  return (
    <div
      className={cn(
        "rounded-card border p-4",
        clase.semaforo === "sinCuentas" ? "border-dashed border-border bg-secondary/30 opacity-70" : "border-border bg-secondary/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className={cn("h-2.5 w-2.5 rounded-full", styles.dot)} />
          {t(`resultados.rifAuditoria.puente.clases.${clase.key}`)}
        </p>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", styles.chip)}>
          {t(`resultados.rifAuditoria.puente.semaforo.${clase.semaforo}`)}
        </span>
      </div>

      {clase.semaforo === "sinCuentas" ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("resultados.rifAuditoria.puente.sinCuentasHelp")}</p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">{t("resultados.rifAuditoria.puente.saldo")}</span>
            <span className="financial-nums text-lg font-semibold text-foreground">{formatMxn(clase.saldo)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              {t("resultados.rifAuditoria.puente.vsMesAnterior")}
            </span>
            <span
              className={cn(
                "financial-nums text-xs font-medium",
                clase.variacionAbs == null || Math.abs(clase.variacionAbs) < 0.005
                  ? "text-muted-foreground"
                  : clase.variacionAbs > 0
                    ? "text-[#9F1239]"
                    : "text-[#059669]",
              )}
            >
              {clase.variacionAbs == null ? NA : formatMxn(clase.variacionAbs)}
            </span>
          </div>

          {clase.cuentas.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t border-border/50 pt-2">
              {visibles.map((cuenta) => (
                <li key={cuenta.idCuenta}>
                  <button
                    type="button"
                    onClick={() => onAudit(cuenta.idCuenta, cuenta.nombreCuenta)}
                    className="flex w-full items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors hover:bg-secondary"
                    title={t("polizas.audit.drillHint")}
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", SEMAFORO_STYLES[cuenta.semaforo].dot)} />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      <span className="financial-nums text-muted-foreground">{cuenta.idCuenta}</span>{" "}
                      {cuenta.nombreCuenta}
                    </span>
                    {cuenta.motivos.includes("antiguedad60") && cuenta.antiguedadDias != null ? (
                      <span className="shrink-0 rounded-full bg-[#FEE2E2] px-1.5 py-0.5 text-[10px] font-medium text-[#B91C1C]">
                        {t("resultados.rifAuditoria.puente.antiguedadDias", { days: cuenta.antiguedadDias })}
                      </span>
                    ) : cuenta.motivos.includes("saldoCreciente") ? (
                      <span className="shrink-0 rounded-full bg-[#FEF9C3] px-1.5 py-0.5 text-[10px] font-medium text-[#B45309]">
                        {t("resultados.rifAuditoria.puente.motivos.saldoCreciente")}
                      </span>
                    ) : null}
                    <span className="financial-nums shrink-0 text-xs font-medium text-foreground">
                      {formatMxn(cuenta.saldo)}
                    </span>
                  </button>
                </li>
              ))}
              {restantes > 0 ? (
                <li className="px-1.5 pt-1 text-[11px] text-muted-foreground">
                  {t("resultados.rifAuditoria.puente.masCuentas", { count: restantes })}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-3 border-t border-border/50 pt-2 text-xs text-muted-foreground">
              {t("resultados.rifAuditoria.puente.semaforo.verde")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
