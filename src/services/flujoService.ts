import { prisma } from "@/lib/prisma";
import {
  getCommittedIngestPeriods,
  resolvePeriodOrigins,
  type PeriodOrigins,
} from "@/services/dataOrigin";
import type { FlujoEfectivoPeriodo, FlujoLinea } from "@/services/flujoEfectivo";
import { sumTraspasos } from "@/services/flujoEfectivo";
import type { FlujoMensual } from "@/services/flujoTransformer";
import { round2, toNumber } from "@/services/money";

export type FlujoPayload = {
  tenantId: string;
  hasData: boolean;
  latestPeriod: string | null;
  rows: FlujoMensual[];
  periodOrigins: PeriodOrigins;
};

export async function getFlujo(tenantId: string): Promise<FlujoPayload> {
  const [source, committedPeriods] = await Promise.all([
    prisma.tesoreriaFlujo.findMany({
      where: { tenantId },
      orderBy: [{ anio: "asc" }, { periodo: "asc" }, { idBancoCaja: "asc" }],
    }),
    getCommittedIngestPeriods(tenantId),
  ]);
  const rows = source.map((row) => ({
    periodo: `${row.anio}-${String(row.periodo).padStart(2, "0")}`,
    saldoInicial: toNumber(row.saldoInicialPeriodo),
    entradasOperativas: toNumber(row.entradasOperativas),
    salidasOperativas: toNumber(row.salidasOperativas),
    salidasCapex: toNumber(row.salidasCapex),
    servicioDeuda: toNumber(row.servicioDeuda),
    saldoFinal: toNumber(row.saldoFinalPeriodo),
  }));
  return {
    tenantId,
    hasData: rows.length > 0,
    latestPeriod: rows.at(-1)?.periodo ?? null,
    rows,
    periodOrigins: resolvePeriodOrigins([...new Set(rows.map((row) => row.periodo))], committedPeriods),
  };
}

export type FlujoEfectivoSource = "detalle" | "agregado";

export type FlujoEfectivoPayload = {
  tenantId: string;
  source: FlujoEfectivoSource;
  data: FlujoEfectivoPeriodo;
};

export function parsePeriodo(periodo: string): { anio: number; periodo: number } | null {
  const match = periodo.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) {
    return null;
  }
  return { anio: Number(match[1]), periodo: mes };
}

function mergeLineas(lineas: FlujoLinea[]): FlujoLinea[] {
  const byKey = new Map<string, FlujoLinea>();
  for (const linea of lineas) {
    const current = byKey.get(linea.categoriaKey);
    if (current) {
      current.monto = round2(current.monto + linea.monto);
      current.esTraspaso = current.esTraspaso || linea.esTraspaso;
    } else {
      byKey.set(linea.categoriaKey, { ...linea });
    }
  }
  return [...byKey.values()];
}

export async function getFlujoEfectivo(
  tenantId: string,
  periodo: string,
): Promise<FlujoEfectivoPayload | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!tenant) {
    return null;
  }

  let target = parsePeriodo(periodo);
  if (!target) {
    const latest = await prisma.tesoreriaFlujo.findFirst({
      where: { tenantId },
      orderBy: [{ anio: "desc" }, { periodo: "desc" }],
      select: { anio: true, periodo: true },
    });
    target = latest ? { anio: latest.anio, periodo: latest.periodo } : null;
  }
  if (!target) {
    return null;
  }

  const [aggregates, detalle] = await Promise.all([
    prisma.tesoreriaFlujo.findMany({
      where: { tenantId, anio: target.anio, periodo: target.periodo },
      orderBy: { idBancoCaja: "asc" },
    }),
    prisma.tesoreriaFlujoDetalle.findMany({
      where: { tenantId, anio: target.anio, periodo: target.periodo },
      orderBy: { orden: "asc" },
    }),
  ]);
  if (aggregates.length === 0 && detalle.length === 0) {
    return null;
  }

  const periodoLabel = `${target.anio}-${String(target.periodo).padStart(2, "0")}`;
  const cuentas = [
    ...new Set([
      ...aggregates.map((row) => row.idBancoCaja),
      ...detalle.map((row) => row.idBancoCaja),
    ]),
  ];
  const cuenta = cuentas.length === 1 ? cuentas[0]! : "multi";
  const saldoInicial = round2(
    aggregates.reduce((sum, row) => sum + toNumber(row.saldoInicialPeriodo), 0),
  );

  if (detalle.length > 0) {
    const ingresos = mergeLineas(
      detalle
        .filter((row) => row.direccion === "ingreso")
        .map((row) => ({
          categoriaKey: row.categoriaKey,
          label: row.labelOrigen,
          monto: toNumber(row.monto),
          esTraspaso: row.esTraspaso,
        })),
    );
    const egresos = mergeLineas(
      detalle
        .filter((row) => row.direccion === "egreso")
        .map((row) => ({
          categoriaKey: row.categoriaKey,
          label: row.labelOrigen,
          monto: toNumber(row.monto),
          esTraspaso: row.esTraspaso,
        })),
    );
    const totalIngresos = round2(ingresos.reduce((sum, linea) => sum + linea.monto, 0));
    const totalEgresos = round2(egresos.reduce((sum, linea) => sum + linea.monto, 0));
    const disponible = round2(saldoInicial + totalIngresos);
    return {
      tenantId,
      source: "detalle",
      data: {
        empresa: tenant.name,
        cuenta,
        periodo: periodoLabel,
        saldoInicial,
        ingresos,
        totalIngresos,
        disponible,
        egresos,
        totalEgresos,
        saldoFinal: round2(disponible - totalEgresos),
        traspasos: sumTraspasos(ingresos) || sumTraspasos(egresos),
      },
    };
  }

  const entradas = round2(aggregates.reduce((sum, row) => sum + toNumber(row.entradasOperativas), 0));
  const salidas = round2(
    aggregates.reduce(
      (sum, row) => sum + toNumber(row.salidasOperativas) + toNumber(row.salidasCapex) + toNumber(row.servicioDeuda),
      0,
    ),
  );
  const disponible = round2(saldoInicial + entradas);
  return {
    tenantId,
    source: "agregado",
    data: {
      empresa: tenant.name,
      cuenta,
      periodo: periodoLabel,
      saldoInicial,
      ingresos: [
        {
          categoriaKey: "entradas-operativas",
          label: "",
          labelKey: "flujo.efectivo.entradasOperativas",
          monto: entradas,
          esTraspaso: false,
        },
      ],
      totalIngresos: entradas,
      disponible,
      egresos: [
        {
          categoriaKey: "salidas-operativas",
          label: "",
          labelKey: "flujo.efectivo.salidasOperativas",
          monto: salidas,
          esTraspaso: false,
        },
      ],
      totalEgresos: salidas,
      saldoFinal: round2(disponible - salidas),
      traspasos: 0,
    },
  };
}
