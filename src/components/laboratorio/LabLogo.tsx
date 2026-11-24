import { cn } from "@/lib/utils";

/**
 * Copia de assets/cifra-lockup.svg recoloreada solo para el menú de laboratorio.
 * Misma geometría: cuadrado, óvalo, punto central y palabra. Cuadrado en el
 * morado de Horizon y palabra en el azul marino.
 */
export function LabLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 208 60" role="img" aria-label="Cifra" className={cn("h-8 w-auto", className)}>
      <rect x="0" y="0" width="60" height="60" rx="14" fill="var(--lab-brand)" />
      <ellipse cx="30" cy="30" rx="13.1" ry="17.8" fill="none" stroke="#fff" strokeWidth="6.1" />
      <circle cx="30" cy="30" r="3.9" fill="#fff" />
      <text
        x="74"
        y="41"
        fontFamily="Manrope, Helvetica Neue, Arial, sans-serif"
        fontSize="34"
        fontWeight="800"
        letterSpacing="-1.8"
        fill="var(--lab-navy)"
      >
        Cifra
      </text>
    </svg>
  );
}
