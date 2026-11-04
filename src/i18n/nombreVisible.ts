import { normalizeCuentaNombre } from "@/services/gastoOpex";
import { presentarNombre } from "@/services/textoPresentable";
import type { Locale } from "@/i18n/config";
import { cuentaMayorLabelKey } from "@/i18n/cuentaMayor";
import type { TranslateFn } from "@/i18n/translate";

/**
 * Frases de cuenta que se repiten tal cual en el catálogo Compac.
 * Solo se usan cuando el portal está en inglés. El nombre de un cliente,
 * un banco o una póliza no pasa por aquí.
 */
const FRASE_CUENTA: Record<string, string> = {
  sueldos: "frasesCuenta.sueldos",
  "sueldos y salarios": "frasesCuenta.sueldos",
  honorarios: "frasesCuenta.honorarios",
  "honorarios personas fisicas": "frasesCuenta.honorariosPf",
  "honorarios personas morales": "frasesCuenta.honorariosPm",
  renta: "frasesCuenta.renta",
  "arrendamiento a personas morales": "frasesCuenta.arrendamientoPm",
  depreciacion: "frasesCuenta.depreciacion",
  amortizacion: "frasesCuenta.amortizacion",
  "costo de ventas": "frasesCuenta.costoVentas",
  "gastos generales": "frasesCuenta.gastosGenerales",
  "gastos no deducibles": "frasesCuenta.noDeducibles",
  devoluciones: "frasesCuenta.devoluciones",
  intereses: "frasesCuenta.intereses",
  "intereses pagados": "frasesCuenta.interesesPagados",
  "intereses ganados": "frasesCuenta.interesesGanados",
  "caja chica": "frasesCuenta.cajaChica",
  "iva por pagar": "frasesCuenta.ivaPorPagar",
  "papeleria y articulos de oficina": "frasesCuenta.papeleria",
  ventas: "frasesCuenta.ventas",
  clientes: "frasesCuenta.clientes",
  proveedores: "frasesCuenta.proveedores",
  bancos: "frasesCuenta.bancos",
  caja: "frasesCuenta.caja",
};

/**
 * Nombre de cuenta para la pantalla. La cuenta de mayor estándar gana.
 * En inglés, una frase conocida se traduce. Si no, queda el texto limpio.
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
  const limpio = presentarNombre(nombre);
  if (locale !== "en") return limpio;
  const key = FRASE_CUENTA[normalizeCuentaNombre(nombre)] ?? FRASE_CUENTA[normalizeCuentaNombre(limpio)];
  return key ? t(key) : limpio;
}
