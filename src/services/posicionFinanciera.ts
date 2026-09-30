import type { BalanzaPnL } from "@/generated/prisma/client";
import type { CatalogCategories, CatalogMetric, MetricUnit } from "@/services/financialEngine";
import { matchesRole } from "@/services/ingest/accountRoles";
import type { AccountRoleRule, AccountRoles } from "@/services/ingest/types";
import {
  balanceSignConvention,
  isCurrentAsset,
  isCurrentLiability,
  isFinancialExpenseAccount,
  isIncomeTaxAccount,
  money,
  resultadoEjercicioYtd,
} from "@/services/metricsLedger";
import { nearlyEqual, round2 } from "@/services/money";

export type StatementPolarity = "higherIsBetter" | "lowerIsBetter" | "neutral";

export type StatementValueFormat = "money" | "pct" | "x" | "days" | "score";

export type StatementNode = {
  id: string;
  label: string;
  labelKey?: string;
  kind: "group" | "account" | "total";
  code?: string;
  formula?: string;
  formulaKey?: string;
  outflow?: boolean;
  format?: StatementValueFormat;
  children?: StatementNode[];
  values: Record<string, number | null>;
  polarity?: StatementPolarity;
};

export type StatementColumn = {
  key: string;
  label: string;
  labelKey?: string;
  showYoY?: boolean;
};

export type AccountLine = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: BalanzaPnL["categoriaMaestra"];
  depreciacionAmortizacion: boolean;
  values: Record<string, number | null>;
};

export function formatStatementMoney(value: number | null, outflow = false): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  if (abs < 0.01) {
    return "0";
  }
  const useDecimals = abs < 1;
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: useDecimals ? 2 : 0,
    maximumFractionDigits: useDecimals ? 2 : 0,
  });
  const wrap = value < -0.005 || (outflow && value > 0.005);
  return wrap ? `(${formatted})` : formatted;
}

