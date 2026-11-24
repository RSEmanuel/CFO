import type { Locale } from "@/i18n/config";
import { cuentaMayorLabelKey } from "@/i18n/cuentaMayor";
import { traducirCuentaAlIngles } from "@/i18n/cuentaIngles";
import type { TranslateFn } from "@/i18n/translate";
import { presentarNombre } from "@/services/textoPresentable";

/**
 * Nombre de cuenta para la pantalla. Única puerta para mostrar un nombre de
 * cuenta del catálogo del cliente:
 * - La cuenta de mayor estándar usa el glosario (`cuentasMayor.*`).
 * - En inglés se traduce con `traducirCuentaAlIngles` (expande abreviaturas de
 *   CONTPAQi); un nombre propio (banco, cliente, persona) no se traduce.
 * - Siempre con el mismo tratamiento de mayúsculas (`presentarNombre`).
 * El dato guardado en la balanza no cambia.
 */
export function nombreCuentaVisible(
  nombre: string,
  code: string | undefined,
  locale: Locale,
  t: TranslateFn,
  nodeId?: string,
): string {
  const mayor = cuentaMayorLabelKey(code, nodeId);
  if (mayor) return t(mayor);
  if (locale === "en") return traducirCuentaAlIngles(nombre) ?? presentarNombre(nombre);
  return presentarNombre(nombre);
}
