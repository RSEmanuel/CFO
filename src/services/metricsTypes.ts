/** Tipos del tablero corporativo (5 módulos, vistas mensual y YTD). */

export type MoneyLine = {
  amount: number;
  amountFormatted: string;
};

export type RatioMetric = {
  value: number | null;
  numerator: number;
  numeratorFormatted: string;
  denominator: number;
  denominatorFormatted: string;
};

export type FinancialSource = "pnl" | "tesoreria";

export type SaludFinanciera = {
  liquidezCorriente: RatioMetric;
  pruebaAcida: RatioMetric;
  endeudamientoTotal: RatioMetric;
  coberturaIntereses: RatioMetric & { fuenteGastosFinancieros: FinancialSource };
  activoCirculante: MoneyLine;
  pasivoCirculante: MoneyLine;
  inventarios: MoneyLine;
  pasivoTotal: MoneyLine;
  patrimonioNeto: MoneyLine;
  ebit: MoneyLine;
  gastosFinancieros: MoneyLine;
};

export type FlujoDesglose = {
  saldoInicial: MoneyLine;
  entradasOperativas: MoneyLine;
  salidasOperativas: MoneyLine;
  salidasCapex: MoneyLine;
  servicioDeuda: MoneyLine;
  saldoFinal: MoneyLine;
  freeCashFlow: MoneyLine;
};

export type ProyeccionMes = {
  horizonte: 3 | 6 | 12;
  entradas: MoneyLine;
  salidas: MoneyLine;
  capex: MoneyLine;
  deuda: MoneyLine;
  fcfProyectado: MoneyLine;
  saldoProyectado: MoneyLine;
};

export type FlujoCaja = {
  desglose: FlujoDesglose;
  cashRunwayDias: number | null;
  cashRunwayProyectadoDias: number | null;
  promedioMensualHistorico: FlujoDesglose;
  proyeccion: ProyeccionMes[];
};

export type WaterfallStepKind = "increase" | "decrease" | "total";

export type WaterfallStep = {
  key: string;
  label: string;
  amount: number;
  amountFormatted: string;
  kind: WaterfallStepKind;
  runningTotal: number;
  runningTotalFormatted: string;
};

export type MixPorcentaje = {
  fijoPct: number | null;
  variablePct: number | null;
  fijo: MoneyLine;
  variable: MoneyLine;
  totalEgresos: MoneyLine;
};

export type CentroCostoLine = {
  centroDeCostos: string;
  monto: number;
  montoFormatted: string;
  pct: number;
};

export type PnlDetallado = {
  waterfall: WaterfallStep[];
  mixCostos: MixPorcentaje;
  opexPorCentro: CentroCostoLine[];
};

export type AgingBucketKey = "corriente" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

export type AgingBucket = {
  key: AgingBucketKey;
  label: string;
  monto: number;
  montoFormatted: string;
  facturas: number;
  pct: number;
};

/** Detalle del CCC calculado desde la balanza (cccFromBalanza). Los montos de
 * CxC/CxP/inventario son los promedios (si+sf)/2 usados en el cálculo; CxP en
 * valor absoluto (pasivos persistidos con signo negativo). ventasPeriodo y
 * cogs son los flujos del corte (mes o YTD); comprasPeriodo replica el COGS
 * porque la balanza no separa compras. */
export type CccDetalle = {
  dso: number;
  dio: number;
  dpo: number;
  days: number;
  cxc: MoneyLine;
  cxp: MoneyLine;
  inventario: MoneyLine;
  ventasPeriodo: MoneyLine;
  comprasPeriodo: MoneyLine;
  cogs: MoneyLine;
};

export type ProveedorTop = {
  idProveedor: string;
  nombreProveedor: string;
  volumen: number;
  volumenFormatted: string;
  pendiente: number;
  pendienteFormatted: string;
};

export type CapitalTrabajo = {
  agingCxc: AgingBucket[];
  cxcTotal: MoneyLine;
  /** Activo circulante − |pasivo circulante|. El pasivo se toma en absoluto
   * porque la balanza persiste acreedores con signo negativo. */
  nwc: MoneyLine;
  /** Pasivos con costo CP+LP (rol deudaFinanciera: 2106 + 2306 + 2359 en
   * Compac), valor absoluto. */
  deudaFinanciera: MoneyLine;
  ccc: CccDetalle;
  topProveedores: ProveedorTop[];
};

export type LineaNegocioRow = {
  lineaNegocio: string;
  facturacion: number;
  facturacionFormatted: string;
  cogsAsignado: number;
  cogsAsignadoFormatted: string;
  utilidadBruta: number;
  utilidadBrutaFormatted: string;
  margenBrutoPct: number | null;
  pctFacturacion: number;
};

export type ClienteConcentracion = {
  idCliente: string;
  nombreCliente: string;
  facturacion: number;
  facturacionFormatted: string;
  pct: number;
};

export type ConcentracionClientes = {
  top5: ClienteConcentracion[];
  top10: ClienteConcentracion[];
  top5Pct: number;
  top10Pct: number;
  resto: ClienteConcentracion;
  totalFacturacion: MoneyLine;
};

export type VariacionRubro = {
  id: string;
  nombre: string;
  real: number;
  realFormatted: string;
  budget: number | null;
  budgetFormatted: string | null;
  variacionPct: number | null;
};

export type UnitEconomics = {
  porLineaNegocio: LineaNegocioRow[];
  concentracionClientes: ConcentracionClientes;
  realVsBudgetIngresos: VariacionRubro[];
  realVsBudgetCentros: VariacionRubro[];
};

export type ModulePack = {
  saludFinanciera: SaludFinanciera;
  flujoCaja: FlujoCaja;
  pnl: PnlDetallado;
  capitalTrabajo: CapitalTrabajo;
  unitEconomics: UnitEconomics;
};

export type DashboardView = "mensual" | "ytd";

export type FullDashboard = {
  tenantId: string;
  year: number;
  period: number;
  views: {
    mensual: ModulePack | null;
    ytd: ModulePack | null;
  };
  assumptions: string[];
};
