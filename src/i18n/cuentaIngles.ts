import { presentarNombre } from "@/services/textoPresentable";

/**
 * Traduce al inglés el nombre de una cuenta contable tal como lo trae el
 * catálogo del cliente (CONTPAQi abrevia y trunca a 30 caracteres:
 * «Vtas y/o serv. grav. tasa gral», «Imp. ret. de ISR serv. prof.»).
 *
 * 1. Separa el nombre en palabras y expande las abreviaturas conocidas.
 * 2. Traduce con el glosario: primero frases (la más larga gana), luego palabras.
 * 3. Acomoda el orden del inglés: el adjetivo va antes del sustantivo
 *    («impuestos diferidos» → «deferred taxes») y algunas palabras piden
 *    conector («depreciación equipo de cómputo» → «depreciation of computer equipment»).
 *
 * Solo traduce si reconoce TODAS las palabras. Un nombre propio (banco,
 * cliente, persona, modelo de equipo) devuelve null y se muestra como viene,
 * con el mismo tratamiento de mayúsculas. La excepción son las cabezas de
 * `CABEZAS` seguidas solo de un nombre propio: «Línea crédito Banorte 8712»
 * → «Credit line Banorte 8712».
 *
 * Para cubrir un catálogo nuevo basta agregar abreviaturas, frases o
 * palabras a las tablas; las pruebas de `cuentaIngles.test.ts` fijan los casos reales.
 */

type Pos =
  /** Sustantivo: un adjetivo que lo sigue pasa adelante. */
  | "n"
  /** Adjetivo: en inglés va antes del sustantivo. */
  | "adj"
  /** Va después del sustantivo también en inglés («payable», «withheld by»). */
  | "post"
  /** Preposición: la puede reemplazar el conector de la palabra anterior. */
  | "prep"
  /** Determinante o conjunción: no se mueve. */
  | "x";

type Entrada = {
  en: string;
  pos?: Pos;
  /** Conector cuando le sigue un sustantivo («of», «for», «to»). */
  con?: string;
  /** Puede traducirse aunque lo que sigue sea un nombre propio. */
  cabeza?: boolean;
  /** Texto (y conector) cuando va seguido de un nombre propio; si falta, `en` sin conector. */
  enCabeza?: string;
  conCabeza?: string;
};

const n = (en: string, extra: Partial<Entrada> = {}): Entrada => ({ en, pos: "n", ...extra });
const adj = (en: string): Entrada => ({ en, pos: "adj" });
const post = (en: string): Entrada => ({ en, pos: "post" });
const prep = (en: string): Entrada => ({ en, pos: "prep" });
const x = (en: string): Entrada => ({ en, pos: "x" });

/** Abreviaturas y truncados de catálogo → palabra completa (sin acentos, minúsculas). */
const ABREVIATURAS: Record<string, string> = {
  vtas: "ventas",
  vts: "ventas",
  serv: "servicios",
  servs: "servicios",
  grav: "gravados",
  gral: "general",
  dev: "devoluciones",
  dep: "depreciacion",
  acum: "acumulada",
  eq: "equipo",
  mob: "mobiliario",
  imp: "impuesto",
  ret: "retenido",
  prov: "provision",
  contrb: "contribuciones",
  contrib: "contribuciones",
  seg: "seguridad",
  soc: "social",
  aport: "aportaciones",
  fut: "futuros",
  ejerc: "ejercicio",
  anter: "anteriores",
  anteriore: "anteriores",
  resul: "resultado",
  pag: "pagar",
  ctas: "cuentas",
  cta: "cuenta",
  gtos: "gastos",
  ded: "deducibles",
  fis: "fiscales",
  arts: "articulos",
  ofici: "oficina",
  oficin: "oficina",
  ofna: "oficina",
  adtvo: "administrativo",
  admon: "administracion",
  adm: "administracion",
  maq: "maquila",
  nal: "nacional",
  nac: "nacional",
  ext: "extranjero",
  res: "residente",
  pf: "persona fisica",
  pm: "persona moral",
  pers: "personas",
  honor: "honorarios",
  prof: "profesionales",
  cond: "condonacion",
  inversio: "inversion",
  facturacio: "facturacion",
  utilidade: "utilidades",
  extrangeros: "extranjeros",
  previcion: "prevision",
  aportacione: "aportaciones",
  sujtas: "sujetas",
  aduales: "aduanales",
  antiguedad: "antiguedad",
  x: "por",
  "p/": "para",
};

