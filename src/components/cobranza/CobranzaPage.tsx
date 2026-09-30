"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { CobranzaAgingChart } from "@/components/cobranza/CobranzaAgingChart";
import { CobranzaCarteraSection } from "@/components/cobranza/CobranzaCarteraSection";
import { ConcentracionRiesgoSection } from "@/components/cobranza/ConcentracionRiesgoSection";
import { DataEmptyState } from "@/components/data-empty-state";
import { DataOriginBadge } from "@/components/data-origin-badge";
import { HeroBarChart } from "@/components/charts/HeroBarChart";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { useCobranza } from "@/hooks/use-cobranza";
import { CHART } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import type { AntiguedadBucketKey } from "@/services/antiguedad";
import {
  antiguedadExportFilename,
  antiguedadExportTable,
  cobranzaExportFilename,
  cobranzaExportTable,
} from "@/services/cobranzaExport";
import { formatAxisTick, formatMxn } from "@/services/money";
import {
  buildCsv,
  buildWorkbook,
  downloadBlob,
  type ColumnMode,
  type FileKind,
  workbookToBlob,
} from "@/services/tableExport";
import { useRef, useState } from "react";
import { toast } from "sonner";

type AntiguedadLado = "cxc" | "cxp";
type CobranzaTab = "cartera" | "antiguedad" | "concentracion";

const COBRANZA_TABS: Array<{ value: CobranzaTab; labelKey: string }> = [
  { value: "cartera", labelKey: "cobranza.tabs.cartera" },
  { value: "antiguedad", labelKey: "cobranza.tabs.antiguedad" },
  { value: "concentracion", labelKey: "cobranza.tabs.concentracion" },
];

