import { cn } from "@/lib/utils";
import { tramosConCifras } from "@/services/resaltarCifras";

/**
 * Frase con las cifras resaltadas en peso medio (y color tinta, salvo que el
 * contenedor ya tenga su propio color), para leer de un vistazo el monto, el
 * porcentaje o el plazo. El resto queda en peso normal.
 */
export function ConCifras({ children, heredarColor = false }: { children: string | null | undefined; heredarColor?: boolean }) {
  if (!children) return null;
  return (
    <>
      {tramosConCifras(children).map((tramo, index) =>
        tramo.cifra ? (
          <strong key={index} className={cn("whitespace-nowrap font-medium", !heredarColor && "text-foreground")}>
            {tramo.texto}
          </strong>
        ) : (
          tramo.texto
        ),
      )}
    </>
  );
}
