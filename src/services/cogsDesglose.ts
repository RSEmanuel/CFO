import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { nearlyEqual, round2 } from "@/services/money";

export type CogsRubroKey =
  | "materiaPrima"
  | "manoObra"
  | "maquilas"
  | "gastosIndirectos"
  | "otros"
  | "otrosDirectos";

// Clasificador SAT por SEGUNDO segmento de exactamente 2 dígitos.
// Cubre el catálogo genérico 501-xx y el equivalente de 4 dígitos 5101-xx
// (5101-03-0000 → mano de obra). Compac 5101-0001-0000-0000 usa el segundo
// segmento como consecutivo de 4 dígitos, no como rubro SAT → otrosDirectos.
export function classifyCogsSat(accountNumber: string): CogsRubroKey {
  const segments = accountNumber.trim().split(/[-.]/).filter((segment) => segment.length > 0);
  const second = segments.length >= 2 ? segments[1] : "";
  if (!/^\d{2}$/.test(second)) {
    return "otrosDirectos";
  }
  switch (second) {
    case "01":
    case "02":
      return "materiaPrima";
    case "03":
      return "manoObra";
    case "04":
      return "maquilas";
    case "05":
      return "gastosIndirectos";
    case "99":
      return "otros";
    default:
      return "gastosIndirectos";
  }
}

export type CogsCuentaRow = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: string;
  debe: number;
  haber: number;
};

export type CogsCuentaDetalle = {
  idCuenta: string;
  nombreCuenta: string;
  monto: number;
};

export type CogsRubro = {
  key: CogsRubroKey;
  monto: number;
  pctCosto: number;
  pctVentas: number | null;
  cuentas: CogsCuentaDetalle[];
};

export type CogsDesglose = {
  rubros: CogsRubro[];
  totalCosto: number;
  ventasNetas: number;
  hasCogs: boolean;
};

const RUBRO_ORDER: CogsRubroKey[] = [
  "materiaPrima",
  "manoObra",
  "maquilas",
  "gastosIndirectos",
  "otros",
  "otrosDirectos",
];

function pct(parte: number, total: number): number | null {
  return Math.abs(total) > 0.005 ? round2((parte / total) * 100) : null;
}

// Costo de una hoja 5xx = debe - haber del periodo (naturaleza deudora).
// ventasNetas: ingreso total del periodo del mismo conjunto (haber - debe 4xxx).
export function buildCogsDesglose(rows: CogsCuentaRow[], ventasNetas: number): CogsDesglose {
  const byCuenta = new Map<string, { idCuenta: string; nombreCuenta: string; categoriaMaestra: string; debe: number; haber: number }>();
  for (const row of rows) {
    const acc = byCuenta.get(row.idCuenta) ?? {
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      categoriaMaestra: row.categoriaMaestra,
      debe: 0,
      haber: 0,
    };
    acc.debe += row.debe;
    acc.haber += row.haber;
    byCuenta.set(row.idCuenta, acc);
  }
  const cuentas = [...byCuenta.values()];
  const leafSet = selectLeafCodes(cuentas.map((cuenta) => cuenta.idCuenta));
  const hojas = cuentas
    .filter((cuenta) => leafSet.has(cuenta.idCuenta) && cuenta.categoriaMaestra === "COGS")
    .map((cuenta) => ({
      idCuenta: cuenta.idCuenta,
      nombreCuenta: cuenta.nombreCuenta,
      monto: round2(cuenta.debe - cuenta.haber),
    }))
    .filter((cuenta) => cuenta.monto > 0.005)
    .sort((a, b) => b.monto - a.monto);

  const totalCosto = round2(hojas.reduce((sum, cuenta) => sum + cuenta.monto, 0));
  const porRubro = new Map<CogsRubroKey, CogsCuentaDetalle[]>();
  for (const cuenta of hojas) {
    const key = classifyCogsSat(cuenta.idCuenta);
    const lista = porRubro.get(key) ?? [];
    lista.push(cuenta);
    porRubro.set(key, lista);
  }

  const rubros: CogsRubro[] = [...porRubro.entries()]
    .map(([key, cuentasRubro]) => {
      const monto = round2(cuentasRubro.reduce((sum, cuenta) => sum + cuenta.monto, 0));
      return {
        key,
        monto,
        pctCosto: pct(monto, totalCosto) ?? 0,
        pctVentas: pct(monto, ventasNetas),
        cuentas: cuentasRubro,
      };
    })
    .sort((a, b) => b.monto - a.monto || RUBRO_ORDER.indexOf(a.key) - RUBRO_ORDER.indexOf(b.key));

  return { rubros, totalCosto, ventasNetas: round2(ventasNetas), hasCogs: hojas.length > 0 };
}

