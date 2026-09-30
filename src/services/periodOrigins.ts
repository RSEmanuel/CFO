export type DataOrigin = "contpaqi" | "seed";

export type PeriodOrigins = Record<string, DataOrigin>;

/**
 * Clasifica cada periodo con datos según tenga o no un commit de ingesta.
 * Los periodos sin commit provienen del seed sintético (seed-compac-history),
 * que escribe directo en el ledger sin dejar auditoría.
 */
export function resolvePeriodOrigins(periods: string[], committed: Set<string>): PeriodOrigins {
  return Object.fromEntries(
    periods.map((period) => [period, committed.has(period) ? "contpaqi" : "seed"] as const),
  );
}
