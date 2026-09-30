import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import {
  getBudgetAssumptions,
  upsertBudgetAssumptions,
} from "@/services/budgetAssumptionService";
import type { BudgetDrivers } from "@/services/forecast/drivers";

export const runtime = "nodejs";

function parseAnio(raw: string | null): number {
  const anio = Number(raw);
  if (!raw || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw new AppError("VALIDATION_ERROR", "anio debe ser un año válido (2000-2100).", 400);
  }
  return anio;
}

function parseDriverNumber(body: Record<string, unknown>, key: keyof BudgetDrivers): number {
  const value = Number(body[key]);
  if (!Number.isFinite(value)) {
    throw new AppError("VALIDATION_ERROR", `${key} debe ser numérico.`, 400);
  }
  return value;
}

function parseDrivers(body: unknown): BudgetDrivers {
  if (typeof body !== "object" || body === null) {
    throw new AppError("VALIDATION_ERROR", "Cuerpo de la solicitud inválido.", 400);
  }
  const record = body as Record<string, unknown>;
  const drivers: BudgetDrivers = {
    salesGrowthPct: parseDriverNumber(record, "salesGrowthPct"),
    inflationPct: parseDriverNumber(record, "inflationPct"),
    headcount: Math.max(0, Math.round(parseDriverNumber(record, "headcount"))),
    headcountCostMonthly: Math.max(0, parseDriverNumber(record, "headcountCostMonthly")),
    debtInterestMonthly: Math.max(0, parseDriverNumber(record, "debtInterestMonthly")),
    depreciationMonthly: Math.max(0, parseDriverNumber(record, "depreciationMonthly")),
  };
  return drivers;
}

export const GET = withAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;
  if (!tenantId) {
    throw new AppError("VALIDATION_ERROR", "El parámetro tenantId es obligatorio.", 400);
  }
  assertTenantAccess(auth, tenantId);
  const anio = parseAnio(searchParams.get("anio"));
  return jsonSuccess(await getBudgetAssumptions(tenantId, anio));
});

export const PUT = withAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;
  if (!tenantId) {
    throw new AppError("VALIDATION_ERROR", "El parámetro tenantId es obligatorio.", 400);
  }
  assertTenantAccess(auth, tenantId);
  const anio = parseAnio(searchParams.get("anio"));
  const drivers = parseDrivers(await request.json());
  return jsonSuccess(await upsertBudgetAssumptions(tenantId, anio, drivers));
});