export function sumVentasNetas(rows: CogsCuentaRow[]): number {
  const leafSet = selectLeafCodes(rows.map((row) => row.idCuenta));
  return round2(
    rows
      .filter((row) => leafSet.has(row.idCuenta) && row.categoriaMaestra === "Ingreso")
      .reduce((sum, row) => sum + (row.haber - row.debe), 0),
  );
}

export type CogsStructuralRowKey = "ventas" | "totalCosto" | "utilidadBruta" | "margenBruto";

export type CogsLineKind = "cuenta" | "rubro";

/** Subcuenta hoja (catálogo sin segmento SAT) o rubro SAT con monto. */
export type CogsLineRef = {
  id: string;
  kind: CogsLineKind;
  rubroKey: CogsRubroKey | null;
  nombre: string;
};

export type CogsAnalysisRole = "base" | "item" | "header" | "sub" | "total" | "result" | "ratio";

export type CogsColumnCell = {
  monto: number | null;
  pct: number | null;
};

export type CogsAnalysisRow = {
  key: string;
  role: CogsAnalysisRole;
  invertDelta: boolean;
  /** Null en ventas, total, utilidad y margen. */
  line: CogsLineRef | null;
  acumulado: CogsColumnCell;
  mesActual: CogsColumnCell;
  mesAnterior: CogsColumnCell;
  variacionMonto: number | null;
  variacionPp: number | null;
};

export type CogsStackSegment = CogsLineRef & {
  monto: number;
  pct: number | null;
};

export type CogsStackedMix = {
  ventas: number;
  utilidad: number;
  pctUtilidad: number | null;
  segmentos: CogsStackSegment[];
};

export type CogsVerticalAnalisis = {
  filas: CogsAnalysisRow[];
  stacked: {
    mesActual: CogsStackedMix;
    mesAnterior: CogsStackedMix;
  };
};

type PeriodBuckets = {
  ventas: number;
  totalCosto: number;
  utilidad: number;
  margen: number | null;
  desglose: CogsDesglose;
};

type LeafHit = {
  idCuenta: string;
  nombreCuenta: string;
  monto: number;
  rubro: CogsRubroKey;
};

function pickRubro(desglose: CogsDesglose, key: CogsRubroKey): number {
  return desglose.rubros.find((rubro) => rubro.key === key)?.monto ?? 0;
}

function periodBuckets(rows: CogsCuentaRow[], ventasNetas: number): PeriodBuckets {
  const desglose = buildCogsDesglose(rows, ventasNetas);
  const ventas = round2(ventasNetas);
  const directo = round2(pickRubro(desglose, "materiaPrima") + pickRubro(desglose, "otrosDirectos"));
  const produccion = pickRubro(desglose, "manoObra");
  const maquilas = pickRubro(desglose, "maquilas");
  const gif = round2(pickRubro(desglose, "gastosIndirectos") + pickRubro(desglose, "otros"));
  const indirecto = round2(produccion + maquilas + gif);
  const totalCosto = round2(directo + indirecto);
  const utilidad = round2(ventas - totalCosto);
  const costoPct = pct(totalCosto, ventas);
  const margen = costoPct == null ? null : round2(100 - costoPct);
  return { ventas, totalCosto, utilidad, margen, desglose };
}

