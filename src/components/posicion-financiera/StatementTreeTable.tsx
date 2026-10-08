"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/LocaleContext";
import {
  collectExpandableIds,
  defaultExpandedIds,
  filterEmptyNodes,
  formatStatementMoney,
  formatStatementRatio,
  verticalPct,
  yoyDeltaPct,
  type StatementColumn,
  type StatementNode,
  type StatementPolarity,
} from "@/services/posicionFinanciera";
import { ChevronDown, Download, Info, RefreshCw } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { TableScroll } from "@/components/ui/table-scroll";

type NumberMode = "money" | "ratio";

type StatementTreeTableProps = {
  title: string;
  titleHint: string;
  /** Frase visible bajo el título; si no viene, el encabezado queda igual. */
  subtitle?: string;
  nodes: StatementNode[];
  columns: StatementColumn[];
  numberMode: NumberMode;
  showCode?: boolean;
  showEmptyToggle?: boolean;
  showYoY?: boolean;
  verticalBase?: Record<string, number | null>;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  resetKey?: string;
  onRefresh: () => void;
  /** Id de widget fijable (favoritesRegistry); muestra la estrella en el header. */
  favoriteId?: string;
  /** Drill-down de pólizas: filas hoja con código de cuenta se vuelven clicables. */
  onAuditAccount?: (target: { codigoCuenta: string; nombreCuenta: string }) => void;
};

type VisibleRow = {
  node: StatementNode;
  depth: number;
};

function deltaClass(polarity: StatementPolarity | undefined, delta: number): string {
  if (delta === 0 || polarity === "neutral" || polarity == null) {
    return "text-muted-foreground";
  }
  const up = delta > 0;
  const favorable = polarity === "higherIsBetter" ? up : !up;
  return favorable ? "text-favorable" : "text-desfavorable";
}

function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  return `${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} ${abs}%`;
}

function flattenVisible(nodes: StatementNode[], expanded: Set<string>, depth = 0): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children && node.children.length > 0 && expanded.has(node.id)) {
      rows.push(...flattenVisible(node.children, expanded, depth + 1));
    }
  }
  return rows;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCell(node: StatementNode, key: string, numberMode: NumberMode): string {
  const value = node.values[key];
  if (numberMode === "ratio") {
    return formatStatementRatio(value, node.format ?? "x");
  }
  return formatStatementMoney(value, node.outflow === true);
}

function formatVerticalPct(pct: number | null): string {
  if (pct == null) {
    return "—";
  }
  return `${pct.toFixed(1)}%`;
}