export function formatStatementRatio(value: number | null, unit: StatementValueFormat): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  if (unit === "pct") {
    return `${value.toFixed(1)}%`;
  }
  if (unit === "days") {
    return value.toFixed(1);
  }
  if (unit === "score") {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

export function yoyDeltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  if (Math.abs(previous) < 0.01) {
    return null;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function unitToFormat(unit: MetricUnit): StatementValueFormat {
  return unit;
}

export function verticalPct(
  value: number | null | undefined,
  base: number | null | undefined,
): number | null {
  if (
    value == null ||
    base == null ||
    !Number.isFinite(value) ||
    !Number.isFinite(base) ||
    Math.abs(base) < 0.01
  ) {
    return null;
  }
  return (Math.abs(value) / Math.abs(base)) * 100;
}

function emptyValues(keys: string[]): Record<string, number | null> {
  return Object.fromEntries(keys.map((key) => [key, null]));
}

function addAmount(values: Record<string, number | null>, key: string, amount: number): void {
  const current = values[key];
  values[key] = round2((current ?? 0) + amount);
}

function sumChildValues(children: StatementNode[], keys: string[]): Record<string, number | null> {
  const values = emptyValues(keys);
  for (const key of keys) {
    let sum = 0;
    let any = false;
    for (const child of children) {
      const amount = child.values[key];
      if (amount != null && Number.isFinite(amount)) {
        sum += amount;
        any = true;
      }
    }
    values[key] = any ? round2(sum) : null;
  }
  return values;
}

function isEffectivelyZero(values: Record<string, number | null>, keys: string[]): boolean {
  return keys.every((key) => {
    const amount = values[key];
    return amount == null || !Number.isFinite(amount) || Math.abs(amount) < 0.01;
  });
}

export function filterEmptyNodes(nodes: StatementNode[], valueKeys: string[]): StatementNode[] {
  const result: StatementNode[] = [];
  for (const node of nodes) {
    const children = node.children ? filterEmptyNodes(node.children, valueKeys) : undefined;
    const hasChildren = Boolean(children && children.length > 0);
    if (node.kind === "total") {
      result.push(children ? { ...node, children } : node);
      continue;
    }
    if (hasChildren) {
      result.push({ ...node, children });
      continue;
    }
    if (!isEffectivelyZero(node.values, valueKeys)) {
      result.push({ ...node, children });
    }
  }
  return result;
}

export function collectExpandableIds(nodes: StatementNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: StatementNode[]) => {
    for (const node of list) {
      if (node.children && node.children.length > 0) {
        ids.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

export function defaultExpandedIds(nodes: StatementNode[]): string[] {
  return nodes.filter((node) => node.children && node.children.length > 0).map((node) => node.id);
}

function digits(idCuenta: string): string {
  return idCuenta.replace(/\D/g, "");
}

function nearestParentId(code: string, items: Array<{ id: string; code: string }>): string | null {
  let best: { id: string; code: string } | null = null;
  for (const candidate of items) {
    if (candidate.code.length > 0 && code.startsWith(candidate.code) && candidate.code.length < code.length) {
      if (!best || candidate.code.length > best.code.length) {
        best = candidate;
      }
    }
  }
  return best?.id ?? null;
}

function buildPrefixForest(
  lines: AccountLine[],
  yearKeys: string[],
  options: { polarity: StatementPolarity; outflow?: boolean; idPrefix: string },
): StatementNode[] {
  const merged = new Map<string, AccountLine>();
  for (const line of lines) {
    const existing = merged.get(line.idCuenta);
    if (!existing) {
      merged.set(line.idCuenta, {
        ...line,
        values: { ...emptyValues(yearKeys), ...line.values },
      });
      continue;
    }
    for (const key of yearKeys) {
      const amount = line.values[key];
      if (amount != null) {
        addAmount(existing.values, key, amount);
      }
    }
  }

  const items = [...merged.values()].map((line) => ({
    id: `${options.idPrefix}:${line.idCuenta}`,
    accountId: line.idCuenta,
    label: line.nombreCuenta,
    code: digits(line.idCuenta),
    values: line.values,
  }));

  const parentById = new Map<string, string | null>();
  for (const item of items) {
    parentById.set(item.id, item.code.length > 0 ? nearestParentId(item.code, items) : null);
  }

  const childrenByParent = new Map<string | null, typeof items>();
  for (const item of items) {
    const parent = parentById.get(item.id) ?? null;
    const list = childrenByParent.get(parent) ?? [];
    list.push(item);
    childrenByParent.set(parent, list);
  }

  const toNodes = (parentId: string | null): StatementNode[] => {
    const group = [...(childrenByParent.get(parentId) ?? [])].sort((a, b) =>
      a.code.localeCompare(b.code, "es") || a.label.localeCompare(b.label, "es"),
    );
    return group.map((item) => {
      const children = toNodes(item.id);
      if (children.length === 0) {
        return {
          id: item.id,
          label: item.label,
          kind: "account" as const,
          code: item.accountId,
          outflow: options.outflow,
          values: item.values,
          polarity: options.polarity,
        };
      }
      return {
        id: item.id,
        label: item.label,
        kind: "group" as const,
        code: item.accountId,
        outflow: options.outflow,
        children,
        values: sumChildValues(children, yearKeys),
        polarity: options.polarity,
      };
    });
  };

  return toNodes(null);
}

function groupNode(
  id: string,
  label: string,
  yearKeys: string[],
  children: StatementNode[],
  polarity: StatementPolarity,
  extra?: Partial<StatementNode>,
): StatementNode {
  return {
    id,
    label,
    kind: "group",
    children,
    values: children.length > 0 ? sumChildValues(children, yearKeys) : emptyValues(yearKeys),
    polarity,
    ...extra,
  };
}

export function mergeBalanceRows(
  rowsByYear: Record<string, BalanzaPnL[]>,
  yearKeys: string[],
  amountOf: (row: BalanzaPnL) => number,
): AccountLine[] {
  const byAccount = new Map<string, AccountLine>();
  for (const year of yearKeys) {
    for (const row of rowsByYear[year] ?? []) {
      const line = byAccount.get(row.idCuenta);
      if (!line) {
        byAccount.set(row.idCuenta, {
          idCuenta: row.idCuenta,
          nombreCuenta: row.nombreCuenta,
          categoriaMaestra: row.categoriaMaestra,
          depreciacionAmortizacion: row.depreciacionAmortizacion,
          values: { ...emptyValues(yearKeys), [year]: round2(amountOf(row)) },
        });
        continue;
      }
      addAmount(line.values, year, amountOf(row));
      if (row.depreciacionAmortizacion) {
        line.depreciacionAmortizacion = true;
      }
    }
  }
  return [...byAccount.values()];
}

export function pnlMovement(row: BalanzaPnL): number {
  if (row.categoriaMaestra === "Ingreso") {
    return round2(money(row.haber) - money(row.debe));
  }
  return round2(money(row.debe) - money(row.haber));
}

export type CapitalGroupKey =
  | "capitalSocial"
  | "reservas"
  | "resultadosAcumulados"
  | "resultadoEjercicio"
  | "otrasCapital";

const CAPITAL_GROUP_ORDER = [
  "capitalSocial",
  "reservas",
  "resultadosAcumulados",
  "resultadoEjercicio",
] as const;

/**
 * Default NIF del capital contable sobre el catálogo Compac verificado en DB
 * (auditoría B3): 3101 capital social y 3102 aportaciones patrimoniales; 3103
 * reserva legal; 3104/3105 utilidades/pérdidas y resultados de ejercicios
 * anteriores. El resultado del ejercicio no existe como cuenta 3xxx en Compac:
 * se calcula del PyG; el rol solo agrupa cuentas de catálogos que sí la llevan.
 */
const DEFAULT_CAPITAL_GROUP_RULES: Record<(typeof CAPITAL_GROUP_ORDER)[number], AccountRoleRule> = {
  capitalSocial: {
    prefixes: ["3101", "3102"],
    nameTokens: ["capital social", "capital variable", "aportacion"],
  },
  reservas: { prefixes: ["3103"], nameTokens: ["reserva"] },
  resultadosAcumulados: {
    prefixes: ["3104", "3105"],
    nameTokens: ["ejercicios anteriores", "utilidades retenidas", "resultados acumulados"],
  },
  resultadoEjercicio: { prefixes: [], nameTokens: ["resultado del ejercicio"] },
};

/**
 * Sub-grupo NIF de una cuenta de capital. Los roles del perfil efectivo ganan
 * sobre el default (patrón B1/B2); las cuentas que nadie reclama caen en
 * "otrasCapital" para que el cuadre no se rompa con catálogos ajenos.
 */
export function capitalGroupOf(
  idCuenta: string,
  nombreCuenta: string,
  roles?: AccountRoles | null,
): CapitalGroupKey {
  if (roles) {
    for (const key of CAPITAL_GROUP_ORDER) {
      const rule = roles[key];
      if (rule && matchesRole(rule, idCuenta, nombreCuenta)) {
        return key;
      }
    }
  }
  for (const key of CAPITAL_GROUP_ORDER) {
    if (matchesRole(DEFAULT_CAPITAL_GROUP_RULES[key], idCuenta, nombreCuenta)) {
      return key;
    }
  }
  return "otrasCapital";
}

export function buildPosicionTree(
  rowsByYear: Record<string, BalanzaPnL[]>,
  yearKeys: string[],
  roles?: AccountRoles | null,
): StatementNode[] {
  const lines = mergeBalanceRows(rowsByYear, yearKeys, (row) => money(row.saldoFinal));
  const activos = lines.filter((line) => line.categoriaMaestra === "Activo");

  // Convención de PRESENTACIÓN (signo económico, documentada): Pasivo y
  // Capital se muestran como magnitudes económicas — positivo = lo que se debe
  // / el capital a favor de los socios; negativo = déficit patrimonial. La
  // balanza CONTPAQi persiste acreedores en negativo, así que se multiplica
  // por la convención detectada por año (balanceSignConvention). Con esta
  // presentación la identidad se lee directo en el árbol: A = P + C, y el
  // capital social ya no renderiza como un confuso "−600K".
  const signByYear = Object.fromEntries(
    yearKeys.map((year) => [year, balanceSignConvention(rowsByYear[year] ?? [])]),
  );
  const toEconomicSign = (input: AccountLine[]): AccountLine[] =>
    input.map((line) => ({
      ...line,
      values: Object.fromEntries(
        yearKeys.map((year) => {
          const amount = line.values[year];
          return [year, amount == null ? null : round2(amount * signByYear[year])];
        }),
      ),
    }));

  const pasivos = toEconomicSign(lines.filter((line) => line.categoriaMaestra === "Pasivo"));
  const capital = toEconomicSign(lines.filter((line) => line.categoriaMaestra === "Patrimonio"));

  const activoCorto = activos.filter((line) => isCurrentAsset(line.idCuenta, line.nombreCuenta, roles));
  const activoLargo = activos.filter((line) => !isCurrentAsset(line.idCuenta, line.nombreCuenta, roles));
  const pasivoCorto = pasivos.filter((line) => isCurrentLiability(line.idCuenta, line.nombreCuenta, roles));
  const pasivoLargo = pasivos.filter((line) => !isCurrentLiability(line.idCuenta, line.nombreCuenta, roles));

  const activoNode = groupNode(
    "epf:activo",
    "Activo",
    yearKeys,
    [
      groupNode(
        "epf:activo-cp",
        "Activo a corto plazo",
        yearKeys,
        buildPrefixForest(activoCorto, yearKeys, { polarity: "higherIsBetter", idPrefix: "epf:ac" }),
        "higherIsBetter",
        { labelKey: "posicionFinanciera.structure.currentAsset" },
      ),
      groupNode(
        "epf:activo-lp",
        "Activo a largo plazo",
        yearKeys,
        buildPrefixForest(activoLargo, yearKeys, { polarity: "higherIsBetter", idPrefix: "epf:al" }),
        "higherIsBetter",
        { labelKey: "posicionFinanciera.structure.noncurrentAsset" },
      ),
    ],
    "higherIsBetter",
    { labelKey: "posicionFinanciera.structure.asset" },
  );

  const pasivoNode = groupNode(
    "epf:pasivo",
    "Pasivo",
    yearKeys,
    [
      groupNode(
        "epf:pasivo-cp",
        "Pasivo a corto plazo",
        yearKeys,
        buildPrefixForest(pasivoCorto, yearKeys, { polarity: "lowerIsBetter", idPrefix: "epf:pc" }),
        "lowerIsBetter",
        { labelKey: "posicionFinanciera.structure.currentLiability" },
      ),
      groupNode(
        "epf:pasivo-lp",
        "Pasivo a largo plazo",
        yearKeys,
        buildPrefixForest(pasivoLargo, yearKeys, { polarity: "lowerIsBetter", idPrefix: "epf:pl" }),
        "lowerIsBetter",
        { labelKey: "posicionFinanciera.structure.noncurrentLiability" },
      ),
    ],
    "lowerIsBetter",
    { labelKey: "posicionFinanciera.structure.liability" },
  );

  const capitalByGroup: Record<CapitalGroupKey, AccountLine[]> = {
    capitalSocial: [],
    reservas: [],
    resultadosAcumulados: [],
    resultadoEjercicio: [],
    otrasCapital: [],
  };
  for (const line of capital) {
    capitalByGroup[capitalGroupOf(line.idCuenta, line.nombreCuenta, roles)].push(line);
  }

  // Resultado del ejercicio: la balanza cierra en cero por periodo, así que
  // el saldo acumulado de las cuentas de PyG ES el resultado YTD. Fuente
  // única: `resultadoEjercicioYtd` (metricsLedger), la misma que alimenta el
  // capital NIF del ROE. Se presenta con signo ECONÓMICO (utilidad positiva,
  // pérdida negativa) multiplicando por la convención del año; al sumarlo al
  // capital la identidad A = P + C cuadra al centavo con los valores
  // mostrados. En un ejercicio ya cerrado el PyG queda en cero y la línea
  // desaparece sin duplicar la cuenta 3xxx.
  const resultadoYtd = calculatedValues(yearKeys, (year) => {
    const rows = rowsByYear[year] ?? [];
    const hasPnl = rows.some(
      (row) =>
        row.categoriaMaestra === "Ingreso" ||
        row.categoriaMaestra === "COGS" ||
        row.categoriaMaestra === "OpEx",
    );
    return hasPnl ? round2(resultadoEjercicioYtd(rows) * signByYear[year]) : null;
  });

  const capitalForest = (lines: AccountLine[]): StatementNode[] =>
    buildPrefixForest(lines, yearKeys, { polarity: "higherIsBetter", idPrefix: "epf:cap" });

  const capitalChildren: StatementNode[] = [
    groupNode(
      "epf:capital-social",
      "Capital social",
      yearKeys,
      capitalForest(capitalByGroup.capitalSocial),
      "higherIsBetter",
      { labelKey: "posicionFinanciera.structure.capitalSocial" },
    ),
    groupNode(
      "epf:capital-reservas",
      "Reservas",
      yearKeys,
      capitalForest(capitalByGroup.reservas),
      "higherIsBetter",
      { labelKey: "posicionFinanciera.structure.reservas" },
    ),
    groupNode(
      "epf:capital-resultados-acumulados",
      "Resultados acumulados",
      yearKeys,
      capitalForest(capitalByGroup.resultadosAcumulados),
      "higherIsBetter",
      { labelKey: "posicionFinanciera.structure.resultadosAcumulados" },
    ),
    groupNode(
      "epf:capital-resultado-ejercicio",
      "Resultado del ejercicio",
      yearKeys,
      [
        ...capitalForest(capitalByGroup.resultadoEjercicio),
        {
          id: "epf:cap:resultado-ejercicio-ytd",
          label: "Resultado del ejercicio",
          labelKey: "posicionFinanciera.structure.resultadoEjercicio",
          kind: "account" as const,
          values: resultadoYtd,
          polarity: "higherIsBetter" as const,
        },
      ],
      "higherIsBetter",
      { labelKey: "posicionFinanciera.structure.resultadoEjercicio" },
    ),
    groupNode(
      "epf:capital-otras",
      "Otras cuentas de capital",
      yearKeys,
      capitalForest(capitalByGroup.otrasCapital),
      "higherIsBetter",
      { labelKey: "posicionFinanciera.structure.otrasCuentasCapital" },
    ),
  ];
  const capitalNode = groupNode("epf:capital", "Capital", yearKeys, capitalChildren, "higherIsBetter", {
    labelKey: "posicionFinanciera.structure.equity",
  });

  const roots = [activoNode, pasivoNode, capitalNode];
  // Con la presentación económica la identidad se verifica directo sobre los
  // valores mostrados: A = P + C (el control es A − P − C). Se conserva la
  // segunda forma por robustez ante datos sin convención detectable.
  const identityHolds = yearKeys.every((year) => {
    const activo = activoNode.values[year] ?? 0;
    const pasivo = pasivoNode.values[year] ?? 0;
    const cap = capitalNode.values[year] ?? 0;
    if (isEffectivelyZero({ [year]: activo }, [year]) && isEffectivelyZero({ [year]: pasivo + cap }, [year])) {
      return true;
    }
    return nearlyEqual(activo, pasivo + cap) || nearlyEqual(activo, -(pasivo + cap));
  });

  if (identityHolds) {
    const controlValues = emptyValues(yearKeys);
    for (const year of yearKeys) {
      const activo = activoNode.values[year];
      const pasivoMasCapital = round2((pasivoNode.values[year] ?? 0) + (capitalNode.values[year] ?? 0));
      if (activo == null) {
        controlValues[year] = null;
      } else {
        controlValues[year] = nearlyEqual(activo, pasivoMasCapital)
          ? round2(activo - pasivoMasCapital)
          : round2(activo + pasivoMasCapital);
      }
    }
    roots.push({
      id: "epf:control",
      label: "Activo = Pasivo + Capital",
      labelKey: "posicionFinanciera.structure.identity",
      kind: "total",
      values: controlValues,
      polarity: "neutral",
    });
  }

  return roots;
}

function calculatedValues(
  yearKeys: string[],
  compute: (year: string) => number | null,
): Record<string, number | null> {
  return Object.fromEntries(yearKeys.map((year) => [year, compute(year)]));
}

export function buildResultadosTree(rowsByYear: Record<string, BalanzaPnL[]>, yearKeys: string[]): StatementNode[] {
  const lines = mergeBalanceRows(rowsByYear, yearKeys, pnlMovement);
  const ingresos = lines.filter((line) => line.categoriaMaestra === "Ingreso");
  const costos = lines.filter((line) => line.categoriaMaestra === "COGS");
  const da = lines.filter((line) => line.depreciacionAmortizacion);
  const financieros = lines.filter(
    (line) => !line.depreciacionAmortizacion && isFinancialExpenseAccount(line.nombreCuenta),
  );
  const impuestos = lines.filter(
    (line) =>
      !line.depreciacionAmortizacion &&
      isIncomeTaxAccount(line.nombreCuenta) &&
      (line.categoriaMaestra === "OpEx" || line.categoriaMaestra === "COGS"),
  );
  const opexOperativo = lines.filter((line) => {
    if (line.categoriaMaestra !== "OpEx") {
      return false;
    }
    if (line.depreciacionAmortizacion) {
      return false;
    }
    if (isFinancialExpenseAccount(line.nombreCuenta) || isIncomeTaxAccount(line.nombreCuenta)) {
      return false;
    }
    return true;
  });

  const ingresosNode = groupNode(
    "pyg:ingresos",
    "Ingresos netos",
    yearKeys,
    buildPrefixForest(ingresos, yearKeys, { polarity: "higherIsBetter", idPrefix: "pyg:ing" }),
    "higherIsBetter",
    { labelKey: "posicionFinanciera.structure.netRevenue" },
  );
  const costosNode = groupNode(
    "pyg:costos",
    "Costos",
    yearKeys,
    buildPrefixForest(costos, yearKeys, { polarity: "lowerIsBetter", outflow: true, idPrefix: "pyg:cogs" }),
    "lowerIsBetter",
    { outflow: true, labelKey: "posicionFinanciera.structure.costs" },
  );
  const utilidadBruta: StatementNode = {
    id: "pyg:ub",
    label: "Utilidad bruta",
    labelKey: "posicionFinanciera.structure.grossProfit",
    kind: "total",
    values: calculatedValues(yearKeys, (year) => {
      const ing = ingresosNode.values[year];
      const cogs = costosNode.values[year];
      if (ing == null && cogs == null) {
        return null;
      }
      return round2((ing ?? 0) - (cogs ?? 0));
    }),
    polarity: "higherIsBetter",
  };
  const gastosOpNode = groupNode(
    "pyg:gastos-op",
    "Gastos de operación",
    yearKeys,
    buildPrefixForest(opexOperativo, yearKeys, { polarity: "lowerIsBetter", outflow: true, idPrefix: "pyg:opex" }),
    "lowerIsBetter",
    { outflow: true, labelKey: "posicionFinanciera.structure.opex" },
  );
  const ebitNode: StatementNode = {
    id: "pyg:ebit",
    label: "Utilidad de operación / EBIT",
    labelKey: "posicionFinanciera.structure.ebit",
    kind: "total",
    values: calculatedValues(yearKeys, (year) => {
      const ub = utilidadBruta.values[year];
      const opex = gastosOpNode.values[year];
      if (ub == null && opex == null) {
        return null;
      }
      return round2((ub ?? 0) - (opex ?? 0));
    }),
    polarity: "higherIsBetter",
  };
  const daNode = groupNode(
    "pyg:da",
    "Depreciación y amortización",
    yearKeys,
    buildPrefixForest(da, yearKeys, { polarity: "lowerIsBetter", outflow: true, idPrefix: "pyg:da" }),
    "lowerIsBetter",
    { outflow: true, labelKey: "posicionFinanciera.structure.da" },
  );
  const finNode = groupNode(
    "pyg:fin",
    "Gastos financieros",
    yearKeys,
    buildPrefixForest(financieros, yearKeys, { polarity: "lowerIsBetter", outflow: true, idPrefix: "pyg:fin" }),
    "lowerIsBetter",
    { outflow: true, labelKey: "posicionFinanciera.structure.financialExpense" },
  );
  const taxNode = groupNode(
    "pyg:tax",
    "Impuestos",
    yearKeys,
    buildPrefixForest(impuestos, yearKeys, { polarity: "lowerIsBetter", outflow: true, idPrefix: "pyg:tax" }),
    "lowerIsBetter",
    { outflow: true, labelKey: "posicionFinanciera.structure.tax" },
  );
  const utilidadNeta: StatementNode = {
    id: "pyg:un",
    label: "Utilidad neta",
    labelKey: "posicionFinanciera.structure.netIncome",
    kind: "total",
    values: calculatedValues(yearKeys, (year) => {
      const ebit = ebitNode.values[year];
      if (ebit == null && daNode.values[year] == null && finNode.values[year] == null && taxNode.values[year] == null) {
        return null;
      }
      return round2((ebit ?? 0) - (daNode.values[year] ?? 0) - (finNode.values[year] ?? 0) - (taxNode.values[year] ?? 0));
    }),
    polarity: "higherIsBetter",
  };

  return [ingresosNode, costosNode, utilidadBruta, gastosOpNode, ebitNode, daNode, finNode, taxNode, utilidadNeta];
}

function metricNode(metric: CatalogMetric, yearKeys: string[], values: Record<string, number | null>): StatementNode {
  return {
    id: `ratio:${metric.key}`,
    label: metric.key,
    labelKey: `metrics.${metric.key}.name`,
    kind: "account",
    formulaKey: `metrics.formulas.${metric.key}`,
    format: unitToFormat(metric.unit),
    values,
    polarity: "neutral",
  };
}

function metricsByKey(categories: CatalogCategories): Map<string, CatalogMetric> {
  return new Map(
    [...categories.margenes, ...categories.retorno, ...categories.eficiencia, ...categories.liquidez, ...categories.solvencia, ...categories.gestion].map(
      (metric) => [metric.key, metric],
    ),
  );
}

export function buildRazonesTree(
  categoriesByYear: Record<string, CatalogCategories | null>,
  yearKeys: string[],
): StatementNode[] {
  const templateYear = yearKeys.find((year) => categoriesByYear[year] != null) ?? yearKeys[0];
  const template = categoriesByYear[templateYear];
  const fallback: CatalogCategories = {
    margenes: [],
    retorno: [],
    eficiencia: [],
    liquidez: [],
    solvencia: [],
    gestion: [],
  };
  const groups = template ?? fallback;

  const valueFor = (key: string): Record<string, number | null> => {
    const values = emptyValues(yearKeys);
    for (const year of yearKeys) {
      const pack = categoriesByYear[year];
      if (!pack) {
        continue;
      }
      values[year] = metricsByKey(pack).get(key)?.value ?? null;
    }
    return values;
  };

  const mapGroup = (id: string, labelKey: string, metrics: CatalogMetric[]): StatementNode =>
    groupNode(
      id,
      id,
      yearKeys,
      metrics.map((metric) => metricNode(metric, yearKeys, valueFor(metric.key))),
      "neutral",
      { labelKey },
    );

  return [
    mapGroup("ratio:liquidez", "posicionFinanciera.structure.ratioLiquidity", groups.liquidez),
    mapGroup("ratio:actividad", "posicionFinanciera.structure.ratioActivity", groups.eficiencia),
    mapGroup("ratio:rentabilidad", "posicionFinanciera.structure.ratioProfitability", [...groups.margenes, ...groups.retorno, ...groups.gestion]),
    mapGroup("ratio:apalancamiento", "posicionFinanciera.structure.ratioLeverage", groups.solvencia),
  ];
}

export type BalanzaLine = AccountLine & {
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
};

export const BALANZA_VALUE_KEYS = ["saldoInicial", "debe", "haber", "saldoFinal"] as const;

export function buildBalanzaTree(rows: BalanzaPnL[]): { nodes: StatementNode[]; totals: { debe: number; haber: number } } {
  const keys = [...BALANZA_VALUE_KEYS];
  const categories: Array<BalanzaPnL["categoriaMaestra"]> = [
    "Activo",
    "Pasivo",
    "Patrimonio",
    "Ingreso",
    "COGS",
    "OpEx",
  ];
  const categoryLabelKeys: Record<BalanzaPnL["categoriaMaestra"], string> = {
    Activo: "posicionFinanciera.structure.asset",
    Pasivo: "posicionFinanciera.structure.liability",
    Patrimonio: "posicionFinanciera.structure.equity",
    Ingreso: "posicionFinanciera.structure.income",
    COGS: "posicionFinanciera.structure.cogs",
    OpEx: "posicionFinanciera.structure.opex",
  };

  const lines: AccountLine[] = rows.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    categoriaMaestra: row.categoriaMaestra,
    depreciacionAmortizacion: row.depreciacionAmortizacion,
    values: {
      saldoInicial: round2(money(row.saldoInicial)),
      debe: round2(money(row.debe)),
      haber: round2(money(row.haber)),
      saldoFinal: round2(money(row.saldoFinal)),
    },
  }));

  const nodes = categories.map((categoria) => {
    const children = buildPrefixForest(
      lines.filter((line) => line.categoriaMaestra === categoria),
      keys,
      { polarity: "neutral", idPrefix: `bal:${categoria}` },
    );
    return groupNode(`bal:${categoria}`, categoria, keys, children, "neutral", {
      labelKey: categoryLabelKeys[categoria],
    });
  });

  const totals = {
    debe: round2(rows.reduce((acc, row) => acc + money(row.debe), 0)),
    haber: round2(rows.reduce((acc, row) => acc + money(row.haber), 0)),
  };

  nodes.push({
    id: "bal:totales",
    label: "Totales",
    labelKey: "posicionFinanciera.structure.totals",
    kind: "total",
    values: {
      saldoInicial: null,
      debe: totals.debe,
      haber: totals.haber,
      saldoFinal: null,
    },
    polarity: "neutral",
  });

  return { nodes, totals };
}

export type PosicionFinancieraPayload = {
  tenantId: string;
  year: number;
  period: number;
  years: number[];
  closePeriodByYear: Record<string, number | null>;
  availableYears: number[];
  availablePeriods: number[];
  hasBalanza: boolean;
  statements: {
    posicion: StatementNode[];
    resultados: StatementNode[];
    razones: StatementNode[];
    balanza: StatementNode[];
  };
  balanzaTotals: { debe: number; haber: number };
};

export function yearColumns(years: number[]): StatementColumn[] {
  return years.map((year, index) => ({
    key: String(year),
    label: String(year),
    showYoY: index < years.length - 1,
  }));
}

export const BALANZA_COLUMNS: StatementColumn[] = [
  { key: "saldoInicial", label: "Saldo inicial", labelKey: "posicionFinanciera.structure.openingBalance" },
  { key: "debe", label: "Cargos", labelKey: "posicionFinanciera.structure.debits" },
  { key: "haber", label: "Abonos", labelKey: "posicionFinanciera.structure.credits" },
  { key: "saldoFinal", label: "Saldo final", labelKey: "posicionFinanciera.structure.closingBalance" },
];