/** Solo se expanden si traen punto: «t.cero» → «tasa cero», «s. nómina» → «sobre nómina». */
const ABREVIATURAS_CON_PUNTO: Record<string, string> = {
  t: "tasa",
  s: "sobre",
  p: "partes",
  r: "relacionadas",
};

/** Frases (claves sin acentos, minúsculas, palabras separadas por un espacio). */
const FRASES: Record<string, Entrada> = {
  // Ventas y otros ingresos
  "ventas y/o servicios": n("sales and/or services"),
  "gravados tasa general": post("taxed at the general rate"),
  "gravados tasa cero": post("taxed at the zero rate"),
  "gravados tasa 0%": post("taxed at the zero rate"),
  "gravadas tasa general": post("taxed at the general rate"),
  "gravadas tasa cero": post("taxed at the zero rate"),
  "tasa general": post("at the general rate"),
  "tasa cero": post("at the zero rate"),
  "devoluciones sobre ventas": n("sales returns"),
  "devoluciones y descuentos sobre ventas": n("sales returns and discounts"),
  "descuentos sobre ventas": n("sales discounts"),
  "otros ingresos": n("other income"),
  "ganancia por venta de activo fijo": n("gain on sale of fixed assets"),
  "costo de ventas": n("cost of sales"),
  "costo de lo vendido": n("cost of goods sold"),
  "productos financieros": n("financial income"),
  "otros productos financieros": n("other financial income"),
  "otros productos": n("other income"),
  "utilidad cambiaria": n("foreign exchange gain"),
  "perdida cambiaria": n("foreign exchange loss"),
  "fondos de inversion": n("investment funds"),
  "ingresos por condonacion de adeudos": n("income from debt forgiveness"),
  "condonacion de adeudos": n("debt forgiveness"),
  "gastos financieros": n("financial expenses"),
  "otros gastos financieros": n("other financial expenses"),
  "intereses a cargo bancarios": n("bank interest expense"),
  "intereses a cargo": n("interest expense"),
  "intereses a favor": n("interest income"),
  "intereses bancarios": n("bank interest"),
  "comisiones bancarias": n("bank fees"),
  // Activo
  "caja chica": n("petty cash"),
  "bancos nacionales": n("domestic banks"),
  "bancos extranjeros": n("foreign banks"),
  "inversiones en valores": n("marketable securities"),
  "casa de bolsa": n("brokerage firm"),
  "cuentas por cobrar": n("accounts receivable"),
  "cuentas por pagar": n("accounts payable"),
  "deudores diversos": n("sundry debtors"),
  "funcionarios y empleados": n("officers and employees"),
  "por recuperar": adj("recoverable"),
  "a favor": post("receivable"),
  "por acreditar": post("pending credit"),
  "por pagar": post("payable"),
  "por cobrar": post("receivable"),
  "por comprobar": post("pending support"),
  "retenido por bancos": post("withheld by banks"),
  "retenido por clientes": post("withheld by customers"),
  "retenidos por bancos": post("withheld by banks"),
  "retenidos por clientes": post("withheld by customers"),
  "pagos provisionales de isr": n("estimated income tax payments"),
  "pagos provisionales isr": n("estimated income tax payments"),
  "pagos provisionales": n("estimated tax payments"),
  "subsidio al empleo": n("employment subsidy"),
  "pagos anticipados": n("prepaid expenses"),
  "renta anual de las oficinas": n("annual office rent"),
  "renta anual": n("annual rent"),
  "seguros y fianzas": n("insurance and bonds"),
  "trasladado cobrado": post("charged and collected"),
  "trasladados cobrados": post("charged and collected"),
  "trasladado no cobrado": post("charged, not yet collected"),
  "trasladados no cobrados": post("charged, not yet collected"),
  "depositos en garantia": n("security deposits"),
  "deposito en garantia": n("security deposit"),
  "depreciacion acumulada": n("accumulated depreciation", { con: "of" }),
  "amortizacion acumulada": n("accumulated amortization", { con: "of" }),
  "mobiliario y equipo de oficina": n("office furniture and equipment"),
  "mobiliario y equipo": n("furniture and equipment"),
  "equipo de oficina": n("office equipment"),
  "equipo de computo": n("computer equipment"),
  "equipos de computo": n("computer equipment"),
  "equipo de transporte": n("transportation equipment"),
  "modulos de oficina": n("office modules"),
  "mesas de juntas": n("meeting tables"),
  "mesas de junta": n("meeting tables"),
  "muebles para recepcion": n("reception furniture"),
  "muebles recepcion": n("reception furniture"),
  "sillas ejecutivas": n("executive chairs"),
  "sillas operativas": n("task chairs"),
  "activo fijo": n("fixed assets"),
  "activos fijos": n("fixed assets"),
  // Pasivo
  "a corto plazo": adj("short-term"),
  "a largo plazo": adj("long-term"),
  "a cp": adj("short-term"),
  "a lp": adj("long-term"),
  "acreedores diversos": n("sundry creditors"),
  "acreedores bancarios": n("bank creditors"),
  "anticipo de clientes": n("customer advances"),
  "anticipo de cliente": n("customer advance"),
  "anticipos de clientes": n("customer advances"),
  "anticipo proveedores": n("advances to suppliers"),
  "anticipo a proveedores": n("advances to suppliers"),
  "anticipos a proveedores": n("advances to suppliers"),
  "impuestos y derechos": n("taxes and duties"),
  "otros impuestos y derechos": n("other taxes and duties"),
  "impuesto estatal sobre nominas": n("state payroll tax"),
  "impuesto estatal sobre nomina": n("state payroll tax"),
  "impuesto estatal": n("state tax"),
  "impuesto retenido de isr": n("income tax withheld", { con: "on" }),
  "impuesto retenido isr": n("income tax withheld", { con: "on" }),
  "impuesto sobre la renta": n("income tax"),
  "imss patronal": n("employer IMSS"),
  "a los trabajadores": post("from employees"),
  "retenido imss": n("IMSS withheld"),
  "retencion imss": n("IMSS withheld"),
  "contribuciones seguridad social": n("social security contributions"),
  "contribuciones de seguridad social": n("social security contributions"),
  "seguridad social": n("social security"),
  "servicios profesionales": n("professional services"),
  "linea de credito": n("credit line", { cabeza: true }),
  "linea credito": n("credit line", { cabeza: true }),
  "tarjeta de credito": n("credit card", { cabeza: true }),
  // Capital
  "capital social": n("share capital"),
  "capital fijo": n("fixed capital"),
  "capital variable": n("variable capital"),
  "aportaciones para futuros aumentos de capital": n("contributions for future capital increases"),
  "aportaciones para futuros aumentos capital": n("contributions for future capital increases"),
  "aportacion patrimonial": n("equity contribution"),
  "deficit o remanente": n("deficit or surplus"),
  "del ejercicio": post("for the year"),
  "de ejercicios anteriores": post("from prior years"),
  "ejercicios anteriores": post("from prior years"),
  "de ejercicio anteriores": post("from prior years"),
  "ejercicio anteriores": post("from prior years"),
  "reserva legal": n("legal reserve"),
  "resultado integral": n("comprehensive income"),
  "otras cuentas de capital": n("other equity accounts"),
  // Gastos
  "gastos generales": n("general expenses"),
  "gastos de administracion": n("administrative expenses"),
  "gastos de venta": n("selling expenses"),
  "gastos de ventas": n("selling expenses"),
  "sueldos y salarios": n("payroll"),
  "sueldos y salario": n("payroll"),
  "sueldos y sala": n("payroll"),
  "tiempo extra": n("overtime"),
  "premios de asistencia": n("attendance bonuses"),
  "premios de puntualidad": n("punctuality bonuses"),
  "prima vacacional": n("vacation premium"),
  "prima dominical": n("Sunday premium"),
  "dias festivos": n("holiday pay"),
  "primas de antiguedad": n("seniority premiums"),
  "prima de antiguedad": n("seniority premium"),
  "servicio medico": n("medical services"),
  "ayuda en gastos funerarios": n("funeral expense assistance"),
  "fondo de ahorro": n("savings fund"),
  "cuotas sindicales": n("union dues"),
  "estimulo al personal": n("staff incentives"),
  "prevision social": n("employee welfare benefits"),
  "ayuda para alimentos": n("meal allowance"),
  "cuotas al imss": n("IMSS contributions"),
  "cuotas imss": n("IMSS contributions"),
  "aportaciones al infonavit": n("INFONAVIT contributions"),
  "aportaciones al sar": n("SAR contributions"),
  "otras aportaciones": n("other contributions"),
  "asimilados a salarios": n("salary-equivalent payments"),
  "servicios administrativos": n("administrative services"),
  "servicios administracion": n("administrative services"),
  "servicios de administracion": n("administrative services"),
  "partes relacionadas": x("(related parties)"),
  "persona fisica residente nacional": n("domestic individuals"),
  "persona fisica residente extranjero": n("foreign individuals"),
  "persona moral residente nacional": n("domestic companies"),
  "persona moral residente extranjero": n("foreign companies"),
  "personas fisicas residente nacional": n("domestic individuals"),
  "personas fisicas residentes nacionales": n("domestic individuals"),
  "personas morales residente nacional": n("domestic companies"),
  "persona fisica": n("individuals"),
  "persona moral": n("companies"),
  "personas fisicas": n("individuals"),
  "personas morales": n("companies"),
  "residente nacional": n("domestic residents"),
  "residente extranjero": n("foreign residents"),
  "honorarios aduanales": n("customs broker fees", { con: "to" }),
  "combustibles y lubricantes": n("fuel and lubricants"),
  "viaticos y gastos de viaje": n("per diem and travel expenses"),
  "gastos de viaje": n("travel expenses"),
  "suministro de agua potable": n("water supply"),
  "suministro energia electrica": n("electricity supply"),
  "suministro de energia electrica": n("electricity supply"),
  "energia electrica": n("electricity"),
  "agua potable": n("drinking water"),
  "vigilancia y seguridad": n("security and surveillance"),
  "papeleria y articulos de oficina": n("office stationery and supplies"),
  "papeleria y articulos oficina": n("office stationery and supplies"),
  "mantenimiento y conservacion": n("maintenance and upkeep"),
  "recargos fiscales": n("tax surcharges"),
  "cuotas y suscripciones": n("dues and subscriptions"),
  "propaganda y publicidad": n("advertising"),
  "capacitacion al personal": n("staff training"),
  "donativos y ayudas": n("donations and aid"),
  "asistencia tecnica": n("technical assistance"),
  "sujetas a otros porcentajes": post("subject to other rates"),
  "sujetas al": post("subject to"),
  "fletes y acarreos": n("freight and hauling"),
  "gastos de importacion": n("import expenses"),
  "otros gastos": n("other expenses"),
  "otros gastos de fin de ano": n("other year-end expenses"),
  "gastos no deducibles": n("non-deductible expenses"),
  "otros gastos no deducibles": n("other non-deductible expenses"),
  "sin requisitos fiscales": x("without tax requirements"),
  "sin requisito fiscales": x("without tax requirements"),
  "sin requisitos": x("without requirements"),
  "de fin de ano": post("for year-end"),
  "fin de ano": n("year-end"),
  "servicio de transporte": n("transportation service"),
  "servicios de transporte": n("transportation services"),
  "casetas y peajes": n("tolls"),
  "servicio de mensajeria": n("courier service"),
  "servicios de oficina": n("office services"),
  "servicios oficinas": n("office services"),
  "servicios de oficinas": n("office services"),
  "renta y servicios de oficina": n("office rent and services"),
  "maquila de nomina": n("payroll outsourcing"),
  "maquila nomina": n("payroll outsourcing"),
  "servicio de maquila nomina": n("payroll outsourcing service"),
  "servicio de maquila de nomina": n("payroll outsourcing service"),
  "arrendamiento de oficina": n("office lease", { cabeza: true }),
  "arrendamiento de oficinas": n("office lease", { cabeza: true }),
  "suministro de personal administrativo": n("administrative staffing"),
  "suministro de personal": n("staffing"),
  "paquete folios para facturacion": n("invoicing folio package"),
  "despensa de oficina": n("office pantry supplies"),
  "depreciacion contable": n("book depreciation"),
  "participacion de los trabajadores en las utilidades": n("employee profit sharing"),
  "participacion de los trabajadores en las utilidade": n("employee profit sharing"),
  "otros deudores diversos": n("other sundry debtors"),
};