export function CobranzaPage() {
  const { t } = useLocale();
  const { tenantId, tenants, user } = useSession();
  const { data, loading, error } = useCobranza();
  const antiguedadRef = useRef<HTMLDivElement>(null);
  const [lado, setLado] = useState<AntiguedadLado>("cxc");
  const [tab, setTab] = useState<CobranzaTab>("cartera");
  const empresa =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");
  if (loading) return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  const model = data?.model ?? null;
  const asOf = data?.asOf ?? null;
  const antiguedad = lado === "cxc" ? data?.antiguedadCxc ?? null : data?.antiguedadCxp ?? null;
  const bucketLabel = (key: AntiguedadBucketKey) => t(`cobranza.agingBuckets.${key}`);

  const exportClientes = async ({ fileKind, columnMode }: { fileKind: FileKind; columnMode: ColumnMode }) => {
    if (!model || !asOf) {
      return;
    }
    try {
      const { headers, rows } = cobranzaExportTable(model.clientes, columnMode);
      const filename = cobranzaExportFilename(empresa, asOf, fileKind);
      if (fileKind === "csv") {
        downloadBlob(new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" }), filename);
        return;
      }
      const workbook = await buildWorkbook(headers, rows, {
        tenant: empresa,
        reporte: "cobranza",
        generatedAt: new Date().toISOString(),
      });
      downloadBlob(await workbookToBlob(workbook), filename);
    } catch {
      toast.error(t("cobranza.exportError"));
    }
  };

  const exportAntiguedad = async ({ fileKind, columnMode }: { fileKind: FileKind; columnMode: ColumnMode }) => {
    if (!antiguedad || !asOf) {
      return;
    }
    try {
      const { headers, rows } = antiguedadExportTable(antiguedad.terceros, columnMode, bucketLabel);
      const filename = antiguedadExportFilename(empresa, asOf, lado, fileKind);
      if (fileKind === "csv") {
        downloadBlob(new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" }), filename);
        return;
      }
      const workbook = await buildWorkbook(headers, rows, {
        tenant: empresa,
        reporte: `antiguedad-${lado}`,
        generatedAt: new Date().toISOString(),
      });
      downloadBlob(await workbookToBlob(workbook), filename);
    } catch {
      toast.error(t("cobranza.exportError"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] bg-background">
      <Tabs value={tab} onValueChange={(value) => setTab(value as CobranzaTab)}>
        <div>
          <p className="mb-2 text-lg font-bold tracking-tight text-clay">{t("nav.collections")}</p>
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 border-0 bg-transparent p-0">
            {COBRANZA_TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  "rounded-full border-0 bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-none",
                  "hover:bg-muted/80 hover:text-foreground",
                  "data-[state=active]:border-0 data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground data-[state=active]:shadow-none",
                )}
              >
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="cartera" className="mt-4">
          <CobranzaCarteraSection />
        </TabsContent>

        <TabsContent value="antiguedad" className="mt-4">
      <div className="space-y-4">
      {error ? <DataEmptyState title={t("cobranza.loadError")} message={error} /> : null}
      {asOf && data ? (
      <div className="flex justify-end">
        <DataOriginBadge origin={data.periodOrigins[asOf.slice(0, 7)]} />
      </div>
      ) : null}
      {model && asOf ? (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-serif text-lg text-foreground">{t("cobranza.pendingInvoices")}</p>
          <p className="text-xs text-muted-foreground">{t("cobranza.outstanding")}</p>
          <p className="financial-nums mt-4 text-3xl font-semibold tracking-tight text-foreground">
            {formatAxisTick(model.cxcAbierta, "m")}
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-serif text-lg text-foreground">{t("cobranza.averageDays")}</p>
          <p className="text-xs text-muted-foreground">{t("cobranza.averageDaysHelp")}</p>
          <p className="financial-nums mt-4 text-3xl font-semibold tracking-tight text-foreground">{t("cobranza.days", { value: model.dso })}</p>
        </article>
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-serif text-lg text-foreground">{t("cobranza.over60")}</p>
          <p className="financial-nums mt-4 text-3xl font-semibold tracking-tight text-foreground">
            {model.pctMayor60.toFixed(1)}%
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-serif text-lg text-foreground">{t("cobranza.topClient")}</p>
          <p className="mt-4 font-serif text-2xl font-semibold tracking-tight text-foreground">
            {model.topCliente.nombre} · {model.topCliente.pct.toFixed(0)}%
          </p>
        </article>
      </div>
      ) : null}

      {model && asOf ? <CobranzaAgingChart /> : null}

      {antiguedad && asOf ? (
        <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-medium text-foreground">{t("cobranza.agingSchedule")}</h2>
              <p className="text-xs text-muted-foreground">{t("cobranza.agingScheduleHelp")}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-control border border-border bg-secondary p-0.5">
                {(["cxc", "cxp"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLado(option)}
                    className={cn(
                      "rounded-control px-3 py-1 text-xs font-medium text-muted-foreground",
                      lado === option && "bg-card text-clay shadow-sm",
                    )}
                  >
                    {option === "cxc" ? t("cobranza.receivable") : t("cobranza.payable")}
                  </button>
                ))}
              </div>
              <ChartDownloadButton
                targetRef={antiguedadRef}
                empresa={empresa}
                modulo="cobranza"
                titulo={t("cobranza.agingSchedule")}
                periodo={asOf}
              />
            </div>
          </div>
          <div ref={antiguedadRef} className="mt-4 h-[260px] w-full min-w-0">
            <HeroBarChart
              data={antiguedad.buckets.map((bucket) => ({
                name: bucketLabel(bucket.key),
                saldo: bucket.saldo,
              }))}
              xKey="name"
              yTickFormatter={(value) => formatAxisTick(value, "m")}
              tooltipFormatter={(value, name) => [formatMxn(Number(value)), name]}
              legendFormatter={() => t("cobranza.balance")}
              series={[{ dataKey: "saldo", name: t("cobranza.balance"), fill: CHART.sand }]}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("cobranza.agingTotal")}: <span className="financial-nums font-semibold text-foreground">{formatMxn(antiguedad.total)}</span>
            </p>
            <ExportMenu onDownload={exportAntiguedad} />
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="pb-2 font-medium">{lado === "cxc" ? t("cobranza.client") : t("cobranza.vendor")}</th>
                  <th className="pb-2 text-right font-medium">{t("cobranza.balance")}</th>
                  <th className="pb-2 text-right font-medium">{t("cobranza.daysPastDue")}</th>
                  <th className="pb-2 text-right font-medium">{t("cobranza.bucket")}</th>
                </tr>
              </thead>
              <tbody>
                {antiguedad.terceros.map((row) => (
                  <tr key={row.tercero} className="border-b border-beige-deep last:border-0">
                    <td className="py-3 font-serif text-base text-foreground">{row.tercero}</td>
                    <td className="financial-nums py-3 text-right text-foreground">{formatMxn(row.saldo)}</td>
                    <td className="financial-nums py-3 text-right text-foreground">{Math.max(0, row.diasVencidos)}</td>
                    <td className="py-3 text-right text-muted-foreground">{bucketLabel(row.bucket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {model ? (
      <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-medium text-foreground">{t("cobranza.balancesByClient")}</h2>
          <ExportMenu onDownload={exportClientes} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="pb-2 font-medium">{t("cobranza.client")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.balance")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.daysColumn")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.bucket")}</th>
              </tr>
            </thead>
            <tbody>
              {model.clientes.map((row) => (
                <tr key={row.cliente} className="border-b border-beige-deep last:border-0">
                  <td className="py-3 font-serif text-base text-foreground">{row.cliente}</td>
                  <td className="financial-nums py-3 text-right text-foreground">{formatMxn(row.saldo)}</td>
                  <td className="financial-nums py-3 text-right text-foreground">{row.dias}</td>
                  <td className="py-3 text-right text-muted-foreground">{row.bucket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}
      </div>
        </TabsContent>

        <TabsContent value="concentracion" className="mt-4">
          <ConcentracionRiesgoSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
