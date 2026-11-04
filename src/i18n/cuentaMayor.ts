import { isMayorCode, mayorSegment } from "@/services/posicionFinanciera";

/**
 * Cuentas de mayor del catálogo Compac que son un concepto estándar
 * (caja, bancos, clientes, ventas, costo, sueldos, impuestos).
 * La fila de la mayor se muestra con esta clave; el nombre guardado en la
 * balanza no se modifica. Una subcuenta (4101-0001-…, «Servicios marítimos»)
 * no entra: su nombre es de la empresa.
 */
const CUENTA_MAYOR_KEY: Record<string, string> = {
  "1101": "cuentasMayor.1101",
  "1102": "cuentasMayor.1102",
  "1105": "cuentasMayor.1105",
  "1107": "cuentasMayor.1107",
  "2101": "cuentasMayor.2101",
  "2106": "cuentasMayor.2106",
  "2107": "cuentasMayor.2107",
  "2108": "cuentasMayor.2108",
  "2109": "cuentasMayor.2109",
  "2110": "cuentasMayor.2110",
  "2111": "cuentasMayor.2111",
  "2113": "cuentasMayor.2113",
  "2115": "cuentasMayor.2115",
  "2116": "cuentasMayor.2116",
  "2306": "cuentasMayor.2306",
  "2359": "cuentasMayor.2359",
  "3101": "cuentasMayor.3101",
  "3102": "cuentasMayor.3102",
  "3103": "cuentasMayor.3103",
  "3104": "cuentasMayor.3104",
  "3105": "cuentasMayor.3105",
  "4101": "cuentasMayor.4101",
  "4103": "cuentasMayor.4103",
  "4201": "cuentasMayor.4201",
  "5101": "cuentasMayor.5101",
  "6101": "cuentasMayor.6101",
  "6201": "cuentasMayor.6201",
  "6301": "cuentasMayor.6301",
  "6405": "cuentasMayor.6405",
  "6406": "cuentasMayor.6406",
  "7102": "cuentasMayor.7102",
  "7104": "cuentasMayor.7104",
  "8101": "cuentasMayor.8101",
};

const COLLAPSED_MAYOR = /:mayor:(\d+)$/;

export function cuentaMayorCodes(): string[] {
  return Object.keys(CUENTA_MAYOR_KEY);
}

/**
 * Clave de traducción si esta fila es la cuenta de mayor (código 4101,
 * 4101-0000-0000-0000, o la fila colapsada `…:mayor:4101`). Null si es
 * subcuenta o el código no está en el glosario.
 */
export function cuentaMayorLabelKey(code: string | undefined, nodeId?: string): string | null {
  const collapsed = nodeId?.match(COLLAPSED_MAYOR)?.[1];
  if (collapsed && CUENTA_MAYOR_KEY[collapsed]) {
    return CUENTA_MAYOR_KEY[collapsed];
  }
  if (!code) return null;
  const segment = mayorSegment(code);
  const key = CUENTA_MAYOR_KEY[segment];
  if (!key) return null;
  if (code === segment || isMayorCode(code)) return key;
  return null;
}
