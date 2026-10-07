"use client";

import { DataEmptyState } from "@/components/data-empty-state";
import { ExportMenu } from "@/components/export/ExportMenu";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { PolizasAuditSheet, type PolizasAuditTarget } from "@/components/polizas/PolizasAuditSheet";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { useConcentracionRiesgo } from "@/hooks/use-concentracion-riesgo";
import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import type { ConcentracionRow, HhiNivel, RiesgoClasificacion } from "@/services/concentracionRiesgo";
import type { ConcentracionTipo } from "@/services/concentracionRiesgoService";
import { concentracionExportFilename, concentracionExportTable } from "@/services/cobranzaExport";
import { formatAxisTick, formatMxn } from "@/services/money";
import {
  buildCsv,
  buildWorkbook,
  downloadBlob,
  type ColumnMode,
  type FileKind,
  workbookToBlob,
} from "@/services/tableExport";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

const ESPRESSO = "var(--cifra-ink)";

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

/** Barras del Pareto: como mucho las 15 mayores para mantener legibilidad. */
const PARETO_MAX_BARRAS = 15;

const HHI_BADGE_TONE: Record<HhiNivel, string> = {
  baja: "bg-category-margins text-category-marginsFg",
  moderada: "bg-category-efficiency text-category-efficiencyFg",
  alta: "bg-category-solvency text-category-solvencyFg",
};

const RIESGO_BADGE_TONE: Record<RiesgoClasificacion, string> = {
  diversificado: "bg-category-margins text-category-marginsFg",
  estrategico: "bg-category-efficiency text-category-efficiencyFg",
  vulnerable: "bg-category-solvency text-category-solvencyFg",
};

function formatMoney(value: number, moneda: string): string {
  const formatted = formatMxn(value);
  return moneda === "USD" ? formatted.replace("$", "US$") : formatted;
}

function truncateName(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

type ParetoPoint = {
  name: string;
  entityName: string;
  monto: number;
  pctIndividual: number;
  pctAcumulado: number;
};

function ParetoTooltip({
  active,
  payload,
  moneda,
  acumuladoLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: ParetoPoint }>;
  moneda: string;
  acumuladoLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 text-xs">
      <p className="font-sans text-sm text-foreground">{point.entityName}</p>
      <p className="financial-nums mt-1 text-foreground">
        {formatMoney(point.monto, moneda)} · {point.pctIndividual.toFixed(1)}%
      </p>
      <p className="financial-nums text-muted-foreground">
        {acumuladoLabel}: {point.pctAcumulado.toFixed(1)}%
      </p>
    </div>
  );
}

