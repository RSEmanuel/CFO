export type CommitOutcome = "COMMITTED" | "COMMITTED_WITH_WARNINGS";

export function classifyCommitOutcome(warnings: number, missingInputs: number): CommitOutcome {
  return warnings > 0 || missingInputs > 0 ? "COMMITTED_WITH_WARNINGS" : "COMMITTED";
}