function amountCell(monto: number, ventas: number): CogsColumnCell {
  return { monto: round2(monto), pct: pct(monto, ventas) };
}

function isZeroOrNullMonto(monto: number | null): boolean {
  return monto == null || nearlyEqual(monto, 0);
}

function rowHasNoMovement(row: CogsAnalysisRow): boolean {
  return (
    isZeroOrNullMonto(row.acumulado.monto) &&
    isZeroOrNullMonto(row.mesActual.monto) &&
    isZeroOrNullMonto(row.mesAnterior.monto)
  );
}

/** Oculta subcuentas en 0/null en las tres columnas. Nunca ventas, totalCosto, utilidadBruta ni margenBruto. */
export function filterZeroConceptRows(filas: CogsAnalysisRow[]): CogsAnalysisRow[] {
  const withoutEmptyConcepts = filas.filter((row) => {
    if (row.role === "item" || row.role === "sub" || row.key === "totalCargosIndirectos") {
      return !rowHasNoMovement(row);
    }
    return true;
  });
  const anyIndirectSubVisible = withoutEmptyConcepts.some((row) => row.role === "sub");
  const indirectTotalVisible = withoutEmptyConcepts.some(
    (row) => row.key === "totalCargosIndirectos",
  );
  if (anyIndirectSubVisible && indirectTotalVisible) {
    return withoutEmptyConcepts;
  }
  return withoutEmptyConcepts.filter((row) => row.key !== "cargosIndirectos");
}

function delta(actual: number | null, prior: number | null): number | null {
  if (actual == null || prior == null) {
    return null;
  }
  return round2(actual - prior);
}

function indexLeaves(desglose: CogsDesglose): Map<string, LeafHit> {
  const map = new Map<string, LeafHit>();
  for (const rubro of desglose.rubros) {
    for (const cuenta of rubro.cuentas) {
      map.set(cuenta.idCuenta, { ...cuenta, rubro: rubro.key });
    }
  }
  return map;
}

// Catálogo con segmento SAT (501-01, 5101-03) agrupa por rubro. Compac 5101-0001
// clasifica todo como otrosDirectos: la hija es la cuenta hoja, no un rubro inventado.
function grainOf(indexes: Array<Map<string, LeafHit>>): CogsLineKind {
  for (const index of indexes) {
    for (const leaf of index.values()) {
      if (leaf.rubro !== "otrosDirectos") {
        return "rubro";
      }
    }
  }
  return "cuenta";
}

function lineRow(
  line: CogsLineRef,
  ytd: PeriodBuckets,
  actual: PeriodBuckets,
  prior: PeriodBuckets,
  montos: { ytd: number; actual: number; prior: number },
): CogsAnalysisRow {
  const acumulado = amountCell(montos.ytd, ytd.ventas);
  const mesActual = amountCell(montos.actual, actual.ventas);
  const mesAnterior = amountCell(montos.prior, prior.ventas);
  return {
    key: line.kind === "cuenta" ? `cuenta:${line.id}` : `rubro:${line.id}`,
    role: "sub",
    invertDelta: false,
    line,
    acumulado,
    mesActual,
    mesAnterior,
    variacionMonto: delta(mesActual.monto, mesAnterior.monto),
    variacionPp: delta(mesActual.pct, mesAnterior.pct),
  };
}

function rubroLines(ytd: PeriodBuckets, actual: PeriodBuckets, prior: PeriodBuckets): CogsAnalysisRow[] {
  return RUBRO_ORDER.map((key) =>
    lineRow(
      { id: key, kind: "rubro", rubroKey: key, nombre: "" },
      ytd,
      actual,
      prior,
      {
        ytd: pickRubro(ytd.desglose, key),
        actual: pickRubro(actual.desglose, key),
        prior: pickRubro(prior.desglose, key),
      },
    ),
  );
}

