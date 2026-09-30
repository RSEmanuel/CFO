"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import { usePolizasByAccount } from "@/hooks/use-polizas-by-account";
import { cn } from "@/lib/utils";
import { buildCsv, downloadBlob } from "@/services/tableExport";
import { formatMxn } from "@/services/money";
import type { PolizaMovimientoAuditDTO } from "@/services/polizasByAccountService";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";

/**
 * Drawer lateral derecho con el detalle de pólizas de una cuenta (o prefijo
 * de cuenta) en un periodo. Se construye directo sobre Radix Dialog (ESC,
 * click-outside y focus trap incluidos) porque el Sheet de ui/ es el panel
 * izquierdo de navegación.
 */

export type PolizasAuditTarget = {
  codigoCuenta: string;
  nombreCuenta: string;
  anio: number;
  periodo: number;
};

type PolizasAuditSheetProps = {
  target: PolizasAuditTarget | null;
  onClose: () => void;
};

const TIPO_BADGE: Record<string, string> = {
  Ingresos: "bg-emerald-50 text-emerald-700",
  Egresos: "bg-blue-50 text-blue-700",
  Diario: "bg-slate-100 text-slate-600",
};

const TIPO_LABEL_KEY: Record<string, string> = {
  Ingresos: "polizas.audit.tipoIngresos",
  Egresos: "polizas.audit.tipoEgresos",
  Diario: "polizas.audit.tipoDiario",
};

function formatFecha(iso: string, locale: string): string {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function periodoLabel(anio: number, periodo: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, periodo - 1, 1)));
}

export function PolizasAuditSheet({ target, onClose }: PolizasAuditSheetProps) {
  const { t, locale } = useLocale();
  const { data, loading, error } = usePolizasByAccount(
    target?.codigoCuenta ?? null,
    target?.anio ?? null,
    target?.periodo ?? null,
  );

  const exportCsv = () => {
    if (!target || !data) return;
    const headers = [
      t("polizas.audit.colFecha"),
      t("polizas.audit.colPoliza"),
      t("polizas.audit.colCuenta"),
      t("polizas.movNombre"),
      t("polizas.audit.colConcepto"),
      t("polizas.audit.colReferencia"),
      t("polizas.audit.colCargo"),
      t("polizas.audit.colAbono"),
    ];
    const rows = data.movimientos.map((mov) => [
      mov.fecha,
      `${mov.tipoPoliza} ${mov.numeroPoliza}`,
      mov.codigoCuenta,
      mov.nombreCuenta,
      mov.conceptoMov || mov.conceptoGeneral,
      mov.referencia,
      mov.cargo,
      mov.abono,
    ]);
    const cuenta = target.codigoCuenta.replace(/[^0-9A-Za-z.-]+/g, "-");
    const filename = `polizas-${cuenta}-${data.anio}-${String(data.periodo).padStart(2, "0")}.csv`;
    downloadBlob(new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" }), filename);
  };

  return (
    <DialogPrimitive.Root open={target != null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-5xl flex-col border-l border-border bg-card shadow-2xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
          )}
        >
          {target ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("polizas.audit.title")} · {periodoLabel(target.anio, target.periodo, locale)}
                  </p>
                  <DialogPrimitive.Title className="mt-1 truncate font-serif text-xl font-medium text-foreground">
                    <span className="financial-nums mr-2 text-clay">{target.codigoCuenta}</span>
                    {target.nombreCuenta}
                  </DialogPrimitive.Title>
                  {data ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("polizas.audit.saldoNeto")}:{" "}
                      <span className="financial-nums font-semibold text-foreground">
                        {formatMxn(data.resumen.saldoNeto)}
                      </span>
                      <span className="mx-2 text-border">·</span>
                      {t("polizas.audit.movimientos", { count: data.resumen.movimientos })}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={exportCsv}
                    disabled={!data || data.movimientos.length === 0}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("polizas.audit.export")}
                  </Button>
                  <DialogPrimitive.Close
                    className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label={t("polizas.audit.close")}
                  >
                    <X className="h-4 w-4" />
                  </DialogPrimitive.Close>
                </div>
              </div>

              {data && data.movimientos.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 border-b border-border px-6 py-4">
                  <div className="rounded-control bg-secondary px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      {t("polizas.audit.cargos")}
                    </p>
                    <p className="financial-nums mt-1 text-lg font-semibold text-foreground">
                      {formatMxn(data.resumen.totalCargos)}
                    </p>
                  </div>
                  <div className="rounded-control bg-secondary px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      {t("polizas.audit.abonos")}
                    </p>
                    <p className="financial-nums mt-1 text-lg font-semibold text-foreground">
                      {formatMxn(data.resumen.totalAbonos)}
                    </p>
                  </div>
                  <div className="rounded-control bg-secondary px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      {t("polizas.audit.saldoNeto")}
                    </p>
                    <p className="financial-nums mt-1 text-lg font-semibold text-foreground">
                      {formatMxn(data.resumen.saldoNeto)}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <div key={index} className="h-9 animate-pulse rounded-control bg-secondary" />
                    ))}
                  </div>
                ) : error ? (
                  <p className="py-12 text-center text-sm text-desfavorable">{error}</p>
                ) : !data || data.movimientos.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("polizas.audit.empty")}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">{t("polizas.audit.colFecha")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("polizas.audit.colPoliza")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("polizas.audit.colCuenta")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("polizas.audit.colConcepto")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("polizas.audit.colReferencia")}</th>
                        <th className="pb-2 text-right font-medium">{t("polizas.audit.colCargo")}</th>
                        <th className="pb-2 text-right font-medium">{t("polizas.audit.colAbono")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movimientos.map((mov: PolizaMovimientoAuditDTO) => (
                        <tr key={mov.id} className="border-b border-beige-deep/50 last:border-0">
                          <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground">
                            {formatFecha(mov.fecha, locale)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                TIPO_BADGE[mov.tipoPoliza] ?? "bg-secondary text-muted-foreground",
                              )}
                            >
                              {t(TIPO_LABEL_KEY[mov.tipoPoliza] ?? "") || mov.tipoPoliza}
                            </span>
                            <span className="financial-nums ml-1.5 text-muted-foreground">
                              #{mov.numeroPoliza}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="financial-nums text-foreground">{mov.codigoCuenta}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">{mov.nombreCuenta}</span>
                          </td>
                          <td
                            className="max-w-[260px] truncate py-2.5 pr-3 text-muted-foreground"
                            title={mov.conceptoMov || mov.conceptoGeneral}
                          >
                            {mov.conceptoMov || mov.conceptoGeneral || "—"}
                          </td>
                          <td className="max-w-[140px] truncate py-2.5 pr-3 text-muted-foreground" title={mov.referencia}>
                            {mov.referencia || "—"}
                          </td>
                          <td className="financial-nums py-2.5 text-right text-foreground">
                            {mov.cargo !== 0 ? formatMxn(mov.cargo) : ""}
                          </td>
                          <td className="financial-nums py-2.5 text-right text-foreground">
                            {mov.abono !== 0 ? formatMxn(mov.abono) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