/** Palabras sueltas (sin acentos, minúsculas). */
const PALABRAS: Record<string, Entrada> = {
  // Conectores
  de: prep("of"),
  del: prep("of the"),
  para: prep("for"),
  a: prep("to"),
  al: prep("to the"),
  en: prep("in"),
  por: prep("by"),
  sobre: prep("on"),
  con: prep("with"),
  sin: prep("without"),
  y: x("and"),
  e: x("and"),
  o: x("or"),
  "y/o": x("and/or"),
  la: x(""),
  las: x(""),
  el: x(""),
  los: x(""),
  otros: x("other"),
  otras: x("other"),
  otro: x("other"),
  otra: x("other"),
  // Siglas
  iva: n("VAT"),
  isr: n("income tax"),
  ptu: n("profit sharing"),
  imss: n("IMSS"),
  sar: n("SAR"),
  infonavit: n("INFONAVIT"),
  fonacot: n("FONACOT"),
  ieps: n("IEPS"),
  sat: n("SAT"),
  cfdi: n("CFDI"),
  tdc: n("credit card", { cabeza: true }),
  // Sustantivos
  caja: n("cash"),
  bancos: n("banks"),
  banco: n("bank"),
  inversiones: n("investments"),
  inversion: n("investment"),
  clientes: n("customers"),
  cliente: n("customer"),
  deudores: n("debtors"),
  impuestos: n("taxes"),
  impuesto: n("tax"),
  pagos: n("payments"),
  pago: n("payment"),
  anticipo: n("advance", { cabeza: true }),
  anticipos: n("advances"),
  proveedores: n("suppliers"),
  proveedor: n("supplier"),
  acreedores: n("creditors"),
  automoviles: n("automobiles"),
  automovil: n("automobile", { cabeza: true }),
  ganancia: n("gain", { con: "on" }),
  ganancias: n("gains", { con: "on" }),
  administracion: n("administration"),
  depreciacion: n("depreciation", { con: "of", cabeza: true, conCabeza: "of" }),
  amortizacion: n("amortization", { con: "of", cabeza: true, conCabeza: "of" }),
  mobiliario: n("furniture", { con: "–" }),
  muebles: n("furniture"),
  escritorios: n("desks"),
  escritorio: n("desk"),
  sillas: n("chairs"),
  mesas: n("tables"),
  recepcion: n("reception"),
  equipo: n("equipment"),
  equipos: n("equipment"),
  activos: n("assets"),
  activo: n("assets"),
  oficina: n("office"),
  oficinas: n("offices"),
  computo: n("computing"),
  transporte: n("transportation"),
  cuentas: n("accounts"),
  cuenta: n("account"),
  provision: n("provision", { con: "for" }),
  provisiones: n("provisions", { con: "for" }),
  contribuciones: n("contributions"),
  derechos: n("duties", { con: "for" }),
  capital: n("capital"),
  patrimonio: n("equity"),
  reserva: n("reserve"),
  reservas: n("reserves"),
  resultado: n("result"),
  resultados: n("results"),
  utilidad: n("profit"),
  utilidades: n("profits"),
  perdida: n("loss"),
  perdidas: n("losses"),
  ejercicio: n("fiscal year"),
  ingresos: n("income"),
  ingreso: n("income"),
  ventas: n("sales"),
  venta: n("sale"),
  servicios: n("services"),
  servicio: n("service"),
  costo: n("cost"),
  costos: n("costs"),
  gastos: n("expenses"),
  gasto: n("expense"),
  compensaciones: n("compensation"),
  vacaciones: n("vacation pay"),
  gratificaciones: n("bonuses"),
  aguinaldo: n("Christmas bonus"),
  indemnizaciones: n("severance payments"),
  destajo: n("piecework pay"),
  despensa: n("grocery vouchers"),
  teletrabajo: n("remote work allowance"),
  honorarios: n("professional fees", { con: "to" }),
  arrendamiento: n("lease payments", { con: "to", cabeza: true, enCabeza: "lease" }),
  arrendamientos: n("lease payments", { con: "to" }),
  renta: n("rent", { cabeza: true }),
  rentas: n("rent"),
  combustible: n("fuel"),
  combustibles: n("fuel"),
  telefono: n("telephone"),
  internet: n("internet"),
  limpieza: n("cleaning"),
  uniformes: n("uniforms"),
  regalias: n("royalties"),
  seguros: n("insurance"),
  seguro: n("insurance"),
  fianzas: n("bonds"),
  intereses: n("interest"),
  comisiones: n("fees"),
  prestamo: n("loan", { cabeza: true }),
  prestamos: n("loans", { cabeza: true }),
  credito: n("credit", { cabeza: true }),
  nomina: n("payroll"),
  nominas: n("payroll"),
  personal: n("staff"),
  trabajadores: n("employees"),
  empleados: n("employees"),
  publicidad: n("advertising"),
  mantenimiento: n("maintenance"),
  fletes: n("freight"),
  devoluciones: n("returns"),
  descuentos: n("discounts"),
  bonificaciones: n("rebates"),
  aportaciones: n("contributions"),
  aportacion: n("contribution"),
  deficit: n("deficit"),
  remanente: n("surplus"),
  // Adjetivos (en inglés van antes del sustantivo)
  nacional: adj("domestic"),
  nacionales: adj("domestic"),
  extranjero: adj("foreign"),
  extranjeros: adj("foreign"),
  diferidos: adj("deferred"),
  diferido: adj("deferred"),
  acreditables: adj("creditable"),
  acreditable: adj("creditable"),
  retenidos: post("withheld"),
  retenido: post("withheld"),
  pagado: post("paid"),
  pagados: post("paid"),
  generales: adj("general"),
  general: adj("general"),
  bancarios: adj("bank"),
  bancarias: adj("bank"),
  bancario: adj("bank"),
  financieros: adj("financial"),
  financieras: adj("financial"),
  administrativos: adj("administrative"),
  administrativo: adj("administrative"),
  anual: adj("annual"),
  mensual: adj("monthly"),
  ejecutivas: adj("executive"),
  operativas: adj("operational"),
  contable: adj("book"),
  integral: adj("comprehensive"),
  fiscales: adj("tax"),
  deducibles: adj("deductible"),
  profesionales: adj("professional"),
};