function KpiCard({
  label,
  help,
  value,
  badge,
}: {
  label: string;
  help: string;
  value: string;
  badge?: { text: string; tone: string } | null;
}) {
  return (
    <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <p className="font-sans text-lg font-bold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{help}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="financial-nums text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        {badge ? (
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", badge.tone)}>
            {badge.text}
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** Gráfico Pareto de concentración: barras de monto + línea de % acumulado. */
function ParetoChartCard({ chartData, moneda }: { chartData: ParetoPoint[]; moneda: string }) {
  const { t } = useLocale();

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-lg font-medium text-foreground">
            {t("cobranza.concentracion.chartTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("cobranza.concentracion.chartHelp")}</p>
        </div>
        <div className="flex items-center gap-1">
          <FavoriteStarButton widgetId="chart-cobranza-pareto" label={t("cobranza.concentracion.chartTitle")} />
          <p className="text-xs text-muted-foreground">
            {t("cobranza.concentracion.chartTopNote", { count: chartData.length })}
          </p>
        </div>
      </div>
      <div className="mt-4 h-[300px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.beigeDeep} strokeOpacity={0.6} />
            <XAxis
              dataKey="name"
              tick={{ fill: CHART_AXIS.tick, fontSize: 10.5 }}
              axisLine={{ stroke: CHART_AXIS.stroke }}
              tickLine={false}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={64}
            />
            <YAxis
              yAxisId="left"
              width={64}
              tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatAxisTick(value, "m")}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={44}
              domain={[0, 100]}
              tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              cursor={{ fill: "rgb(196 93 62 / 0.06)" }}
              content={<ParetoTooltip moneda={moneda} acumuladoLabel={t("cobranza.concentracion.colPctAcum")} />}
            />
            <ReferenceLine
              yAxisId="right"
              y={80}
              stroke={CHART.coral}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{
                value: "80%",
                position: "insideTopRight",
                fill: CHART.coral,
                fontSize: 11,
              }}
            />
            <Bar yAxisId="left" dataKey="monto" name={t("cobranza.concentracion.colMonto")} maxBarSize={36} radius={[4, 4, 0, 0]}>
              {chartData.map((point) => (
                <Cell key={point.name} fill={CHART.clay} />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="pctAcumulado"
              name={t("cobranza.concentracion.colPctAcum")}
              stroke={ESPRESSO}
              strokeWidth={2}
              dot={{ r: 2.5, fill: ESPRESSO }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function ConcentracionRiesgoSection() {
  const { t } = useLocale();
  const { tenantId, tenants, user } = useSession();
  const [tipo, setTipo] = useState<ConcentracionTipo>("clientes");
  const [moneda, setMoneda] = useState("MXN");
  const { data, loading, error } = useConcentracionRiesgo(tipo, moneda);
  const [auditTarget, setAuditTarget] = useState<PolizasAuditTarget | null>(null);

  const empresa =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error) {
    return <DataEmptyState title={t("cobranza.loadError")} message={error} />;
  }
  if (!data?.hasData) {
    return (
      <DataEmptyState
        title={t("cobranza.concentracion.emptyTitle")}
        message={t("cobranza.concentracion.emptyMessage")}
      />
    );
  }

  const { model } = data;
  const asOf = `${data.anio}-${String(data.periodo).padStart(2, "0")}`;
  const chartData: ParetoPoint[] = model.rows.slice(0, PARETO_MAX_BARRAS).map((row) => ({
    name: truncateName(row.entityName),
    entityName: row.entityName,
    monto: row.monto,
    pctIndividual: row.pctIndividual,
    pctAcumulado: row.pctAcumulado,
  }));

  const riesgoLabel = (key: RiesgoClasificacion) => t(`cobranza.concentracion.riesgo.${key}`);
  const hhiBadge = model.hhiNivel
    ? {
        text: t(`cobranza.concentracion.hhiNivel.${model.hhiNivel}`),
        tone: HHI_BADGE_TONE[model.hhiNivel],
      }
    : null;

  const exportTabla = async ({ fileKind, columnMode }: { fileKind: FileKind; columnMode: ColumnMode }) => {
    try {
      const { headers, rows } = concentracionExportTable(model.rows, columnMode, riesgoLabel);
      const filename = concentracionExportFilename(empresa, asOf, tipo, data.moneda, fileKind);
      if (fileKind === "csv") {
        downloadBlob(new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" }), filename);
        return;
      }
      const workbook = await buildWorkbook(headers, rows, {
        tenant: empresa,
        reporte: `concentracion-${tipo}`,
        generatedAt: new Date().toISOString(),
      });
      downloadBlob(await workbookToBlob(workbook), filename);
    } catch {
      toast.error(t("cobranza.exportError"));
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-control border border-border bg-secondary p-0.5">
          {(["clientes", "proveedores"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTipo(option)}
              className={cn(
                "rounded-control px-3 py-1 text-xs font-medium text-muted-foreground",
                tipo === option && "bg-card text-clay shadow-sm",
              )}
            >
              {option === "clientes"
                ? t("cobranza.concentracion.toggleClientes")
                : t("cobranza.concentracion.toggleProveedores")}
            </button>
          ))}
        </div>
        {data.monedasDisponibles.length > 1 ? (
          <div className="flex rounded-control border border-border bg-secondary p-0.5">
            {data.monedasDisponibles.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMoneda(option)}
                className={cn(
                  "rounded-control px-3 py-1 text-xs font-medium text-muted-foreground",
                  moneda === option && "bg-card text-clay shadow-sm",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label={t("cobranza.concentracion.kpiHhi")}
          help={t("cobranza.concentracion.kpiHhiHelp")}
          value={model.hhi != null ? model.hhi.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
          badge={hhiBadge}
        />
        <KpiCard
          label={t("cobranza.concentracion.kpiPareto")}
          help={t("cobranza.concentracion.kpiParetoHelp")}
          value={
            model.paretoN != null
              ? t("cobranza.concentracion.kpiParetoValue", { count: model.paretoN })
              : "—"
          }
        />
        <KpiCard
          label={t("cobranza.concentracion.kpiTop3")}
          help={t("cobranza.concentracion.kpiTop3Help")}
          value={model.top3Share != null ? `${model.top3Share.toFixed(1)}%` : "—"}
        />
      </div>

      <ParetoChartCard chartData={chartData} moneda={data.moneda} />

      <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-sans text-lg font-medium text-foreground">
            {t("cobranza.concentracion.tablaTitle")}
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {t("cobranza.concentracion.cuentasCount", { count: model.cuentas })}
            </p>
            <ExportMenu onDownload={exportTabla} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="pb-2 font-medium">{t("cobranza.concentracion.colNombre")}</th>
                <th className="pb-2 text-right font-medium">
                  {tipo === "clientes"
                    ? t("cobranza.concentracion.montoClientes")
                    : t("cobranza.concentracion.montoProveedores")}
                </th>
                <th className="pb-2 text-right font-medium">{t("cobranza.concentracion.colPct")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.concentracion.colPctAcum")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.concentracion.colPlazo")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.concentracion.colRiesgo")}</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.accountId} className="border-b border-beige-deep last:border-0">
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() =>
                        setAuditTarget({
                          codigoCuenta: row.accountId,
                          nombreCuenta: row.entityName,
                          anio: data.anio,
                          periodo: data.periodo,
                        })
                      }
                      title={t("polizas.audit.drillHint")}
                      className="font-sans text-base text-foreground underline-offset-4 hover:text-clay hover:underline"
                    >
                      {row.entityName}
                    </button>
                  </td>
                  <td className="financial-nums py-3 text-right text-foreground">
                    {formatMoney(row.monto, data.moneda)}
                    {row.baseMonto === "saldo_pendiente" ? (
                      <span
                        className="ml-1 align-super text-[10px] text-muted-foreground"
                        title={t("cobranza.concentracion.baseSaldoPendiente")}
                      >
                        *
                      </span>
                    ) : null}
                  </td>
                  <td className="financial-nums py-3 text-right text-foreground">
                    {row.pctIndividual.toFixed(1)}%
                  </td>
                  <td className="financial-nums py-3 text-right text-muted-foreground">
                    {row.pctAcumulado.toFixed(1)}%
                  </td>
                  <td className="financial-nums py-3 text-right text-foreground">
                    {row.plazoMedioDias != null ? Math.round(row.plazoMedioDias) : t("cobranza.concentracion.sinPlazo")}
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                        RIESGO_BADGE_TONE[row.clasificacion],
                      )}
                    >
                      {riesgoLabel(row.clasificacion)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="align-super text-[10px]">*</span> {t("cobranza.concentracion.baseSaldoPendiente")}.{" "}
          {t("cobranza.concentracion.metodologia")}
        </p>
      </section>

      <PolizasAuditSheet target={auditTarget} onClose={() => setAuditTarget(null)} />
    </section>
  );
}

/**
 * Pareto de concentración de clientes para el Panel de Control. Auto-fetch
 * con la vista por defecto (clientes, MXN); api-cache deduplica la request.
 */
export function ConcentracionParetoCard() {
  const { data, loading, error } = useConcentracionRiesgo("clientes", "MXN");

  if (loading) {
    return <div className="h-72 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data?.hasData) {
    return null;
  }

  const chartData: ParetoPoint[] = data.model.rows.slice(0, PARETO_MAX_BARRAS).map((row) => ({
    name: truncateName(row.entityName),
    entityName: row.entityName,
    monto: row.monto,
    pctIndividual: row.pctIndividual,
    pctAcumulado: row.pctAcumulado,
  }));

  return <ParetoChartCard chartData={chartData} moneda={data.moneda} />;
}
