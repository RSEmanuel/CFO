import type { AuxiliarEgresos, AuxiliarVentas, BalanzaPnL } from "@/generated/prisma/client";
import { cccFromBalanza, deudaFinancieraFromBalanza, netWorkingCapital } from "@/services/capitalTrabajoCalcs";
import type { AccountRoles } from "@/services/ingest/types";
import type { AgingBucket, AgingBucketKey, CapitalTrabajo, ProveedorTop } from "@/services/metricsTypes";
import {
  activeExpenses,
  activeSales,
  daysPastDue,
  line,
  money,
  netReceivable,
  structureFromBalanza,
} from "@/services/metricsLedger";
import { formatMxn, round2 } from "@/services/money";

const AGING_DEFS: Array<{ key: AgingBucketKey; label: string; match: (days: number) => boolean }> = [
  { key: "corriente", label: "Corriente", match: (days) => days <= 0 },
  { key: "d1_30", label: "1-30 días", match: (days) => days >= 1 && days <= 30 },
  { key: "d31_60", label: "31-60 días", match: (days) => days >= 31 && days <= 60 },
  { key: "d61_90", label: "61-90 días", match: (days) => days >= 61 && days <= 90 },
  { key: "d90_plus", label: "90+ días", match: (days) => days > 90 },
];

/**
 * DSO/DIO/DPO/CCC salen SIEMPRE de la balanza (fuente estable, disponible aun
 * sin auxiliares) vía cccFromBalanza — el mismo helper que alimenta el
 * catálogo, así que módulo y catálogo #31/#32/#33 reportan lo mismo. Los
 * auxiliares solo aportan granularidad que la balanza no tiene: aging de CxC
 * y top de proveedores. No se mezclan criterios entre DSO y DPO.
 */
export function buildCapitalTrabajo(input: {
  ventasHastaCierre: AuxiliarVentas[];
  egresosCorte: AuxiliarEgresos[];
  egresosHastaCierre: AuxiliarEgresos[];
  /** Filas del periodo de cierre (saldos si/sf para promedios). */
  balanzaCierre: BalanzaPnL[];
  /** Filas cuyo debe/haber cubre el flujo de la vista (mes o YTD). */
  balanzaMov: BalanzaPnL[];
  accountRoles?: AccountRoles | null;
  asOf: Date;
}): CapitalTrabajo {
  const ventasHastaNetas = activeSales(input.ventasHastaCierre);
  const cxc = round2(ventasHastaNetas.reduce((acc, fila) => acc + Math.max(netReceivable(fila), 0), 0));

  const cccCore = cccFromBalanza({
    balanzaCierre: input.balanzaCierre,
    balanzaMov: input.balanzaMov,
    roles: input.accountRoles,
  });
  const deudaFinanciera = deudaFinancieraFromBalanza(input.balanzaCierre, input.accountRoles) ?? 0;
  const structure = structureFromBalanza(input.balanzaCierre, input.accountRoles);
  const nwc = netWorkingCapital(structure.activoCirculante, structure.pasivoCirculante);

  const buckets = new Map<AgingBucketKey, { monto: number; facturas: number }>();
  for (const def of AGING_DEFS) {
    buckets.set(def.key, { monto: 0, facturas: 0 });
  }
  for (const fila of ventasHastaNetas) {
    const saldo = netReceivable(fila);
    if (saldo <= 0.01) {
      continue;
    }
    const days = daysPastDue(fila.fechaVencimiento, input.asOf);
    const def = AGING_DEFS.find((item) => item.match(days)) ?? AGING_DEFS[0];
    const current = buckets.get(def.key)!;
    current.monto += saldo;
    current.facturas += 1;
  }

  const agingCxc: AgingBucket[] = AGING_DEFS.map((def) => {
    const current = buckets.get(def.key)!;
    const monto = round2(current.monto);
    return {
      key: def.key,
      label: def.label,
      monto,
      montoFormatted: formatMxn(monto),
      facturas: current.facturas,
      pct: cxc > 0.01 ? round2((monto / cxc) * 100) : 0,
    };
  });

  const byVendor = new Map<string, { idProveedor: string; nombreProveedor: string; volumen: number; pendiente: number }>();
  for (const fila of activeExpenses(input.egresosCorte)) {
    const current = byVendor.get(fila.idProveedor);
    const volumen = money(fila.montoSubtotal);
    const pendiente = fila.estatusPago === "Pendiente" ? volumen : 0;
    if (current) {
      current.volumen += volumen;
      current.pendiente += pendiente;
    } else {
      byVendor.set(fila.idProveedor, {
        idProveedor: fila.idProveedor,
        nombreProveedor: fila.nombreProveedor,
        volumen,
        pendiente,
      });
    }
  }

  const topProveedores: ProveedorTop[] = [...byVendor.values()]
    .sort((a, b) => b.volumen - a.volumen)
    .slice(0, 10)
    .map((item) => ({
      idProveedor: item.idProveedor,
      nombreProveedor: item.nombreProveedor,
      volumen: round2(item.volumen),
      volumenFormatted: formatMxn(round2(item.volumen)),
      pendiente: round2(item.pendiente),
      pendienteFormatted: formatMxn(round2(item.pendiente)),
    }));

  return {
    agingCxc,
    cxcTotal: line(cxc),
    nwc: line(nwc),
    deudaFinanciera: line(deudaFinanciera),
    ccc: {
      dso: cccCore.dso,
      dio: cccCore.dio,
      dpo: cccCore.dpo,
      days: cccCore.days,
      cxc: line(cccCore.cxcPromedio),
      cxp: line(cccCore.cxpPromedio),
      inventario: line(cccCore.inventarioPromedio),
      ventasPeriodo: line(cccCore.ventas),
      // La balanza no separa compras de COGS: la base del DPO es el COGS.
      comprasPeriodo: line(cccCore.cogs),
      cogs: line(cccCore.cogs),
    },
    topProveedores,
  };
}
