"use client";

import { MetricCard } from "@/components/metric-card";
import { fmtDays, fmtMoney, fmtMonths, fmtPct, fmtRatio, n } from "@/components/dashboard/safe";
import type { ModulePack } from "@/services/metricsTypes";
import type { ReactNode } from "react";
import type { TranslateFn } from "@/i18n/translate";

function ebitdaMargin(pack: ModulePack): number | null {
  const ingresos = n(pack.pnl?.waterfall?.find((step) => step.key === "ingresos")?.amount);
  const ebitda = n(pack.pnl?.waterfall?.find((step) => step.key === "ebitda")?.amount);
  if (ingresos < 0.01) {
    return null;
  }
  return (ebitda / ingresos) * 100;
}

function ingresosBudgetPct(pack: ModulePack): number | null {
  const rows = pack.unitEconomics?.realVsBudgetIngresos ?? [];
  const real = rows.reduce((acc, row) => acc + n(row.real), 0);
  const budget = rows.reduce((acc, row) => acc + n(row.budget), 0);
  if (Math.abs(budget) < 0.01) {
    return null;
  }
  return ((real - budget) / budget) * 100;
}

export function renderModuleFavoriteMetric(
  id: string,
  pack: ModulePack | null,
  loading: boolean,
  t: TranslateFn,
): ReactNode | null {
  const flujo = pack?.flujoCaja;
  const d = flujo?.desglose;
  const salud = pack?.saludFinanciera;
  const ccc = pack?.capitalTrabajo?.ccc;
  const mix = pack?.pnl?.mixCostos;
  const conc = pack?.unitEconomics?.concentracionClientes;
  const margin = pack ? ebitdaMargin(pack) : null;
  const budgetPct = pack ? ingresosBudgetPct(pack) : null;

  const cards: Record<string, ReactNode> = {
    "metric:overview:free-cash-flow": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.freeCashFlow")} value={fmtMoney(d?.freeCashFlow?.amount, d?.freeCashFlow?.amountFormatted)} loading={loading} currentNumeric={d?.freeCashFlow?.amount} />
    ),
    "metric:overview:cash-runway": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.mesesRespiro")} value={fmtMonths(flujo?.mesesDeRespiro)} loading={loading} currentNumeric={flujo?.mesesDeRespiro} />
    ),
    "metric:overview:ebitda-margin": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.margenEbitda")} value={fmtPct(margin)} loading={loading} currentNumeric={margin} />
    ),
    "metric:overview:ccc": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.ccc")} value={fmtDays(ccc?.days)} loading={loading} currentNumeric={ccc?.days} invertTrend />
    ),
    "metric:overview:ingresos-vs-budget": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.realVsPresupuesto")} value={fmtPct(budgetPct)} loading={loading} currentNumeric={budgetPct} />
    ),
    "metric:overview:concentracion-top5": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.top5")} value={fmtPct(conc?.top5Pct)} loading={loading} currentNumeric={conc?.top5Pct} invertTrend />
    ),
    "metric:overview:liquidez-corriente": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.liquidezCorriente")} value={fmtRatio(salud?.liquidezCorriente?.value)} loading={loading} />
    ),
    "metric:overview:prueba-acida": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.pruebaAcida")} value={fmtRatio(salud?.pruebaAcida?.value)} loading={loading} />
    ),
    "metric:overview:endeudamiento": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.endeudamiento")} value={fmtRatio(salud?.endeudamientoTotal?.value)} loading={loading} />
    ),
    "metric:overview:cobertura-intereses": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.coberturaIntereses")} value={fmtRatio(salud?.coberturaIntereses?.value)} loading={loading} />
    ),
    "metric:cashflow:saldo-final": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.saldoFinal")} value={fmtMoney(d?.saldoFinal?.amount, d?.saldoFinal?.amountFormatted)} loading={loading} />
    ),
    "metric:cashflow:entradas-operativas": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.entradasOperativas")} value={fmtMoney(d?.entradasOperativas?.amount, d?.entradasOperativas?.amountFormatted)} loading={loading} />
    ),
    "metric:cashflow:salidas-operativas": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.salidasOperativas")} value={fmtMoney(d?.salidasOperativas?.amount, d?.salidasOperativas?.amountFormatted)} loading={loading} />
    ),
    "metric:cashflow:capex": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.capex")} value={fmtMoney(d?.salidasCapex?.amount, d?.salidasCapex?.amountFormatted)} loading={loading} />
    ),
    "metric:cashflow:servicio-deuda": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.servicioDeuda")} value={fmtMoney(d?.servicioDeuda?.amount, d?.servicioDeuda?.amountFormatted)} loading={loading} />
    ),
    "metric:cashflow:free-cash-flow": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.freeCashFlow")} value={fmtMoney(d?.freeCashFlow?.amount, d?.freeCashFlow?.amountFormatted)} loading={loading} />
    ),
    "metric:cashflow:runway-actual": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.mesesRespiro")} value={fmtMonths(flujo?.mesesDeRespiro)} loading={loading} />
    ),
    "metric:cashflow:runway-proyectado": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.mesesRespiro")} value={fmtMonths(flujo?.mesesDeRespiro)} loading={loading} />
    ),
    "metric:pnl:costos-fijos": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.costosFijos")} value={fmtPct(mix?.fijoPct)} loading={loading} />
    ),
    "metric:pnl:costos-variables": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.costosVariables")} value={fmtPct(mix?.variablePct)} loading={loading} />
    ),
    "metric:pnl:egresos-totales": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.egresosTotales")} value={fmtMoney(mix?.totalEgresos?.amount, mix?.totalEgresos?.amountFormatted)} loading={loading} />
    ),
    "metric:wc:nwc": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.nwc")} value={fmtMoney(pack?.capitalTrabajo?.nwc?.amount, pack?.capitalTrabajo?.nwc?.amountFormatted)} loading={loading} currentNumeric={pack?.capitalTrabajo?.nwc?.amount} />
    ),
    "metric:wc:dso": (
      <MetricCard
        favoriteId={id}
        title={t("favoritosModulo.dso")}
        value={fmtDays(ccc?.dso)}
        loading={loading}
        insightText={t("favoritosModulo.dsoInsight")}
      />
    ),
    "metric:wc:dio": <MetricCard favoriteId={id} title={t("favoritosModulo.dio")} value={fmtDays(ccc?.dio)} loading={loading} />,
    "metric:wc:dpo": <MetricCard favoriteId={id} title={t("favoritosModulo.dpo")} value={fmtDays(ccc?.dpo)} loading={loading} />,
    "metric:wc:ccc": <MetricCard favoriteId={id} title={t("favoritosModulo.ccc2")} value={fmtDays(ccc?.days)} loading={loading} invertTrend />,
    "metric:commercial:concentracion-top5": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.top5")} value={fmtPct(conc?.top5Pct)} loading={loading} invertTrend />
    ),
    "metric:commercial:concentracion-top10": (
      <MetricCard favoriteId={id} title={t("favoritosModulo.top10")} value={fmtPct(conc?.top10Pct)} loading={loading} invertTrend />
    ),
  };

  return cards[id] ?? null;
}
