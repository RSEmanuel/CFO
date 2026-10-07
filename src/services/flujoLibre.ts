import { matchesRole } from "@/services/ingest/accountRoles";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import type { AccountRoles } from "@/services/ingest/types";
import { computeErBuckets, type ErCuentaRow } from "@/services/estadoOperativo";
import {
  isCashAccount,
  isCurrentAsset,
  isCurrentLiability,
  isInventoryAccount,
  normalizeText,
} from "@/services/metricsLedger";
import { round2 } from "@/services/money";

/**
 * Puente del método indirecto a partir de la balanza (no de XML ni del banco).
 *
 * Signo CONTPAQi: el activo cierra deudor (positivo) y el pasivo acreedor
 * (negativo). Con esa convención, el efecto en caja de una cuenta de capital
 * de trabajo es −(saldoFinal − saldoFinal del mes anterior): subir CxC saca
 * caja; subir CxP la mete. El efectivo (caja y bancos) no entra al puente:
 * es el resultado, no un ajuste. La deuda financiera de corto plazo tampoco:
 * es financiamiento, no operación.
 */

export type FlujoLibreSaldo = {
  idCuenta: string;
  nombreCuenta: string;
  saldoFinal: number;
};

export type FlujoLibreBucket =
  | "cxc"
  | "inventario"
  | "impuestosFavor"
  | "anticiposActivo"
  | "otrosActivo"
  | "cxp"
  | "impuestosPagar"
  | "otrosPasivo";

export type FlujoLibreKind = "total" | "increase" | "decrease";

export type FlujoLibreStep = {
  key: string;
  labelKey: string;
  kind: FlujoLibreKind;
  /** Magnitud positiva. En totales es el nivel; en ajustes, el tamaño del escalón. */
  value: number;
};

export type FlujoLibreInsight = {
  bucket: FlujoLibreBucket;
  direction: "up" | "down";
  amount: number;
};

export type FlujoLibreModel = {
  hasBalanza: boolean;
  hasPrior: boolean;
  utilidadNeta: number;
  depreciacion: number;
  flujoOperativoNeto: number;
  steps: FlujoLibreStep[];
  insight: FlujoLibreInsight | null;
};

const BUCKET_ORDER: FlujoLibreBucket[] = [
  "cxc",
  "inventario",
  "impuestosFavor",
  "anticiposActivo",
  "otrosActivo",
  "cxp",
  "impuestosPagar",
  "otrosPasivo",
];

const STEP_EPSILON = 0.5;

function digitsOf(idCuenta: string): string {
  return idCuenta.replace(/\D/g, "");
}

function isCash(idCuenta: string, nombreCuenta: string, roles: AccountRoles): boolean {
  if (roles.bancos && matchesRole(roles.bancos, idCuenta, nombreCuenta)) {
    return true;
  }
  if (isCashAccount(idCuenta, nombreCuenta)) {
    return true;
  }
  const digits = digitsOf(idCuenta);
  return digits.startsWith("1101") || digits.startsWith("101");
}

function isFinancingDebt(idCuenta: string, nombreCuenta: string, roles: AccountRoles): boolean {
  return Boolean(roles.deudaFinanciera && matchesRole(roles.deudaFinanciera, idCuenta, nombreCuenta));
}

function assetBucket(idCuenta: string, nombreCuenta: string, roles: AccountRoles): FlujoLibreBucket {
  if (roles.clientes && matchesRole(roles.clientes, idCuenta, nombreCuenta)) {
    return "cxc";
  }
  if (
    (roles.inventario && matchesRole(roles.inventario, idCuenta, nombreCuenta)) ||
    isInventoryAccount(idCuenta, nombreCuenta)
  ) {
    return "inventario";
  }
  const name = normalizeText(nombreCuenta);
  if (/iva acreditable|impuestos? a favor|isr a favor/.test(name)) {
    return "impuestosFavor";
  }
  if (/anticipo/.test(name)) {
    return "anticiposActivo";
  }
  return "otrosActivo";
}

function liabilityBucket(idCuenta: string, nombreCuenta: string, roles: AccountRoles): FlujoLibreBucket {
  if (roles.proveedores && matchesRole(roles.proveedores, idCuenta, nombreCuenta)) {
    return "cxp";
  }
  const name = normalizeText(nombreCuenta);
  if (/impuesto|iva/.test(name)) {
    return "impuestosPagar";
  }
  return "otrosPasivo";
}

