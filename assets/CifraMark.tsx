type CifraMarkProps = {
  /** Estado del dato que representa el punto central. */
  state?: "confirmed" | "estimated" | "missing";
  size?: number;
  className?: string;
};

/**
 * Marca de Cifra: un cero punteado.
 * El punto central representa la EXISTENCIA del dato:
 *   confirmed -> punto solido | estimated -> punto hueco | missing -> sin punto, trazo discontinuo
 * Hereda el color con `currentColor`, asi que se pinta desde CSS.
 */
export function CifraMark({ state = "confirmed", size = 32, className }: CifraMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Cifra"
    >
      <ellipse
        cx="32"
        cy="32"
        rx="17"
        ry="23"
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeDasharray={state === "missing" ? "7 6" : undefined}
        strokeLinecap={state === "missing" ? "round" : undefined}
      />
      {state === "confirmed" && <circle cx="32" cy="32" r="5" fill="currentColor" />}
      {state === "estimated" && (
        <circle cx="32" cy="32" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.6" />
      )}
    </svg>
  );
}