export function StatementTreeTable({
  title,
  titleHint,
  subtitle,
  nodes,
  columns,
  numberMode,
  showCode = false,
  showEmptyToggle = true,
  showYoY = false,
  verticalBase,
  loading = false,
  empty = false,
  emptyMessage,
  resetKey,
  onRefresh,
  favoriteId,
  onAuditAccount,
}: StatementTreeTableProps) {
  const { t } = useLocale();
  const resolvedEmptyMessage = emptyMessage ?? t("posicionFinanciera.emptyTable");
  const nodeLabel = (node: StatementNode) => node.labelKey ? t(node.labelKey) : node.label;
  const valueKeys = useMemo(() => columns.map((column) => column.key), [columns]);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showVertical, setShowVertical] = useState(false);
  const verticalEnabled = Boolean(verticalBase) && numberMode === "money";
  const verticalActive = verticalEnabled && showVertical;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpandedIds(nodes)));

  useEffect(() => {
    setExpanded(new Set(defaultExpandedIds(nodes)));
  }, [resetKey]);

  const displayNodes = useMemo(() => {
    if (!showEmptyToggle || showEmpty) {
      return nodes;
    }
    return filterEmptyNodes(nodes, valueKeys);
  }, [nodes, showEmpty, showEmptyToggle, valueKeys]);

  const expandableIds = useMemo(() => collectExpandableIds(displayNodes), [displayNodes]);
  const allExpanded = expandableIds.length > 0 && expandableIds.every((id) => expanded.has(id));

  const rows = useMemo(() => flattenVisible(displayNodes, expanded), [displayNodes, expanded]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpanded(new Set(defaultExpandedIds(displayNodes)));
      return;
    }
    setExpanded(new Set(expandableIds));
  };

  const exportCsv = () => {
    const header = [
      ...(showCode ? [t("posicionFinanciera.account")] : []),
      t("posicionFinanciera.name"),
      ...columns.flatMap((column) => {
        const label = column.labelKey ? t(column.labelKey) : column.label;
        return verticalActive ? [label, `${label} %`] : [label];
      }),
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const row of rows) {
      const indent = "  ".repeat(row.depth);
      const cells = [
        ...(showCode ? [row.node.code ?? ""] : []),
        `${indent}${nodeLabel(row.node)}`,
        ...columns.flatMap((column) => {
          const value = formatCell(row.node, column.key, numberMode);
          return verticalActive
            ? [value, formatVerticalPct(verticalPct(row.node.values[column.key], verticalBase?.[column.key]))]
            : [value];
        }),
      ];
      lines.push(cells.map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/\s+/g, "-").toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TooltipProvider>
      <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-sans text-xl font-medium text-foreground">{title}</h2>
              {favoriteId ? <FavoriteStarButton widgetId={favoriteId} label={title} /> : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="touch-hit text-muted-foreground hover:text-clay" aria-label={t("posicionFinanciera.information")}>
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{titleHint}</TooltipContent>
              </Tooltip>
            </div>
            {subtitle ? <p className="mt-1 max-w-2xl font-sans text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {t("posicionFinanciera.source")}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  {t("common.export")}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={exportCsv}>CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t("posicionFinanciera.refresh")}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <button type="button" className="touch-hit-y font-medium text-clay hover:text-clay-hover" onClick={toggleExpandAll}>
            {allExpanded ? t("posicionFinanciera.collapseAll") : t("posicionFinanciera.expandAll")}
          </button>
          {showEmptyToggle ? (
            <label className="inline-flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-border accent-clay"
                checked={showEmpty}
                onChange={(event) => setShowEmpty(event.target.checked)}
              />
              {t("posicionFinanciera.showEmpty")}
            </label>
          ) : null}
          {verticalEnabled ? (
            <label className="inline-flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-border accent-clay"
                checked={showVertical}
                onChange={(event) => setShowVertical(event.target.checked)}
              />
              {t("resultados.verticalAnalysis")}
            </label>
          ) : null}
        </div>

        <TableScroll className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-8 animate-pulse rounded-control bg-secondary" />
              ))}
            </div>
          ) : empty ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{resolvedEmptyMessage}</p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-beige-deep">
                  {showCode ? (
                    <th className="px-2 py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{t("posicionFinanciera.account")}</th>
                  ) : null}
                  <th className="px-2 py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{t("posicionFinanciera.name")}</th>
                  {columns.map((column) => (
                    <Fragment key={column.key}>
                      <th className="px-2 py-2 text-right text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                        {column.labelKey ? t(column.labelKey) : column.label}
                      </th>
                      {verticalActive ? (
                        <th className="px-2 py-2 text-right text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                          %
                        </th>
                      ) : null}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasChildren = Boolean(row.node.children && row.node.children.length > 0);
                  const isOpen = expanded.has(row.node.id);
                  const strong = row.node.kind === "total" || (row.node.kind === "group" && row.depth === 0);
                  // Drill-down solo en hojas con cuenta real: las filas grupo
                  // conservan su botón +/− de expansión como única acción.
                  const auditCode = !hasChildren && row.node.code ? row.node.code : null;
                  return (
                    <tr key={row.node.id} className="border-b border-beige-deep hover:bg-secondary/45">
                      {showCode ? (
                        <td className="financial-nums whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                          {row.node.code ?? ""}
                        </td>
                      ) : null}
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2" style={{ paddingLeft: 12 + row.depth * 20 }}>
                          {hasChildren ? (
                            <button
                              type="button"
                              aria-label={isOpen ? t("posicionFinanciera.collapse") : t("posicionFinanciera.expand")}
                              onClick={() => toggleExpand(row.node.id)}
                              className="touch-hit inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border border-beige-deep text-[11px] leading-none text-muted-foreground"
                            >
                              {isOpen ? "−" : "+"}
                            </button>
                          ) : (
                            <span className="inline-block h-4 w-4 shrink-0" />
                          )}
                          {auditCode && onAuditAccount ? (
                            <button
                              type="button"
                              onClick={() =>
                                onAuditAccount({ codigoCuenta: auditCode, nombreCuenta: nodeLabel(row.node) })
                              }
                              title={t("polizas.audit.drillHint")}
                              className={cn(
                                "rounded-[4px] text-left font-sans text-base text-foreground transition-colors hover:text-clay hover:underline hover:decoration-clay/40 hover:underline-offset-4",
                                strong && "font-medium",
                              )}
                            >
                              {nodeLabel(row.node)}
                            </button>
                          ) : (
                            <span className={cn("font-sans text-base text-foreground", strong && "font-medium")}>{nodeLabel(row.node)}</span>
                          )}
                          {row.node.formulaKey || row.node.formula ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-muted-foreground/60 hover:text-clay" aria-label={t("posicionFinanciera.formula")}>
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {row.node.formulaKey ? t(row.node.formulaKey) : row.node.formula}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      </td>
                      {columns.map((column, columnIndex) => {
                        const value = row.node.values[column.key];
                        const priorKey = columns[columnIndex + 1]?.key;
                        const delta =
                          showYoY && numberMode === "money" && column.showYoY && priorKey
                            ? yoyDeltaPct(value, row.node.values[priorKey] ?? null)
                            : null;
                        const ratioDelta =
                          numberMode === "ratio" &&
                          column.showYoY &&
                          priorKey &&
                          value != null &&
                          row.node.values[priorKey] != null
                            ? value - (row.node.values[priorKey] ?? 0)
                            : null;
                        return (
                          <Fragment key={column.key}>
                            <td className="financial-nums whitespace-nowrap px-2 py-2 text-right">
                              <span
                                className={cn(
                                  strong && "font-semibold",
                                  numberMode === "ratio" && value != null && Number.isFinite(value)
                                    ? "text-favorable"
                                    : row.node.outflow
                                      ? "text-muted-foreground"
                                      : "text-foreground",
                                )}
                              >
                                {formatCell(row.node, column.key, numberMode)}
                              </span>
                              {delta != null ? (
                                <span className={cn("ml-2 text-[11px]", deltaClass(row.node.polarity, delta))}>
                                  {formatDelta(delta)}
                                </span>
                              ) : null}
                              {numberMode === "ratio" && ratioDelta != null && Math.abs(ratioDelta) >= 0.0001 ? (
                                <span className="ml-2 text-[11px] text-muted-foreground">
                                  {ratioDelta > 0 ? "▲" : "▼"} {Math.abs(ratioDelta).toFixed(2)}
                                </span>
                              ) : null}
                            </td>
                            {verticalActive ? (
                              <td className="financial-nums whitespace-nowrap px-2 py-2 text-right text-xs text-muted-foreground">
                                {formatVerticalPct(verticalPct(value, verticalBase?.[column.key]))}
                              </td>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableScroll>
      </section>
    </TooltipProvider>
  );
}
