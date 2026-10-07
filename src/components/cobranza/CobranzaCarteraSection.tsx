"use client";

import { DataEmptyState } from "@/components/data-empty-state";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/context/LocaleContext";
import { useCobranzaCarteraMovimientos } from "@/hooks/use-cobranza-cartera-movimientos";
import { useCobranzaCartera } from "@/hooks/use-cobranza-cartera";
import { cn } from "@/lib/utils";
import { filterCarteraPorUmbral } from "@/services/cobranzaCarteraMovimientos";
import type { CarteraItemPayload } from "@/services/cobranzaCarteraService";
import {
  brechaKind,
  formatPlazoDias,
  type PlazosComerciales,
} from "@/services/cobranzaPlazosComerciales";
import { formatMxn } from "@/services/money";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

type SortKey =
  | "accountNumber"
  | "entityName"
  | "saldoInicial"
  | "facturadoOCompradoEnMes"
  | "pagadoEnMes"
  | "saldoPendiente";

type SortDir = "asc" | "desc";

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;

/** Búsqueda case/acentos-insensible. */
function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS_RE, "");
}

function formatMoney(value: number, moneda: string): string {
  const formatted = formatMxn(value);
  return moneda === "USD" ? formatted.replace("$", "US$") : formatted;
}

/** "YYYY-MM-DD" → "DD/MM/AAAA" sin pasar por Date (evita corrimientos de zona). */
function formatFechaDiaMesAnio(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  if (!anio || !mes || !dia) return fechaIso;
  return `${dia}/${mes}/${anio}`;
}

function KpiCard({
  label,
  value,
  tone,
  favoriteId,
}: {
  label: string;
  value: string;
  tone: "margins" | "solvency";
  favoriteId?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-card border p-6 shadow-[var(--shadow-card)]",
        tone === "margins"
          ? "border-category-marginsFg/20 bg-category-margins"
          : "border-category-solvencyFg/20 bg-category-solvency",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-sans text-lg font-bold text-foreground">{label}</p>
        {favoriteId ? <FavoriteStarButton widgetId={favoriteId} label={label} /> : null}
      </div>
      <p className="financial-nums mt-4 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </article>
  );
}

function PlazoKpiCard({
  title,
  subtitle,
  value,
  tone,
  favoriteId,
}: {
  title: string;
  subtitle: string;
  value: string;
  tone: "margins" | "solvency" | "efficiency";
  favoriteId?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-card border p-6 shadow-[var(--shadow-card)]",
        tone === "margins" && "border-category-marginsFg/20 bg-category-margins",
        tone === "solvency" && "border-category-solvencyFg/20 bg-category-solvency",
        tone === "efficiency" && "border-category-efficiencyFg/20 bg-category-efficiency",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-sans text-lg font-bold text-foreground">{title}</p>
        {favoriteId ? <FavoriteStarButton widgetId={favoriteId} label={title} /> : null}
      </div>
      <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">{subtitle}</p>
      <p className="financial-nums mt-4 text-3xl font-bold tracking-tight text-foreground">{value}</p>
    </article>
  );
}

/**
 * Comparativa DSO / DPO / brecha siempre visible (ambos subtabs clientes y
 * proveedores): la historia es el gap comercial, no un lado aislado.
 * Tres tarjetas en el grid de 3 columnas ya usado por Total Cartera / Cobrado /
 * Facturación — respiran mejor que una tarjeta combinada en este ancho.
 */
function PlazosComercialesRow({ plazos }: { plazos: PlazosComerciales }) {
  const { t } = useLocale();
  const kind = brechaKind(plazos.brecha);
  const na = t("common.na");
  const brechaTone = kind === "superavit" ? "margins" : "efficiency";

  return (
    <div className="mb-6 space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PlazoKpiCard
          title={t("cobranza.cartera.dsoTitle")}
          subtitle={t("cobranza.cartera.plazoSubtitle")}
          value={formatPlazoDias(plazos.dso, na)}
          tone="margins"
          favoriteId="kpi-cobranza-dso"
        />
        <PlazoKpiCard
          title={t("cobranza.cartera.dpoTitle")}
          subtitle={t("cobranza.cartera.plazoSubtitle")}
          value={formatPlazoDias(plazos.dpo, na)}
          tone="solvency"
          favoriteId="kpi-cobranza-dpo"
        />
        <PlazoKpiCard
          title={t("cobranza.cartera.brechaTitle")}
          subtitle={t("cobranza.cartera.brechaSubtitle")}
          value={formatPlazoDias(plazos.brecha, na)}
          tone={brechaTone}
        />
      </div>
      {kind === "deficit" ? (
        <p
          className="rounded-xl border border-category-efficiencyFg/25 bg-category-efficiency px-3 py-2 text-sm font-medium text-category-efficiencyFg"
          role="status"
        >
          {t("cobranza.cartera.brechaDeficit", { days: formatPlazoDias(plazos.brecha, na) })}
        </p>
      ) : null}
      {kind === "superavit" ? (
        <p
          className="rounded-xl border border-category-marginsFg/25 bg-category-margins px-3 py-2 text-sm font-medium text-category-marginsFg"
          role="status"
        >
          {t("cobranza.cartera.brechaSuperavit")}
        </p>
      ) : null}
    </div>
  );
}

