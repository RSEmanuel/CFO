/**
 * Subtítulo de negocio bajo el título o el valor de un KPI/chart.
 * Inter (font-sans), nunca Fraunces.
 */
export function InsightText({ text }: { text?: string | null }) {
  if (!text) {
    return null;
  }
  return <p className="mt-1 font-sans text-xs italic text-muted-foreground">{text}</p>;
}