function cuentaLines(
  ytd: PeriodBuckets,
  actual: PeriodBuckets,
  prior: PeriodBuckets,
  ytdIndex: Map<string, LeafHit>,
  actualIndex: Map<string, LeafHit>,
  priorIndex: Map<string, LeafHit>,
): CogsAnalysisRow[] {
  const ids = [...new Set([...ytdIndex.keys(), ...actualIndex.keys(), ...priorIndex.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  return ids.map((id) => {
    const hit = actualIndex.get(id) ?? ytdIndex.get(id) ?? priorIndex.get(id);
    return lineRow(
      { id, kind: "cuenta", rubroKey: null, nombre: hit?.nombreCuenta ?? id },
      ytd,
      actual,
      prior,
      {
        ytd: ytdIndex.get(id)?.monto ?? 0,
        actual: actualIndex.get(id)?.monto ?? 0,
        prior: priorIndex.get(id)?.monto ?? 0,
      },
    );
  });
}

function structuralRow(
  key: CogsStructuralRowKey,
  role: CogsAnalysisRole,
  invertDelta: boolean,
  ytd: PeriodBuckets,
  actual: PeriodBuckets,
  prior: PeriodBuckets,
): CogsAnalysisRow {
  const pick = (bucket: PeriodBuckets): CogsColumnCell => {
    if (key === "ventas") {
      return amountCell(bucket.ventas, bucket.ventas);
    }
    if (key === "totalCosto") {
      return amountCell(bucket.totalCosto, bucket.ventas);
    }
    if (key === "utilidadBruta") {
      return amountCell(bucket.utilidad, bucket.ventas);
    }
    return { monto: null, pct: bucket.margen };
  };
  const acumulado = pick(ytd);
  const mesActual = pick(actual);
  const mesAnterior = pick(prior);
  return {
    key,
    role,
    invertDelta,
    line: null,
    acumulado,
    mesActual,
    mesAnterior,
    variacionMonto: role === "ratio" ? null : delta(mesActual.monto, mesAnterior.monto),
    variacionPp: delta(mesActual.pct, mesAnterior.pct),
  };
}

function stackedMix(
  filas: CogsAnalysisRow[],
  buckets: PeriodBuckets,
  column: "mesActual" | "mesAnterior",
): CogsStackedMix {
  const segmentos: CogsStackSegment[] = filas.flatMap((fila) => {
    if (!fila.line) {
      return [];
    }
    const cell = fila[column];
    return [{ ...fila.line, monto: cell.monto ?? 0, pct: cell.pct }];
  });
  return {
    ventas: buckets.ventas,
    utilidad: buckets.utilidad,
    pctUtilidad: buckets.margen,
    segmentos,
  };
}

export function buildCogsVerticalAnalisis(input: {
  acumulado: CogsCuentaRow[];
  ventasAcumulado: number;
  mesActual: CogsCuentaRow[];
  ventasActual: number;
  mesAnterior: CogsCuentaRow[];
  ventasAnterior: number;
}): CogsVerticalAnalisis {
  const ytd = periodBuckets(input.acumulado, input.ventasAcumulado);
  const actual = periodBuckets(input.mesActual, input.ventasActual);
  const prior = periodBuckets(input.mesAnterior, input.ventasAnterior);
  const indexes = [indexLeaves(ytd.desglose), indexLeaves(actual.desglose), indexLeaves(prior.desglose)];
  const lines =
    grainOf(indexes) === "rubro"
      ? rubroLines(ytd, actual, prior)
      : cuentaLines(ytd, actual, prior, indexes[0], indexes[1], indexes[2]);

  const filas = filterZeroConceptRows([
    structuralRow("ventas", "base", true, ytd, actual, prior),
    ...lines,
    structuralRow("totalCosto", "total", false, ytd, actual, prior),
    structuralRow("utilidadBruta", "result", true, ytd, actual, prior),
    structuralRow("margenBruto", "ratio", true, ytd, actual, prior),
  ]);

  return {
    filas,
    stacked: {
      mesActual: stackedMix(filas, actual, "mesActual"),
      mesAnterior: stackedMix(filas, prior, "mesAnterior"),
    },
  };
}