/** Detalle inline del auxiliar: movimientos cronológicos con saldo acumulado. */
function CarteraMovimientosDetalle({ cuenta, moneda }: { cuenta: string; moneda: string }) {
  const { t } = useLocale();
  const { data, loading, error } = useCobranzaCarteraMovimientos(cuenta, moneda);

  if (loading) {
    return (
      <div className="space-y-2 bg-muted/30 px-8 py-4" aria-busy="true">
        <div className="h-3.5 w-1/4 animate-pulse rounded bg-secondary" />
        <div className="h-3.5 w-full animate-pulse rounded bg-secondary" />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-secondary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-muted/30 px-8 py-4 text-sm text-muted-foreground">{error}</div>
    );
  }
  if (!data) {
    return null;
  }

  return (
    <div className="bg-muted/30 px-8 py-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <th className="pb-1.5 pr-3 font-medium">{t("cobranza.cartera.colFecha")}</th>
            <th className="pb-1.5 pr-3 font-medium">{t("cobranza.cartera.colPoliza")}</th>
            <th className="pb-1.5 pr-3 font-medium">{t("cobranza.cartera.colConcepto")}</th>
            <th className="pb-1.5 text-right font-medium">{t("cobranza.cartera.colCargo")}</th>
            <th className="pb-1.5 text-right font-medium">{t("cobranza.cartera.colAbono")}</th>
            <th className="pb-1.5 text-right font-medium">
              {t("cobranza.cartera.colSaldoAcumulado")}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/50 text-muted-foreground">
            <td className="py-1.5 pr-3" colSpan={3}>
              {t("cobranza.cartera.filaSaldoInicial")}
            </td>
            <td className="py-1.5 text-right" colSpan={2} />
            <td className="financial-nums py-1.5 text-right font-medium">
              {formatMoney(data.saldoInicial, moneda)}
            </td>
          </tr>
          {data.movimientos.length === 0 ? (
            <tr className="border-b border-border/50">
              <td className="py-2 pr-3 text-muted-foreground" colSpan={6}>
                {t("cobranza.cartera.sinMovimientos")}
              </td>
            </tr>
          ) : (
            data.movimientos.map((movimiento) => (
              <tr key={movimiento.id} className="border-b border-border/50">
                <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">
                  {formatFechaDiaMesAnio(movimiento.fecha)}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">
                  {movimiento.tipoPoliza}-{movimiento.numeroPoliza}
                </td>
                <td className="max-w-md truncate py-1.5 pr-3 text-foreground" title={movimiento.concepto}>
                  {movimiento.concepto}
                  {movimiento.referencia ? (
                    <span className="text-muted-foreground"> · {movimiento.referencia}</span>
                  ) : null}
                </td>
                <td className="financial-nums py-1.5 text-right text-foreground">
                  {movimiento.cargos !== 0 ? formatMoney(movimiento.cargos, moneda) : "—"}
                </td>
                <td className="financial-nums py-1.5 text-right text-foreground">
                  {movimiento.abonos !== 0 ? formatMoney(movimiento.abonos, moneda) : "—"}
                </td>
                <td className="financial-nums py-1.5 text-right font-medium text-foreground">
                  {formatMoney(movimiento.saldoAcumulado, moneda)}
                </td>
              </tr>
            ))
          )}
          <tr className="text-foreground">
            <td className="pt-1.5 pr-3 font-medium" colSpan={3}>
              {t("cobranza.cartera.filaSaldoFinal")}
            </td>
            <td className="pt-1.5" colSpan={2} />
            <td className="financial-nums pt-1.5 text-right font-semibold">
              {formatMoney(data.saldoFinal, moneda)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CarteraTable({
  items,
  moneda,
  facturadoLabel,
  pagadoLabel,
}: {
  items: CarteraItemPayload[];
  moneda: string;
  facturadoLabel: string;
  pagadoLabel: string;
}) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("saldoPendiente");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [mostrarSaldadas, setMostrarSaldadas] = useState(false);
  const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo(() => {
    const needle = normalizeSearch(search.trim());
    const bySearch = needle
      ? items.filter(
          (item) =>
            normalizeSearch(item.entityName).includes(needle) ||
            normalizeSearch(item.accountNumber).includes(needle),
        )
      : items;
    const byUmbral = filterCarteraPorUmbral(bySearch, mostrarSaldadas);
    const direction = sortDir === "asc" ? 1 : -1;
    return [...byUmbral].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const cmp =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return cmp * direction;
    });
  }, [items, search, mostrarSaldadas, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "entityName" || key === "accountNumber" ? "asc" : "desc");
  };

  const toggleRow = (accountNumber: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(accountNumber)) {
        next.delete(accountNumber);
      } else {
        next.add(accountNumber);
      }
      return next;
    });
  };

  const columns: Array<{ key: SortKey; label: string; numeric: boolean }> = [
    { key: "accountNumber", label: t("cobranza.cartera.colCuenta"), numeric: false },
    { key: "entityName", label: t("cobranza.cartera.colNombre"), numeric: false },
    { key: "saldoInicial", label: t("cobranza.cartera.colSaldoInicial"), numeric: true },
    { key: "facturadoOCompradoEnMes", label: facturadoLabel, numeric: true },
    { key: "pagadoEnMes", label: pagadoLabel, numeric: true },
    { key: "saldoPendiente", label: t("cobranza.cartera.colSaldoPendiente"), numeric: true },
  ];

  return (
    <div className="mt-4 rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("cobranza.cartera.buscar")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <input
              type="checkbox"
              checked={mostrarSaldadas}
              onChange={(event) => setMostrarSaldadas(event.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-clay"
            />
            {t("cobranza.cartera.mostrarSaldadas")}
          </label>
          <p className="text-xs text-muted-foreground">
            {t("cobranza.cartera.cuentasCount", { count: rows.length })}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-beige-deep text-left text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="w-10 pb-2" aria-label={t("cobranza.cartera.colDetalle")} />
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn("pb-2 font-medium", column.numeric && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      "inline-flex items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-foreground",
                      column.numeric && "flex-row-reverse",
                    )}
                  >
                    {column.label}
                    {sortKey === column.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = expandedRows.has(row.accountNumber);
              return (
                <Fragment key={row.accountNumber}>
                  <tr className="border-b border-beige-deep last:border-0">
                    <td className="w-10 py-3 pr-2">
                      <button
                        type="button"
                        onClick={() => toggleRow(row.accountNumber)}
                        aria-expanded={expanded}
                        aria-label={t("cobranza.cartera.toggleDetalle", {
                          name: row.entityName,
                        })}
                        className="flex h-6 w-6 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.accountNumber}</td>
                    <td className="py-3 pr-4 font-sans text-base text-foreground">
                      {row.entityName}
                    </td>
                    <td className="financial-nums py-3 text-right text-foreground">
                      {formatMoney(row.saldoInicial, moneda)}
                    </td>
                    <td className="financial-nums py-3 text-right text-foreground">
                      {formatMoney(row.facturadoOCompradoEnMes, moneda)}
                    </td>
                    <td className="financial-nums py-3 text-right text-foreground">
                      {formatMoney(row.pagadoEnMes, moneda)}
                    </td>
                    <td className="financial-nums py-3 text-right font-semibold text-foreground">
                      {formatMoney(row.saldoPendiente, moneda)}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b border-beige-deep last:border-0">
                      <td colSpan={columns.length + 1} className="p-0">
                        <CarteraMovimientosDetalle cuenta={row.accountNumber} moneda={moneda} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">
                  {t("cobranza.cartera.sinResultados")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CobranzaCarteraSection() {
  const { t } = useLocale();
  const [moneda, setMoneda] = useState("MXN");
  const { data, loading, error } = useCobranzaCartera(moneda);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error) {
    return <DataEmptyState title={t("cobranza.loadError")} message={error} />;
  }
  if (!data?.hasData) {
    return (
      <DataEmptyState
        title={t("cobranza.cartera.emptyTitle")}
        message={t("cobranza.cartera.emptyMessage")}
      />
    );
  }

  return (
    <section>
      <PlazosComercialesRow plazos={data.plazos} />
      <Tabs defaultValue="cxc">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="w-auto">
            <TabsTrigger value="cxc">{t("cobranza.cartera.tabCxc")}</TabsTrigger>
            <TabsTrigger value="cxp">{t("cobranza.cartera.tabCxp")}</TabsTrigger>
          </TabsList>
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

        <TabsContent value="cxc">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <KpiCard
              label={t("cobranza.cartera.totalPendienteCxc")}
              value={formatMoney(data.clientes.totalPendiente, data.moneda)}
              tone="margins"
              favoriteId="kpi-cobranza-total-cartera"
            />
            <KpiCard
              label={t("cobranza.cartera.cobradoEnMes")}
              value={formatMoney(data.clientes.cobradoEnMes, data.moneda)}
              tone="margins"
              favoriteId="kpi-cobranza-cobrado"
            />
            <KpiCard
              label={t("cobranza.cartera.facturadoEnMes")}
              value={formatMoney(data.clientes.facturadoEnMes, data.moneda)}
              tone="margins"
              favoriteId="kpi-cobranza-facturacion"
            />
          </div>
          <CarteraTable
            items={data.clientes.items}
            moneda={data.moneda}
            facturadoLabel={t("cobranza.cartera.colFacturado")}
            pagadoLabel={t("cobranza.cartera.colCobrado")}
          />
        </TabsContent>

        <TabsContent value="cxp">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <KpiCard
              label={t("cobranza.cartera.totalPendienteCxp")}
              value={formatMoney(data.proveedores.totalPendiente, data.moneda)}
              tone="solvency"
            />
            <KpiCard
              label={t("cobranza.cartera.pagadoEnMes")}
              value={formatMoney(data.proveedores.pagadoEnMes, data.moneda)}
              tone="solvency"
            />
            <KpiCard
              label={t("cobranza.cartera.compradoEnMes")}
              value={formatMoney(data.proveedores.compradoEnMes, data.moneda)}
              tone="solvency"
            />
          </div>
          <CarteraTable
            items={data.proveedores.items}
            moneda={data.moneda}
            facturadoLabel={t("cobranza.cartera.colComprado")}
            pagadoLabel={t("cobranza.cartera.colPagado")}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

export type CobranzaCarteraKpiKey = "total-cartera" | "cobrado" | "facturacion" | "dso" | "dpo";

/**
 * KPI individual de cartera para el Panel de Control. Auto-fetch en MXN
 * (moneda base de la balanza; api-cache deduplica con la vista de Cobranza).
 */
export function CobranzaCarteraKpiCard({ kpi }: { kpi: CobranzaCarteraKpiKey }) {
  const { t } = useLocale();
  const { data, loading, error } = useCobranzaCartera("MXN");

  if (loading) {
    return <div className="h-32 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data?.hasData) {
    return null;
  }

  const na = t("common.na");
  if (kpi === "dso" || kpi === "dpo") {
    const isDso = kpi === "dso";
    return (
      <PlazoKpiCard
        title={t(isDso ? "cobranza.cartera.dsoTitle" : "cobranza.cartera.dpoTitle")}
        subtitle={t("cobranza.cartera.plazoSubtitle")}
        value={formatPlazoDias(isDso ? data.plazos.dso : data.plazos.dpo, na)}
        tone={isDso ? "margins" : "solvency"}
        favoriteId={`kpi-cobranza-${kpi}`}
      />
    );
  }

  const config = {
    "total-cartera": { label: t("cobranza.cartera.totalPendienteCxc"), value: data.clientes.totalPendiente },
    cobrado: { label: t("cobranza.cartera.cobradoEnMes"), value: data.clientes.cobradoEnMes },
    facturacion: { label: t("cobranza.cartera.facturadoEnMes"), value: data.clientes.facturadoEnMes },
  }[kpi];
  return (
    <KpiCard
      label={config.label}
      value={formatMoney(config.value, data.moneda)}
      tone="margins"
      favoriteId={`kpi-cobranza-${kpi}`}
    />
  );
}
