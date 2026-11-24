"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { ExpandableShell } from "@/components/charts/ExpandableChartCard";
import { HeroBarChart } from "@/components/charts/HeroBarChart";
import { ClientesQueNoPaganSection, type NoPaganRow } from "@/components/cobranza/ClientesQueNoPaganSection";
import { ExportMenu } from "@/components/export/ExportMenu";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { TableScroll } from "@/components/ui/table-scroll";
import { useLocale } from "@/context/LocaleContext";
import { useCobranza } from "@/hooks/use-cobranza";
import { useEmpresaNombre } from "@/hooks/use-empresa-nombre";
import { CHART } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import type { AntiguedadBucketKey } from "@/services/antiguedad";
import { clienteParaRevisar } from "@/services/carteraSinCobrar";
import { clienteParaSuspender } from "@/services/clientesQueNoPagan";
import {
  antiguedadExportFilename,
  antiguedadExportTable,
  cobranzaExportFilename,
  cobranzaExportTable,
  listaClientesExportFilename,
  listaClientesExportTable,
} from "@/services/cobranzaExport";
import type { CobranzaPayload } from "@/services/cobranzaService";
import { formatAxisTick, formatMxn } from "@/services/money";
import {
  buildCsv,
  buildWorkbook,
  downloadBlob,
  type ColumnMode,
  type FileKind,
  type TableRow,
  workbookToBlob,
} from "@/services/tableExport";
import { presentarNombre } from "@/services/textoPresentable";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Tarjetas de la pestaña Antigüedad de Cobranza. Cada una pide sus datos
 * (useCobranza, deduplicado por api-cache) para que también se puedan fijar
 * con la estrella en el Panel de Control.
 */

type ExportOptions = { fileKind: FileKind; columnMode: ColumnMode };

async function descargar(
  table: { headers: string[]; rows: TableRow[] },
  options: { fileKind: FileKind; filename: string; empresa: string; reporte: string; onError: () => void },
): Promise<void> {
  try {
    if (options.fileKind === "csv") {
      downloadBlob(new Blob([buildCsv(table.headers, table.rows)], { type: "text/csv;charset=utf-8;" }), options.filename);
      return;
    }
    const workbook = await buildWorkbook(table.headers, table.rows, {
      tenant: options.empresa,
      reporte: options.reporte,
      generatedAt: new Date().toISOString(),
    });
    downloadBlob(await workbookToBlob(workbook), options.filename);
  } catch {
    options.onError();
  }
}

export type ListaClientes = {
  variant: "vencido" | "sinCobrar";
  total: number;
  rows: NoPaganRow[];
  topCount: number;
  topPct: number;
  alerta: NoPaganRow | null;
};

/** Con auxiliar de ventas manda la fecha de vencimiento; sin él, los días desde la factura. */
export function listaDeClientes(data: CobranzaPayload | null): ListaClientes | null {
  if (data?.clientesQueNoPagan) {
    const model = data.clientesQueNoPagan;
    const paraRow = (row: { cliente: string; vencido: number; diasVencidos: number; accion: string }): NoPaganRow => ({
      cliente: row.cliente,
      monto: row.vencido,
      dias: row.diasVencidos,
      accion: row.accion,
    });
    const alerta = clienteParaSuspender(model);
    return {
      variant: "vencido",
      total: model.totalVencido,
      rows: model.clientes.map(paraRow),
      topCount: model.topCount,
      topPct: model.topPct,
      alerta: alerta ? paraRow(alerta) : null,
    };
  }
  if (data?.clientesSinCobrar) {
    const model = data.clientesSinCobrar;
    const paraRow = (row: { cliente: string; saldo: number; diasSinCobrar: number; alMenos: boolean; accion: string }): NoPaganRow => ({
      cliente: row.cliente,
      monto: row.saldo,
      dias: row.diasSinCobrar,
      accion: row.accion,
      alMenos: row.alMenos,
    });
    const alerta = clienteParaRevisar(model);
    return {
      variant: "sinCobrar",
      total: model.totalSaldo,
      rows: model.clientes.map(paraRow),
      topCount: model.topCount,
      topPct: model.topPct,
      alerta: alerta ? paraRow(alerta) : null,
    };
  }
  return null;
}

/** B07. Clientes que no te pagan (o sin cobrar), con exportación. */
export function ClientesQueNoPaganCard() {
  const { t } = useLocale();
  const empresa = useEmpresaNombre();
  const { data } = useCobranza();
  const lista = listaDeClientes(data);
  const asOf = data?.asOf ?? null;
  if (!lista) return null;

  const exportar = async ({ fileKind, columnMode }: ExportOptions) => {
    if (!asOf) return;
    const variant = lista.variant;
    await descargar(
      listaClientesExportTable(
        lista.rows,
        variant,
        columnMode,
        (accion) => t(`cobranza.${variant === "vencido" ? "noPagan" : "sinCobrar"}.acciones.${accion}`),
        t,
      ),
      {
        fileKind,
        filename: listaClientesExportFilename(empresa, asOf, variant, fileKind),
        empresa,
        reporte: variant === "vencido" ? "clientes-que-no-pagan" : "clientes-sin-cobrar",
        onError: () => toast.error(t("cobranza.exportError")),
      },
    );
  };

  return <ClientesQueNoPaganSection {...lista} onExport={exportar} />;
}

