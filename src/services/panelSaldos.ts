import type { BalanzaPnL } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saldosComercialesCierre } from "@/services/capitalTrabajoCalcs";
import { buildPeriodSnapshot } from "@/services/financialSnapshot";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { resolveAccountRoles } from "@/services/ingresoMixService";
import type { AccountRoles } from "@/services/ingest/types";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { balanceSignConvention, money } from "@/services/metricsLedger";
import { round2 } from "@/services/money";
import { classifyPuenteCuenta } from "@/services/rifAuditoria";

/**
 * Saldos del Panel de Control al cierre del mes: lo que te deben, lo que debes
 * a proveedores, tu deuda financiera y los impuestos por pagar. Todo sale de la
 * balanza (sirve con cualquier sistema contable) y con las definiciones que ya
 * usa el portal: días de cobro y de pago y deuda del snapshot del catálogo
 * (B06), impuestos con la clase «impuestos por enterar» de RIF & Auditoría.
 */
export type PanelSaldos = {
  tenantId: string;
  periodo: string;
  hasBalanza: boolean;
  cxc: number | null;
  cxp: number | null;
  /** Días promedio de cobro y de pago; null si la balanza no da con qué calcularlos. */
  dso: number | null;
  dpo: number | null;
  /** Deuda financiera (rol deudaFinanciera) en magnitud; null si no hay cuentas de deuda. */
  deuda: number | null;
  /** Deuda menos tu caja. */
  deudaNeta: number | null;
  /** Impuestos por enterar en signo económico (positivo = lo que debes). */
  impuestos: { total: number; ivaPorCobrar: number } | null;
};

function normalizar(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Impuestos por pagar al cierre: hojas 21xx con nombre fiscal (IVA, ISR, IMSS,
 * PTU, retenciones), igual que la clase «impuestos por enterar». Aparte se
 * reporta el IVA trasladado no cobrado: se paga hasta que cobras.
 */
export function impuestosPorPagar(balanza: BalanzaPnL[]): PanelSaldos["impuestos"] {
  const hojas = selectLeafCodes(balanza.map((fila) => fila.idCuenta));
  const signo = balanceSignConvention(balanza);
  let total = 0;
  let ivaPorCobrar = 0;
  let hay = false;
  for (const fila of balanza) {
    if (fila.categoriaMaestra !== "Pasivo" || !hojas.has(fila.idCuenta)) continue;
    if (classifyPuenteCuenta(fila.idCuenta, fila.nombreCuenta) !== "impuestosPorEnterar") continue;
    hay = true;
    const debes = money(fila.saldoFinal) * signo;
    total += debes;
    if (/no\s+cobrad/.test(normalizar(fila.nombreCuenta))) ivaPorCobrar += debes;
  }
  return hay ? { total: round2(total), ivaPorCobrar: round2(ivaPorCobrar) } : null;
}

export function buildPanelSaldos(input: {
  anio: number;
  mes: number;
  balanzaYtd: BalanzaPnL[];
  roles?: AccountRoles | null;
}): Omit<PanelSaldos, "tenantId" | "periodo"> {
  const balanza = input.balanzaYtd.filter((fila) => fila.periodo === input.mes);
  if (balanza.length === 0) {
    return { hasBalanza: false, cxc: null, cxp: null, dso: null, dpo: null, deuda: null, deudaNeta: null, impuestos: null };
  }
  const snapshot = buildPeriodSnapshot({
    anio: input.anio,
    periodo: input.mes,
    balanza,
    tesoreria: [],
    accountRoles: input.roles,
    balanzaHistorial: input.balanzaYtd,
  });
  const { cxc, cxp } = saldosComercialesCierre(balanza, input.roles);
  const hayDeuda = snapshot.deudaBruta > 0.01;
  return {
    hasBalanza: true,
    cxc,
    cxp,
    dso: snapshot.disponibilidad?.dso ? Math.round(snapshot.dso) : null,
    dpo: snapshot.disponibilidad?.dpo ? Math.round(snapshot.dpo) : null,
    deuda: hayDeuda ? snapshot.deudaBruta : null,
    deudaNeta: hayDeuda ? snapshot.deudaNeta : null,
    impuestos: impuestosPorPagar(balanza),
  };
}

export async function getPanelSaldos(tenantId: string, periodo: string): Promise<PanelSaldos | null> {
  const target = parseIngresoPeriodo(periodo);
  if (!target) {
    return null;
  }
  const [balanzaYtd, roles] = await Promise.all([
    prisma.balanzaPnL.findMany({ where: { tenantId, anio: target.anio, periodo: { lte: target.mes } } }),
    resolveAccountRoles(tenantId),
  ]);
  return { tenantId, periodo, ...buildPanelSaldos({ anio: target.anio, mes: target.mes, balanzaYtd, roles }) };
}
