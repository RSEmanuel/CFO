"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { ExportMenu } from "@/components/export/ExportMenu";
import { TableScroll } from "@/components/ui/table-scroll";
import { useLocale } from "@/context/LocaleContext";
import { formatMxn } from "@/services/money";
import type { ColumnMode, FileKind } from "@/services/tableExport";

/**
 * "vencido": auxiliar de ventas con fecha de vencimiento (cifra confirmada).
 * "sinCobrar": solo movimientos de CONTPAQi; sin plazo, cuenta días desde la factura (estimada).
 */
export type NoPaganVariant = "vencido" | "sinCobrar";

export type NoPaganRow = {
  cliente: string;
  monto: number;
  dias: number;
  accion: string;
  /** Los días son un mínimo: la factura más antigua está antes de los datos cargados. */
  alMenos?: boolean;
};

type Props = {
  variant: NoPaganVariant;
  total: number;
  rows: NoPaganRow[];
  topCount: number;
  topPct: number;
  /** Cliente de la alerta, si aplica. */
  alerta: NoPaganRow | null;
  onExport: (options: { fileKind: FileKind; columnMode: ColumnMode }) => Promise<void> | void;
};

/**
 * B07. Lista de quién debe, cuánto y qué hacer, con un solo criterio de días
 * en toda la pantalla y la fuente de cada cifra a la vista.
 */
export function ClientesQueNoPaganSection({ variant, total, rows, topCount, topPct, alerta, onExport }: Props) {
  const { t } = useLocale();
  const prefix = variant === "vencido" ? "cobranza.noPagan" : "cobranza.sinCobrar";
  const vacio = rows.length === 0;

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-lg font-medium text-foreground">{t(`${prefix}.title`)}</h2>
          <p className="mt-1 text-sm text-foreground">
            {vacio
              ? t(`${prefix}.vacio`)
              : topCount === 1
                ? t(`${prefix}.resumenUno`, { monto: formatMxn(total) })
                : t(`${prefix}.resumen`, { monto: formatMxn(total), pct: Math.round(topPct), n: topCount })}
          </p>
        </div>
        {vacio ? null : <ExportMenu onDownload={onExport} />}
      </div>

      {alerta ? (
        <p className="mt-4 flex items-start gap-2 rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground">
          <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-desfavorable" aria-hidden />
          {t(`${prefix}.alerta`, { cliente: alerta.cliente, monto: formatMxn(alerta.monto), dias: alerta.dias })}
        </p>
      ) : null}

      {vacio ? null : (
        <TableScroll className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="pb-2 font-medium">{t("cobranza.client")}</th>
                <th className="pb-2 text-right font-medium">{t(`${prefix}.monto`)}</th>
                <th className="pb-2 text-right font-medium">{t(`${prefix}.dias`)}</th>
                <th className="pb-2 pl-6 font-medium">{t(`${prefix}.queHacer`)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cliente} className="border-b border-beige-deep last:border-0">
                  <td className="py-3 font-sans text-base text-foreground">{row.cliente}</td>
                  <td className="cifra-num py-3 text-right text-foreground">{formatMxn(row.monto)}</td>
                  <td
                    className="cifra-num py-3 text-right text-foreground"
                    title={row.alMenos ? t("cobranza.sinCobrar.alMenos") : undefined}
                  >
                    {row.alMenos ? `${row.dias}+` : row.dias}
                  </td>
                  <td className="py-3 pl-6 text-foreground">{t(`${prefix}.acciones.${row.accion}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <CifraMark state={variant === "vencido" ? "confirmed" : "estimated"} size={14} className="mt-px shrink-0" />
        {t(`${prefix}.fuente`)}
      </p>
    </section>
  );
}
