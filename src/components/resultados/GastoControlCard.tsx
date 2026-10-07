"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { InfoDialog } from "@/components/ui/info-dialog";
import { Tooltip as Hint, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/context/LocaleContext";
import { useGastoOpex } from "@/hooks/use-gasto-opex";
import { monthLabelKey } from "@/i18n/format";
import { OPEX_SPLIT } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { GASTO_CONTROL_FAVORITE_ID, type GastoControlKind } from "@/services/favoritesRegistry";
import type { GastoOpexControl } from "@/services/gastoOpex";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import type { ReactNode } from "react";

const KPI_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2,
});

function formatSignedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatPesos(value: number): string {
  return `$${value.toFixed(2)}`;
}

function localeMonthLabel(key: string, t: (id: string) => string): string {
  const match = key.match(/^(\d{4})-(\d{2})$/);
  if (!match) return key;
  const abbr = t(monthLabelKey(Number(match[2]) - 1)).slice(0, 3);
  return `${abbr}-${match[1].slice(-2)}`;
}

function splitSegments(split: GastoOpexControl["split"]) {
  const includeOtros = Math.abs(split.otros) > 0.005;
  const ventaW = Math.max(0, split.venta);
  const adminW = Math.max(0, split.admin);
  const otrosW = includeOtros ? Math.max(0, split.otros) : 0;
  const denom = ventaW + adminW + otrosW;
  return [
    { key: "venta" as const, pct: split.pctVenta, width: denom > 0 ? (ventaW / denom) * 100 : 0, color: OPEX_SPLIT.venta },
    { key: "admin" as const, pct: split.pctAdmin, width: denom > 0 ? (adminW / denom) * 100 : 0, color: OPEX_SPLIT.admin },
    ...(includeOtros
      ? [{ key: "otros" as const, pct: split.pctOtros, width: denom > 0 ? (otrosW / denom) * 100 : 0, color: OPEX_SPLIT.otros }]
      : []),
  ];
}

function TitleRow({ title, widgetId, extra }: { title: string; widgetId: string; extra?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="font-sans text-base font-bold text-foreground">{title}</p>
        {extra}
      </div>
      <FavoriteStarButton widgetId={widgetId} label={title} />
    </div>
  );
}

