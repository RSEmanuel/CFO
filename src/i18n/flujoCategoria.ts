import { presentarNombre } from "@/services/textoPresentable";
import type { TranslateFn } from "@/i18n/translate";

/**
 * Conceptos del reporte de flujo de efectivo Compac (el slug, sin el sufijo -2).
 * El texto original se queda en la base; aquí solo se elige cómo se muestra.
 */
const CATEGORIA_KEY: Record<string, string> = {
  cobranza: "flujo.efectivo.categorias.cobranza",
  diversos: "flujo.efectivo.categorias.diversos",
  prestamos: "flujo.efectivo.categorias.prestamos",
  reembolsos: "flujo.efectivo.categorias.reembolsos",
  traspasos: "flujo.efectivo.categorias.traspasos",
  "cheq-devuel": "flujo.efectivo.categorias.chequesDevueltos",
  "gtos-viaje": "flujo.efectivo.categorias.gastosViaje",
  "gtos-x-comp": "flujo.efectivo.categorias.gastosPorComprobar",
  honorarios: "flujo.efectivo.categorias.honorarios",
  impuestos: "flujo.efectivo.categorias.impuestos",
  intereses: "flujo.efectivo.categorias.intereses",
  "pago-prestamos": "flujo.efectivo.categorias.pagoPrestamos",
  proveedores: "flujo.efectivo.categorias.proveedores",
  publicidad: "flujo.efectivo.categorias.publicidad",
  "reembol-gtos": "flujo.efectivo.categorias.reembolsoGastos",
  "reposic-caja": "flujo.efectivo.categorias.reposicionCaja",
  "situac-banc": "flujo.efectivo.categorias.situacionBancaria",
  sueldos: "flujo.efectivo.categorias.sueldos",
};

export function etiquetaFlujoCategoria(categoriaKey: string, label: string, t: TranslateFn): string {
  const slug = categoriaKey.replace(/-\d+$/, "");
  const key = CATEGORIA_KEY[slug];
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  const limpio = label.replace(/^(?:ingr|egr)\.?\s+/i, "");
  return presentarNombre(limpio);
}