/** Antigüedad de saldos (por cobrar o por pagar): gráfica por rango y tabla por tercero. */
export function AntiguedadCard() {
  const { t } = useLocale();
  const empresa = useEmpresaNombre();
  const { data } = useCobranza();
  const ref = useRef<HTMLDivElement>(null);
  const [lado, setLado] = useState<"cxc" | "cxp">("cxc");
  const asOf = data?.asOf ?? null;
  const antiguedad = lado === "cxc" ? data?.antiguedadCxc ?? null : data?.antiguedadCxp ?? null;
  if (!antiguedad || !asOf) return null;
  const bucketLabel = (key: AntiguedadBucketKey) => t(`cobranza.agingBuckets.${key}`);

  const exportar = ({ fileKind, columnMode }: ExportOptions) =>
    descargar(antiguedadExportTable(antiguedad.terceros, columnMode, bucketLabel, t), {
      fileKind,
      filename: antiguedadExportFilename(empresa, asOf, lado, fileKind),
      empresa,
      reporte: `antiguedad-${lado}`,
      onError: () => toast.error(t("cobranza.exportError")),
    });

  return (
    <ExpandableShell className="p-5">
      {(toggle, expanded) => (
        <>
          <FavoriteStarButton widgetId="table-cobranza-antiguedad" label={t("cobranza.agingSchedule")} />
          <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
            <div>
              <h2 className="font-sans text-lg font-medium text-foreground">{t("cobranza.agingSchedule")}</h2>
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
                targetRef={ref}
                empresa={empresa}
                modulo="cobranza"
                titulo={t("cobranza.agingSchedule")}
                periodo={asOf}
              />
              {toggle}
            </div>
          </div>
          {/* Ampliada, la tabla sigue debajo: alto fijo grande en vez de flex-1 para que no aplaste la gráfica. */}
          <div ref={ref} className={cn("mt-4 w-full min-w-0", expanded ? "h-[60vh] shrink-0" : "h-[260px]")}>
            <HeroBarChart
              data={antiguedad.buckets.map((bucket) => ({ name: bucketLabel(bucket.key), saldo: bucket.saldo }))}
              xKey="name"
              yTickFormatter={(value) => formatAxisTick(value, "m")}
              tooltipFormatter={(value, name) => [formatMxn(Number(value)), name]}
              legendFormatter={() => t("cobranza.balance")}
              series={[{ dataKey: "saldo", name: t("cobranza.balance"), fill: CHART.sand }]}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("cobranza.agingTotal")}: <span className="financial-nums font-medium text-foreground">{formatMxn(antiguedad.total)}</span>
            </p>
            <ExportMenu onDownload={exportar} />
          </div>
          <TableScroll className="mt-2">
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
                    <td className="py-3 font-sans text-base text-foreground">{presentarNombre(row.tercero)}</td>
                    <td className="financial-nums py-3 text-right text-foreground">{formatMxn(row.saldo)}</td>
                    <td className="financial-nums py-3 text-right text-foreground">{Math.max(0, row.diasVencidos)}</td>
                    <td className="py-3 text-right text-muted-foreground">{bucketLabel(row.bucket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
    </ExpandableShell>
  );
}

/** Saldos por cliente con días vencidos y rango, con exportación. */
export function SaldosPorClienteCard() {
  const { t } = useLocale();
  const empresa = useEmpresaNombre();
  const { data } = useCobranza();
  const model = data?.model ?? null;
  const asOf = data?.asOf ?? null;
  if (!model) return null;
  const bucketLabel = (key: AntiguedadBucketKey) => t(`cobranza.agingBuckets.${key}`);

  const exportar = async ({ fileKind, columnMode }: ExportOptions) => {
    if (!asOf) return;
    await descargar(cobranzaExportTable(model.clientes, columnMode, bucketLabel, t), {
      fileKind,
      filename: cobranzaExportFilename(empresa, asOf, fileKind),
      empresa,
      reporte: "cobranza",
      onError: () => toast.error(t("cobranza.exportError")),
    });
  };

  return (
    <section className="relative rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <FavoriteStarButton widgetId="table-cobranza-saldos" label={t("cobranza.balancesByClient")} />
      <div className="mb-4 flex items-center justify-between gap-3 pr-10">
        <h2 className="font-sans text-lg font-medium text-foreground">{t("cobranza.balancesByClient")}</h2>
        <ExportMenu onDownload={exportar} />
      </div>
      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="pb-2 font-medium">{t("cobranza.client")}</th>
              <th className="pb-2 text-right font-medium">{t("cobranza.balance")}</th>
              <th className="pb-2 text-right font-medium">{t("cobranza.daysPastDue")}</th>
              <th className="pb-2 text-right font-medium">{t("cobranza.bucket")}</th>
            </tr>
          </thead>
          <tbody>
            {model.clientes.map((row) => (
              <tr key={row.cliente} className="border-b border-beige-deep last:border-0">
                <td className="py-3 font-sans text-base text-foreground">{presentarNombre(row.cliente)}</td>
                <td className="financial-nums py-3 text-right text-foreground">{formatMxn(row.saldo)}</td>
                <td className="financial-nums py-3 text-right text-foreground">{row.dias}</td>
                <td className="py-3 text-right text-muted-foreground">{bucketLabel(row.bucket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}