export function GastoControlCard({ kind, control }: { kind: GastoControlKind; control: GastoOpexControl }) {
  const { t } = useLocale();

  if (kind === "absorcion") {
    const title = t("resultados.opex.absorptionTitle");
    return (
      <article className="rounded-card border border-category-marginsFg/20 bg-category-margins px-4 py-3 shadow-[var(--shadow-card)]">
        <TitleRow title={title} widgetId={GASTO_CONTROL_FAVORITE_ID.absorcion} />
        <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
          {control.absorcionPct == null ? t("resultados.opex.na") : `${control.absorcionPct.toFixed(1)}%`}
        </p>
        {control.pesosPorPeso == null ? null : (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("resultados.opex.absorptionHint", { pesos: formatPesos(control.pesosPorPeso) })}
          </p>
        )}
      </article>
    );
  }

  if (kind === "jaws") {
    const title = t("resultados.opex.jawsTitle");
    const jawsPositive = control.jaws != null && control.jaws.jawsPp > 0;
    const jawsVentasGanan = control.jaws != null && control.jaws.deltaIngresosPct > control.jaws.deltaOpexPct;
    return (
      <article
        className={cn(
          "rounded-card border px-4 py-3 shadow-[var(--shadow-card)]",
          control.jaws == null
            ? "border-border bg-card"
            : jawsPositive
              ? "border-category-marginsFg/20 bg-category-margins"
              : "border-category-solvencyFg/20 bg-category-solvency",
        )}
      >
        <TitleRow
          title={title}
          widgetId={GASTO_CONTROL_FAVORITE_ID.jaws}
          extra={
            <InfoDialog
              title={title}
              body={t("resultados.opex.jawsHelp")}
              ariaLabel={title}
              icon={HelpCircle}
              triggerClassName="p-0 text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground"
            />
          }
        />
        {control.jaws ? (
          <>
            <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
              {formatSignedPct(control.jaws.jawsPp)}
            </p>
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                jawsPositive ? "bg-category-margins text-favorable" : "bg-category-solvency text-desfavorable",
              )}
            >
              {jawsPositive ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {t(jawsPositive ? "resultados.opex.jawsHealthy" : "resultados.opex.jawsInverted")}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("resultados.opex.jawsNarrative", {
                deltaIngresos: formatSignedPct(control.jaws.deltaIngresosPct),
                deltaOpex: formatSignedPct(control.jaws.deltaOpexPct),
                periodo: localeMonthLabel(control.jaws.periodoAnterior, t),
              })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(jawsVentasGanan ? "resultados.opex.jawsNarrativePositive" : "resultados.opex.jawsNarrativeNegative")}
            </p>
          </>
        ) : (
          <TooltipProvider delayDuration={200}>
            <Hint>
              <TooltipTrigger asChild>
                <p className="financial-nums mt-2 cursor-help text-2xl font-semibold tracking-tight underline decoration-dotted underline-offset-4">
                  {t("resultados.opex.jawsUnavailable")}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("resultados.opex.jawsUnavailableHint")}</TooltipContent>
            </Hint>
          </TooltipProvider>
        )}
      </article>
    );
  }

  if (kind === "laboral") {
    const title = t("resultados.opex.laborTitle");
    const laborHintAccounts = control.laboral.cuentas
      .filter((cuenta) => Math.abs(cuenta.monto) > 0.005)
      .map((cuenta) => `${cuenta.idCuenta} ${cuenta.nombreCuenta}`)
      .join(" · ");
    return (
      <article className="rounded-card border border-category-efficiencyFg/20 bg-category-efficiency px-4 py-3 shadow-[var(--shadow-card)]">
        <TitleRow title={title} widgetId={GASTO_CONTROL_FAVORITE_ID.laboral} />
        <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight" title={laborHintAccounts || undefined}>
          {KPI_FORMATTER.format(control.laboral.monto)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {control.laboral.pctOpex == null
            ? t("resultados.opex.laborEmpty")
            : t("resultados.opex.laborHint", { pct: control.laboral.pctOpex.toFixed(1) })}
        </p>
      </article>
    );
  }

  const title = t("resultados.opex.splitTitle");
  const splitRows = splitSegments(control.split);
  const splitLabel = (key: "venta" | "admin" | "otros") =>
    t(key === "venta" ? "resultados.opex.splitVenta" : key === "admin" ? "resultados.opex.splitAdmin" : "resultados.opex.splitOtros");
  return (
    <article className="rounded-card border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
      <TitleRow title={title} widgetId={GASTO_CONTROL_FAVORITE_ID.split} />
      <p className="mt-2 text-sm font-medium text-foreground">
        {splitRows
          .map((row) => `${row.pct == null ? t("resultados.opex.na") : `${row.pct.toFixed(1)}%`} ${splitLabel(row.key)}`)
          .join(" | ")}
      </p>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary">
        {splitRows.map((row) => (
          <span key={row.key} className="h-full" style={{ width: `${row.width}%`, backgroundColor: row.color }} />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {splitRows.map((row) => (
          <span key={row.key} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.color }} />
            {splitLabel(row.key)}
          </span>
        ))}
      </p>
    </article>
  );
}

export function GastoControlFavorite({ kind, periodo }: { kind: GastoControlKind; periodo: string }) {
  const { data, loading } = useGastoOpex(periodo);
  if (loading) {
    return <div className="h-28 animate-pulse rounded-card bg-secondary" />;
  }
  if (!data) return null;
  return <GastoControlCard kind={kind} control={data.control} />;
}
