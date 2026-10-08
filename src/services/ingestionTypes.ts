import type {
  CategoriaMaestra,
  ClasificacionGasto,
  EstatusPago,
  TipoInversion,
} from "@/generated/prisma/enums";

export type QualityRule =
  | "PARTIDA_DOBLE"
  | "CONCILIACION_TESORERIA"
  | "FECHAS"
  | "LIMITES_AUXILIARES"
  | "IDENTIDAD_TESORERIA"
  | "PERIODO"
  | "PARSEO";

export type QualityIssue = {
  rule: QualityRule;
  message: string;
  sheet?: string;
  row?: number;
  severity?: "ERROR" | "WARNING";
};

export type BalanzaRow = {
  row: number;
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: CategoriaMaestra;
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
  montoPresupuestado: number;
  depreciacionAmortizacion: boolean;
  periodo: number;
  anio: number;
};

export type VentaRow = {
  row: number;
  idCliente: string;
  nombreCliente: string;
  folioFactura: string;
  fechaEmision: Date;
  fechaVencimiento: Date;
  montoSubtotal: number;
  iva: number;
  montoCobrado: number;
  estatusPago: EstatusPago;
  lineaNegocio: string;
};

export type EgresoRow = {
  row: number;
  idProveedor: string;
  nombreProveedor: string;
  folioDocumento: string;
  fechaEmision: Date;
  fechaVencimiento: Date;
  montoSubtotal: number;
  centroDeCostos: string;
  clasificacionGasto: ClasificacionGasto;
  tipoInversion: TipoInversion;
  estatusPago: EstatusPago;
};

export type TesoreriaRow = {
  row: number;
  idBancoCaja: string;
  saldoInicialPeriodo: number;
  entradasOperativas: number;
  salidasOperativas: number;
  salidasCapex: number;
  servicioDeuda: number;
  saldoFinalPeriodo: number;
  periodo: number;
  anio: number;
};

export type TesoreriaDetalleRow = {
  row: number;
  idBancoCaja: string;
  direccion: "ingreso" | "egreso";
  categoriaKey: string;
  labelOrigen: string;
  monto: number;
  esTraspaso: boolean;
  orden: number;
  periodo: number;
  anio: number;
};

export type AuxiliarMovimientoRow = {
  row: number;
  moneda: string;
  idCuenta: string;
  nombreCuenta: string;
  fecha: Date;
  tipoPoliza: string;
  numeroPoliza: string;
  concepto: string;
  referencia: string;
  cargos: number;
  abonos: number;
  saldo: number;
  periodo: number;
  anio: number;
};

export type AuxiliarCuentaResumenRow = {
  moneda: string;
  idCuenta: string;
  nombreCuenta: string;
  saldoInicial: number;
  cargos: number;
  abonos: number;
  saldoFinal: number;
  periodo: number;
  anio: number;
};

export type PolizaRow = {
  row: number;
  tipo: string;
  numero: number;
  fecha: Date;
  concepto: string;
  totalCargos: number;
  totalAbonos: number;
  /** false cuando Σ cargos ≠ Σ abonos; la póliza se persiste igual y se reporta. */
  cuadrada: boolean;
  movimientosCount: number;
  periodo: number;
  anio: number;
};

export type PolizaMovimientoRow = {
  row: number;
  tipoPoliza: string;
  numeroPoliza: number;
  numeroMovimiento: number;
  codigoCuenta: string;
  nombreCuenta: string;
  referencia: string;
  concepto: string;
  cargo: number;
  abono: number;
  periodo: number;
  anio: number;
};

/** Cuenta que la balanza trae pero no se guarda con montos (p. ej. cuenta de mayor en Compac). */
export type CuentaCatalogoRow = {
  idCuenta: string;
  nombreCuenta: string;
};

export type MasterWorkbook = {
  balanza: BalanzaRow[];
  /** Nombres de las cuentas de mayor que la balanza leafOnly descarta de los montos. */
  cuentasCatalogo?: CuentaCatalogoRow[];
  ventas: VentaRow[];
  egresos: EgresoRow[];
  tesoreria: TesoreriaRow[];
  tesoreriaDetalle: TesoreriaDetalleRow[];
  auxiliarMovimientos: AuxiliarMovimientoRow[];
  auxiliarResumen: AuxiliarCuentaResumenRow[];
  polizas: PolizaRow[];
  polizaMovimientos: PolizaMovimientoRow[];
};
