import type { CuentaCatalogoRow } from "@/services/ingestionTypes";

/**
 * Nombres de cuentas de mayor que trae el archivo y todavía no están guardados
 * (o están guardados con otro nombre). Si hay alguno, un archivo ya confirmado
 * antes NO debe tratarse como «ya cargado»: se vuelve a guardar para completarlos.
 */
export function catalogoPendiente(
  esperado: CuentaCatalogoRow[] | undefined,
  guardado: Array<{ idCuenta: string; nombreCuenta: string }>,
): CuentaCatalogoRow[] {
  const porCodigo = new Map(guardado.map((fila) => [fila.idCuenta, fila.nombreCuenta]));
  return (esperado ?? []).filter((fila) => porCodigo.get(fila.idCuenta) !== fila.nombreCuenta);
}
