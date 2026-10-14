"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { ExportMenu } from "@/components/export/ExportMenu";
import { TableScroll } from "@/components/ui/table-scroll";
import { useLocale } from "@/context/LocaleContext";
import {
  clienteParaSuspender,
  type AccionCobranza,
  type ClientesQueNoPaganModel,
} from "@/services/clientesQueNoPagan";
import { formatMxn } from "@/services/money";
import type { ColumnMode, FileKind } from "@/services/tableExport";

type Props = {
  model: ClientesQueNoPaganModel;
  onExport: (options: { fileKind: FileKind; columnMode: ColumnMode }) => Promise<void> | void;
};

/**
 * B07. Lista de quién debe, cuánto y qué hacer. Un solo criterio: días desde el
 * vencimiento de cada factura, tomada del auxiliar de ventas.
 */
export function ClientesQueNoPaganSection({ model, onExport }: Props) {
  const { t } = useLocale();
  const accionLabel = (accion: AccionCobranza) => t(`cobranza.noPagan.acciones.${accion}`);
  const suspender = clienteParaSuspender(model);
  const sinVencido = model.clientes.length === 0;

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-lg font-medium text-foreground">{t("cobranza.noPagan.title")}</h2>
          <p className="mt-1 text-sm text-foreground">
            {sinVencido
              ? t("cobranza.noPagan.sinVencido")
              : model.topCount === 1
                ? t("cobranza.noPagan.resumenUno", { monto: formatMxn(model.totalVencido) })
                : t("cobranza.noPagan.resumen", {
                    monto: formatMxn(model.totalVencido),
                    pct: Math.round(model.topPct),
                    n: model.topCount,
                  })}
          </p>
        </div>
        {sinVencido ? null : <ExportMenu onDownload={onExport} />}
      </div>

      {suspender ? (
        <p className="mt-4 flex items-start gap-2 rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground">
          <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-desfavorable" aria-hidden />
          {t("cobranza.noPagan.alerta", {
            cliente: suspender.cliente,
            monto: formatMxn(suspender.vencido),
            dias: suspender.diasVencidos,
          })}
        </p>
      ) : null}

      {sinVencido ? null : (
        <TableScroll className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="pb-2 font-medium">{t("cobranza.client")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.noPagan.vencido")}</th>
                <th className="pb-2 text-right font-medium">{t("cobranza.daysPastDue")}</th>
                <th className="pb-2 pl-6 font-medium">{t("cobranza.noPagan.queHacer")}</th>
              </tr>
            </thead>
            <tbody>
              {model.clientes.map((row) => (
                <tr key={row.cliente} className="border-b border-beige-deep last:border-0">
                  <td className="py-3 font-sans text-base text-foreground">{row.cliente}</td>
                  <td className="cifra-num py-3 text-right text-foreground">{formatMxn(row.vencido)}</td>
                  <td className="cifra-num py-3 text-right text-foreground">{row.diasVencidos}</td>
                  <td className="py-3 pl-6 text-foreground">{accionLabel(row.accion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <CifraMark state="confirmed" size={14} className="mt-px shrink-0" />
        {t("cobranza.noPagan.fuente")}
      </p>
    </section>
  );
}