/** Palabras que, si el nombre trunca justo después, se quitan del final. */
const COLGANTES = new Set(["y", "e", "o", "de", "del", "a", "al", "en", "para", "por", "con", "la", "las", "el", "los"]);

type Token = { display: string; canon: string; dotted: boolean; punct: boolean };

function sinAcentos(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function tokenizar(display: string): Token[] {
  const separado = display
    // «losTrabajadores» → «los Trabajadores»
    .replace(/(\p{Ll})(\p{Lu}\p{Ll})/gu, "$1 $2")
    // «fut.aumentos», «t.cero», «res.Nal» → palabra con punto + siguiente palabra
    .replace(/(\p{L})\.(?=\p{L}{2,})/gu, "$1. ")
    .replace(/([(),;:])/g, " $1 ");
  const tokens: Token[] = [];
  for (const raw of separado.split(/\s+/)) {
    if (!raw) continue;
    if (/^[(),;:]$/.test(raw)) {
      tokens.push({ display: raw, canon: raw, dotted: false, punct: true });
      continue;
    }
    // «P.R.» → «p.» «r.»
    const pieces = /^(\p{L}\.){2,}$/u.test(raw) ? raw.match(/\p{L}\./gu) ?? [raw] : [raw];
    for (const piece of pieces) {
      const dotted = /\p{L}\.$/u.test(piece);
      const canon = sinAcentos(piece.toLocaleLowerCase("es-MX"))
        .replace(/\.$/, "")
        .replace(/^["'´’]+|["'´’]+$/g, "");
      tokens.push({ display: piece, canon, dotted, punct: false });
    }
  }
  return tokens;
}

function expandir(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    if (token.punct) {
      out.push(token);
      continue;
    }
    const expansion =
      (token.dotted ? ABREVIATURAS_CON_PUNTO[token.canon] : undefined) ??
      (PALABRAS[token.canon] ? undefined : ABREVIATURAS[token.canon]);
    if (!expansion) {
      out.push(token);
      continue;
    }
    for (const word of expansion.split(" ")) {
      out.push({ display: word, canon: word, dotted: false, punct: false });
    }
  }
  while (out.length > 0 && COLGANTES.has(out[out.length - 1]!.canon)) {
    out.pop();
  }
  return out;
}

const MAX_FRASE = 7;

type Pieza = Entrada & { punct?: boolean };

function esNumero(canon: string): boolean {
  return /^\d+([.,]\d+)?%?$/.test(canon);
}

/** Traduce desde `start`; devuelve las piezas y dónde se detuvo (fin = todo reconocido). */
function traducirTokens(tokens: Token[]): { piezas: Pieza[]; paro: number; cabezaHasta: number } {
  const piezas: Pieza[] = [];
  let cabezaHasta = -1;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.punct) {
      piezas.push({ en: token.display, pos: "x", punct: true });
      i += 1;
      continue;
    }
    let matched = false;
    for (let len = Math.min(MAX_FRASE, tokens.length - i); len >= 2; len -= 1) {
      const slice = tokens.slice(i, i + len);
      if (slice.some((item) => item.punct)) continue;
      const entry = FRASES[slice.map((item) => item.canon).join(" ")];
      if (entry) {
        piezas.push(entry);
        if (entry.cabeza && piezas.length === 1) cabezaHasta = i + len;
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const entry = PALABRAS[token.canon];
    if (entry) {
      piezas.push(entry);
      if (entry.cabeza && piezas.length === 1) cabezaHasta = i + 1;
      i += 1;
      continue;
    }
    if (esNumero(token.canon)) {
      piezas.push(x(token.display));
      i += 1;
      continue;
    }
    return { piezas, paro: i, cabezaHasta };
  }
  return { piezas, paro: tokens.length, cabezaHasta };
}

/** Adjetivos tras un sustantivo pasan adelante; los conectores se insertan. */
function acomodar(piezas: Pieza[]): string[] {
  const ordenadas: Pieza[] = [];
  for (let i = 0; i < piezas.length; i += 1) {
    const pieza = piezas[i]!;
    if (pieza.pos === "n") {
      let j = i + 1;
      const adjetivos: Pieza[] = [];
      while (j < piezas.length && piezas[j]!.pos === "adj") {
        adjetivos.push(piezas[j]!);
        j += 1;
      }
      ordenadas.push(...adjetivos, pieza);
      i = j - 1;
      continue;
    }
    ordenadas.push(pieza);
  }
  const words: string[] = [];
  for (let i = 0; i < ordenadas.length; i += 1) {
    const pieza = ordenadas[i]!;
    const next = ordenadas[i + 1];
    words.push(pieza.en);
    if (pieza.con && next) {
      if (next.pos === "prep") {
        words.push(pieza.con);
        i += 1;
      } else if (next.pos === "n" || next.pos === "adj") {
        words.push(pieza.con);
      }
    }
  }
  return words;
}

function unir(words: string[]): string {
  let text = words
    .filter((word) => word.length > 0)
    .join(" ")
    .replace(/\s+([,;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+/g, " ")
    .trim();
  const abiertos = (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length;
  if (abiertos > 0) text += ")".repeat(abiertos);
  return text.charAt(0).toLocaleUpperCase("en-US") + text.slice(1);
}

/**
 * Nombre de cuenta en inglés, o null si trae palabras que el glosario no
 * conoce (nombre propio). Ver la explicación al inicio del archivo.
 */
export function traducirCuentaAlIngles(nombre: string): string | null {
  const display = presentarNombre(nombre);
  const tokens = expandir(tokenizar(display));
  if (tokens.length === 0) return null;
  const { piezas, paro, cabezaHasta } = traducirTokens(tokens);
  if (paro === tokens.length) {
    return piezas.length > 0 ? unir(acomodar(piezas)) : null;
  }
  // Cabeza conocida + solo nombre propio después: «Línea crédito Banorte 8712».
  if (cabezaHasta > 0 && paro === cabezaHasta) {
    const cola = tokens.slice(cabezaHasta);
    const colaConocida = cola.some((token) => !token.punct && (PALABRAS[token.canon] || ABREVIATURAS[token.canon]));
    if (!colaConocida) {
      const [cabeza] = traducirTokens(tokens.slice(0, cabezaHasta)).piezas;
      if (cabeza) {
        const conector = cabeza.conCabeza ? [cabeza.conCabeza] : [];
        return unir([cabeza.enCabeza ?? cabeza.en, ...conector, ...cola.map((token) => token.display)]);
      }
    }
  }
  return null;
}