function indexSaldos(rows: FlujoLibreSaldo[]): Map<string, FlujoLibreSaldo> {
  const map = new Map<string, FlujoLibreSaldo>();
  for (const row of rows) {
    const current = map.get(row.idCuenta);
    if (current) {
      current.saldoFinal = round2(current.saldoFinal + row.saldoFinal);
      if (!current.nombreCuenta && row.nombreCuenta) {
        current.nombreCuenta = row.nombreCuenta;
      }
    } else {
      map.set(row.idCuenta, { ...row, saldoFinal: round2(row.saldoFinal) });
    }
  }
  return map;
}

export function buildFlujoLibre(input: {
  mesActual: ErCuentaRow[];
  saldosActual: FlujoLibreSaldo[];
  saldosAnterior: FlujoLibreSaldo[] | null;
  roles: AccountRoles;
}): FlujoLibreModel {
  const empty: FlujoLibreModel = {
    hasBalanza: input.saldosActual.length > 0 || input.mesActual.length > 0,
    hasPrior: (input.saldosAnterior?.length ?? 0) > 0,
    utilidadNeta: 0,
    depreciacion: 0,
    flujoOperativoNeto: 0,
    steps: [],
    insight: null,
  };
  if (!empty.hasBalanza || !empty.hasPrior || !input.saldosAnterior) {
    return empty;
  }

  const er = computeErBuckets(input.mesActual);
  const actual = indexSaldos(input.saldosActual);
  const prior = indexSaldos(input.saldosAnterior);
  const leaves = selectLeafCodes([...new Set([...actual.keys(), ...prior.keys()])]);

  const grouped = new Map<FlujoLibreBucket, { cash: number; economic: number }>();
  for (const code of leaves) {
    const now = actual.get(code);
    const prev = prior.get(code);
    const nombre = now?.nombreCuenta || prev?.nombreCuenta || "";
    if (isCash(code, nombre, input.roles)) {
      continue;
    }
    const delta = round2((now?.saldoFinal ?? 0) - (prev?.saldoFinal ?? 0));
    if (Math.abs(delta) < 0.005) {
      continue;
    }
    let bucket: FlujoLibreBucket;
    let economic: number;
    if (isCurrentAsset(code, nombre, input.roles)) {
      bucket = assetBucket(code, nombre, input.roles);
      economic = delta;
    } else if (isCurrentLiability(code, nombre, input.roles) && !isFinancingDebt(code, nombre, input.roles)) {
      bucket = liabilityBucket(code, nombre, input.roles);
      economic = round2(-delta);
    } else {
      continue;
    }
    const acc = grouped.get(bucket) ?? { cash: 0, economic: 0 };
    acc.cash = round2(acc.cash + round2(-delta));
    acc.economic = round2(acc.economic + economic);
    grouped.set(bucket, acc);
  }

  const steps: FlujoLibreStep[] = [
    {
      key: "utilidadNeta",
      labelKey: "flujo.libre.utilidadNeta",
      kind: "total",
      value: er.utilidadNeta,
    },
  ];
  if (Math.abs(er.da) >= STEP_EPSILON) {
    steps.push({
      key: "depreciacion",
      labelKey: "flujo.libre.depreciacion",
      kind: er.da >= 0 ? "increase" : "decrease",
      value: round2(Math.abs(er.da)),
    });
  }

  let worst: FlujoLibreInsight | null = null;
  for (const bucket of BUCKET_ORDER) {
    const row = grouped.get(bucket);
    if (!row || Math.abs(row.cash) < STEP_EPSILON) {
      continue;
    }
    const up = row.economic >= 0;
    steps.push({
      key: bucket,
      labelKey: `flujo.libre.buckets.${bucket}.${up ? "up" : "down"}`,
      kind: row.cash >= 0 ? "increase" : "decrease",
      value: round2(Math.abs(row.cash)),
    });
    if (row.cash < -STEP_EPSILON && (!worst || row.cash < -worst.amount)) {
      worst = {
        bucket,
        direction: up ? "up" : "down",
        amount: round2(Math.abs(row.cash)),
      };
    }
  }

  const wcCash = [...grouped.values()].reduce((acc, row) => round2(acc + row.cash), 0);
  const flujoOperativoNeto = round2(er.utilidadNeta + er.da + wcCash);
  steps.push({
    key: "flujoOperativo",
    labelKey: "flujo.libre.flujoOperativo",
    kind: "total",
    value: flujoOperativoNeto,
  });

  return {
    hasBalanza: true,
    hasPrior: true,
    utilidadNeta: er.utilidadNeta,
    depreciacion: er.da,
    flujoOperativoNeto,
    steps,
    insight: worst,
  };
}
