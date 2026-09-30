import assert from "node:assert/strict";
import test from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { classifyCategoria, isDepreciation } from "@/services/ingest/accountClassify";
import { COMPAC_ACCOUNT_ROLES, COMPAC_BALANZA_PROFILE } from "@/services/ingest/builtinProfiles";
import type { AccountRoles } from "@/services/ingest/types";
import {
  balanceSignConvention,
  capitalContableNif,
  isCurrentAsset,
  isCurrentLiability,
  resultadoEjercicioYtd,
  structureFromBalanza,
} from "@/services/metricsLedger";
import { buildPosicionTree, capitalGroupOf } from "@/services/posicionFinanciera";

const COMPAC_RULES = COMPAC_BALANZA_PROFILE.accountPrefixRules;

type BalanzaRowInput = Omit<Partial<BalanzaPnL>, "saldoInicial" | "debe" | "haber" | "saldoFinal"> & {
  idCuenta: string;
  saldoInicial?: number;
  debe?: number;
  haber?: number;
  saldoFinal?: number;
};

function balanzaRow(overrides: BalanzaRowInput): BalanzaPnL {
  return {
    nombreCuenta: overrides.idCuenta,
    categoriaMaestra: "Activo",
    saldoInicial: 0,
    debe: 0,
    haber: 0,
    saldoFinal: 0,
    depreciacionAmortizacion: false,
    ...overrides,
  } as unknown as BalanzaPnL;
}

test("isCurrentAsset default: 11xx circulante excepto 119x; 12xx+ no circulante", () => {
  // Circulante: disponible y deudores
  assert.equal(isCurrentAsset("1101-0001-0000-0000", "CAJA CHICA"), true);
  assert.equal(isCurrentAsset("1102-0001-0001-0000", "BBVA BANCOMER"), true);
  assert.equal(isCurrentAsset("1105-0001-0001-0000", "DEUDOR DIVERSO"), true);
  // Activo fijo del catálogo Compac: automóviles viven en 119x
  assert.equal(isCurrentAsset("1190-0001-0000-0000", "AUTOMÓVIL AUDI Q3"), false);
  // 12xx: activo fijo y contra-activo (dep. acumulada)
  assert.equal(isCurrentAsset("1200-0001-0000-0000", "DEPRECIACION AUTOMÓVIL"), false);
  assert.equal(isCurrentAsset("1201-0001-0000-0000", "MOBILIARIO SILLAS EJECUTIVAS"), false);
  assert.equal(isCurrentAsset("1206-0001-0000-0000", "Equipo de computo"), false);
  assert.equal(isCurrentAsset("1207-0001-0000-0000", "Dep. Acum Equipo de Computo"), false);
  // 13xx/14xx no existen en el catálogo Compac; por convención SAT son no circulantes
  assert.equal(isCurrentAsset("1301-0001-0000-0000", "CARGOS DIFERIDOS"), false);
  assert.equal(isCurrentAsset("1401-0001-0000-0000", "INTANGIBLES"), false);
  // Fallback por nombre para prefijos fuera de rango
  assert.equal(isCurrentAsset("1050-01", "Bancos moneda nacional"), true);
});

test("isCurrentLiability default: 21/22 CP (2106 incluido), 23+ LP", () => {
  assert.equal(isCurrentLiability("2101-0001-0001-0000", "PROVEEDOR"), true);
  // 2106 agrupa TDC + líneas + préstamos: sin dato CP/LP dentro de la agrupadora → CP
  assert.equal(isCurrentLiability("2106-0002-0000-0000", "TDC AMEX"), true);
  assert.equal(isCurrentLiability("2106-0006-0000-0000", "LINEA CREDITO BANORTE"), true);
  assert.equal(isCurrentLiability("2106-0009-0000-0000", "Prestamo BBVA"), true);
  assert.equal(isCurrentLiability("2113-0001-0000-0000", "IVA por pagar"), true);
  assert.equal(isCurrentLiability("2306-0001-0000-0000", "Anticipo de cliente nacional"), false);
  assert.equal(isCurrentLiability("2359-0003-0000-0000", "Otros impuestos diferidos"), false);
});

test("overrides por tenant: accountRoles ganan sobre el default", () => {
  const roles: AccountRoles = {
    activoNoCirculante: { prefixes: ["1102"] },
    pasivoCirculante: { prefixes: ["23"] },
  };
  assert.equal(isCurrentAsset("1102-0001-0001-0000", "BBVA BANCOMER", roles), false);
  assert.equal(isCurrentAsset("1105-0001-0001-0000", "DEUDOR", roles), true);
  assert.equal(isCurrentLiability("2306-0001-0000-0000", "Anticipo de cliente", roles), true);
  assert.equal(isCurrentLiability("2101-0001-0001-0000", "PROVEEDOR", roles), true);
  // nameTokens también aplican en el override
  const porNombre: AccountRoles = { activoNoCirculante: { prefixes: [], nameTokens: ["automovil"] } };
  assert.equal(isCurrentAsset("1102-0099-0000-0000", "Automóvil de reparto", porNombre), false);
});

test("perfil Compac: los roles declarados coinciden con el default corregido", () => {
  assert.equal(isCurrentAsset("1102-0001-0001-0000", "BBVA", COMPAC_ACCOUNT_ROLES), true);
  assert.equal(isCurrentAsset("1190-0001-0000-0000", "AUTOMÓVIL", COMPAC_ACCOUNT_ROLES), false);
  assert.equal(isCurrentAsset("1201-0001-0000-0000", "MOBILIARIO", COMPAC_ACCOUNT_ROLES), false);
  assert.equal(isCurrentAsset("1200-0001-0000-0000", "DEPRECIACION AUTOMÓVIL", COMPAC_ACCOUNT_ROLES), false);
  assert.equal(isCurrentLiability("2106-0002-0000-0000", "TDC AMEX", COMPAC_ACCOUNT_ROLES), true);
  assert.equal(isCurrentLiability("2306-0001-0000-0000", "Anticipo de cliente", COMPAC_ACCOUNT_ROLES), false);
});

test("classifyCategoria: nameExceptions solo aplican a PyG (4xxx–8xxx)", () => {
  // 1200/1202 son contra-activo (dep. acumulada): NUNCA OpEx aunque el nombre diga depreciación
  assert.equal(classifyCategoria("1200-0001-0000-0000", "DEPRECIACION AUTOMÓVIL", COMPAC_RULES), "Activo");
  assert.equal(classifyCategoria("1202-0001-0000-0000", "DEPRECIACIÓN SILLAS EJECUTIVAS", COMPAC_RULES), "Activo");
  // En PyG la excepción sigue aplicando
  assert.equal(classifyCategoria("6101-0090-0000-0000", "DEPRECIACION AUTOMOVIL", COMPAC_RULES), "OpEx");
  assert.equal(classifyCategoria("6301-0004-0000-0000", "Depreciación Mobiliario y Equipo", COMPAC_RULES), "OpEx");
  assert.equal(classifyCategoria("5101-0001-0000-0000", "COSTO DE VENTAS", COMPAC_RULES), "COGS");
  // Balance y PyG por prefijo
  assert.equal(classifyCategoria("2101-0001-0001-0000", "PROVEEDOR", COMPAC_RULES), "Pasivo");
  assert.equal(classifyCategoria("3101-0001-0001-0000", "CAPITAL", COMPAC_RULES), "Patrimonio");
  assert.equal(classifyCategoria("4101-0001-0001-0000", "Ventas", COMPAC_RULES), "Ingreso");
});

test("isDepreciation: solo cuentas de PyG; balance con 'depreciación' queda fuera", () => {
  assert.equal(isDepreciation("DEPRECIACION AUTOMÓVIL", "1200-0001-0000-0000"), false);
  assert.equal(isDepreciation("DEPRECIACIÓN SILLAS EJECUTIVAS", "1202-0001-0000-0000"), false);
  assert.equal(isDepreciation("Depreciación Equipo de Transporte", "6301-0003-0000-0000"), true);
  assert.equal(isDepreciation("DEPRECIACION AUTOMOVIL", "6101-0090-0000-0000"), true);
  assert.equal(isDepreciation("Sueldos y Salarios", "6101-0001-0000-0000"), false);
});

test("structureFromBalanza: activo fijo fuera del circulante y contra-activo resta", () => {
  const rows = [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA", saldoFinal: 100 }),
    balanzaRow({ idCuenta: "1190-0001-0000-0000", nombreCuenta: "AUTOMÓVIL", saldoFinal: 50 }),
    balanzaRow({ idCuenta: "1201-0001-0000-0000", nombreCuenta: "MOBILIARIO", saldoFinal: 30 }),
    balanzaRow({ idCuenta: "1200-0001-0000-0000", nombreCuenta: "DEPRECIACION AUTOMÓVIL", saldoFinal: -20 }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: -40 }),
    balanzaRow({ idCuenta: "2306-0001-0000-0000", nombreCuenta: "Anticipo de cliente", categoriaMaestra: "Pasivo", saldoFinal: -10 }),
  ];
  const structure = structureFromBalanza(rows);
  assert.equal(structure.activoCirculante, 100);
  assert.equal(structure.pasivoCirculante, -40);
  assert.equal(structure.pasivoTotal, -50);
  // Override: el tenant puede declarar 1190 como circulante si su catálogo lo usa distinto
  const conOverride = structureFromBalanza(rows, { activoCirculante: { prefixes: ["119"] } });
  assert.equal(conOverride.activoCirculante, 150);
});

test("buildPosicionTree: 1200/1202 van a activo LP y el cuadre A = P + C se mantiene al centavo", () => {
  const rows = [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA", saldoFinal: 100 }),
    balanzaRow({ idCuenta: "1201-0001-0000-0000", nombreCuenta: "MOBILIARIO", saldoFinal: 30 }),
    balanzaRow({ idCuenta: "1200-0001-0000-0000", nombreCuenta: "DEPRECIACION AUTOMÓVIL", saldoFinal: -20 }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: 60 }),
    balanzaRow({ idCuenta: "3101-0001-0001-0000", nombreCuenta: "CAPITAL", categoriaMaestra: "Patrimonio", saldoFinal: 50 }),
  ];
  const tree = buildPosicionTree({ "2026": rows }, ["2026"]);
  const activo = tree.find((node) => node.id === "epf:activo");
  const activoCp = activo?.children?.find((node) => node.id === "epf:activo-cp");
  const activoLp = activo?.children?.find((node) => node.id === "epf:activo-lp");
  // Contra-activo: la dep. acumulada resta del activo fijo en el largo plazo
  assert.equal(activoCp?.values["2026"], 100);
  assert.equal(activoLp?.values["2026"], 10);
  assert.equal(activo?.values["2026"], 110);
  // A = P + C → 110 = 60 + 50: el nodo de control existe y vale 0
  const control = tree.find((node) => node.id === "epf:control");
  assert.ok(control, "el nodo de control A = P + C debe existir cuando la identidad cuadra");
  assert.equal(control.values["2026"], 0);
});

test("capitalGroupOf: prefijos NIF del catálogo Compac, catch-all y overrides por tenant", () => {
  // Prefijos verificados contra la DB (balanza jul-2026)
  assert.equal(capitalGroupOf("3101-0001-0001-0000", "ING DANIEL GUZMAN SALINAS"), "capitalSocial");
  assert.equal(capitalGroupOf("3101-0003-0000-0000", "Aport. p/ fut.aumentos capital"), "capitalSocial");
  assert.equal(capitalGroupOf("3102-0002-0000-0000", "Aportación patrimonial"), "capitalSocial");
  assert.equal(capitalGroupOf("3103-0000-0000-0000", "Reserva legal"), "reservas");
  assert.equal(capitalGroupOf("3104-0001-0000-0000", "Utilidad de ejerc. anteriores"), "resultadosAcumulados");
  assert.equal(capitalGroupOf("3105-0002-0002-0000", "EJERCICIO 2019"), "resultadosAcumulados");
  // Catch-all: 3106 y cualquier 3xxx no mapeada
  assert.equal(capitalGroupOf("3106-0000-0000-0000", "Otras cuentas de capital"), "otrasCapital");
  assert.equal(capitalGroupOf("3999-0000-0000-0000", "Cuenta desconocida"), "otrasCapital");
  // Catálogos que llevan el resultado del ejercicio en el 3xxx (por nombre)
  assert.equal(capitalGroupOf("3201-0001-0000-0000", "Resultado del ejercicio"), "resultadoEjercicio");
  // El perfil Compac declara los mismos roles: el resultado es idéntico
  assert.equal(capitalGroupOf("3101-0001-0001-0000", "ING DANIEL GUZMAN SALINAS", COMPAC_ACCOUNT_ROLES), "capitalSocial");
  assert.equal(capitalGroupOf("3105-0002-0002-0000", "EJERCICIO 2019", COMPAC_ACCOUNT_ROLES), "resultadosAcumulados");
  assert.equal(capitalGroupOf("3106-0000-0000-0000", "Otras cuentas de capital", COMPAC_ACCOUNT_ROLES), "otrasCapital");
  // Override por tenant: el rol declarado reclama la cuenta antes que el default
  const override: AccountRoles = { capitalSocial: { prefixes: ["3105"] } };
  assert.equal(capitalGroupOf("3105-0002-0002-0000", "EJERCICIO 2019", override), "capitalSocial");
  // Lo que el override no reclama sigue cayendo en el default
  assert.equal(capitalGroupOf("3101-0001-0001-0000", "CAPITAL SOCIAL", override), "capitalSocial");
});

test("buildPosicionTree: estructura NIF del capital en signo ECONÓMICO y cuadre A = P + C al centavo", () => {
  // Almacenamiento Compac: pasivos y capital acreedores negativos; las pérdidas
  // acumuladas (3105) son deudoras positivas. La balanza cierra en 0.
  // PRESENTACIÓN: el árbol muestra Pasivo y Capital en signo económico
  // (positivo = a favor; negativo = déficit), así A = P + C se lee directo.
  const rows = [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA", saldoFinal: 100 }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: -40 }),
    balanzaRow({ idCuenta: "3101-0001-0001-0000", nombreCuenta: "CAPITAL SOCIAL", categoriaMaestra: "Patrimonio", saldoFinal: -30 }),
    balanzaRow({ idCuenta: "3103-0000-0000-0000", nombreCuenta: "RESERVA LEGAL", categoriaMaestra: "Patrimonio", saldoFinal: -5 }),
    balanzaRow({ idCuenta: "3105-0002-0002-0000", nombreCuenta: "EJERCICIO 2019", categoriaMaestra: "Patrimonio", saldoFinal: 10 }),
    balanzaRow({ idCuenta: "3106-0000-0000-0000", nombreCuenta: "OTRAS CUENTAS DE CAPITAL", categoriaMaestra: "Patrimonio", saldoFinal: -2 }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", saldoFinal: -100 }),
    balanzaRow({ idCuenta: "5101-0001-0001-0000", nombreCuenta: "COSTO DE VENTAS", categoriaMaestra: "COGS", saldoFinal: 60 }),
    balanzaRow({ idCuenta: "6101-0001-0001-0000", nombreCuenta: "GASTOS", categoriaMaestra: "OpEx", saldoFinal: 7 }),
  ];
  const tree = buildPosicionTree({ "2026": rows }, ["2026"]);
  const capital = tree.find((node) => node.id === "epf:capital");
  assert.ok(capital);
  // Sub-grupos NIF en orden: capital social, reservas, resultados acumulados,
  // resultado del ejercicio y catch-all
  assert.deepEqual(
    capital.children?.map((node) => node.id),
    [
      "epf:capital-social",
      "epf:capital-reservas",
      "epf:capital-resultados-acumulados",
      "epf:capital-resultado-ejercicio",
      "epf:capital-otras",
    ],
  );
  const group = (id: string) => capital.children?.find((node) => node.id === id);
  // Signo económico: aportaciones acreedoras positivas; pérdidas deudoras negativas
  assert.equal(group("epf:capital-social")?.values["2026"], 30);
  assert.equal(group("epf:capital-reservas")?.values["2026"], 5);
  assert.equal(group("epf:capital-resultados-acumulados")?.values["2026"], -10);
  // Resultado del ejercicio = saldo YTD del PyG: −100 + 60 + 7 = −33 crudo
  // (utilidad acreedora) → se presenta +33 (utilidad económica)
  assert.equal(group("epf:capital-resultado-ejercicio")?.values["2026"], 33);
  assert.equal(group("epf:capital-otras")?.values["2026"], 2);
  // La suma de sub-grupos es el total del capital
  const sumaGrupos = (capital.children ?? []).reduce((acc, node) => acc + (node.values["2026"] ?? 0), 0);
  assert.equal(capital.values["2026"], 60);
  assert.equal(sumaGrupos, capital.values["2026"]);
  // El pasivo también se presenta en magnitud económica
  const pasivo = tree.find((node) => node.id === "epf:pasivo");
  assert.equal(pasivo?.values["2026"], 40);
  // La cuenta 3105 cuelga del sub-grupo de resultados acumulados
  assert.ok(
    group("epf:capital-resultados-acumulados")?.children?.some(
      (node) => node.id === "epf:cap:3105-0002-0002-0000",
    ),
  );
  // La línea sintética YTD cuelga del sub-grupo de resultado del ejercicio
  const ytd = group("epf:capital-resultado-ejercicio")?.children?.find(
    (node) => node.id === "epf:cap:resultado-ejercicio-ytd",
  );
  assert.ok(ytd);
  assert.equal(ytd.values["2026"], 33);
  assert.equal(ytd.labelKey, "posicionFinanciera.structure.resultadoEjercicio");
  // Cuadre con los valores MOSTRADOS: A = 100 = P 40 + C 60 → control 0
  const control = tree.find((node) => node.id === "epf:control");
  assert.ok(control, "con la presentación económica la identidad cuadra y muestra el control");
  assert.equal(control.values["2026"], 0);
});

test("buildPosicionTree: cuenta 3xxx de resultado del ejercicio sin duplicar el YTD del PyG", () => {
  // Ejercicio cerrado: el resultado vive en la 3201 y el PyG queda en cero,
  // así que la línea sintética no suma nada (no hay doble conteo).
  const rows = [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA", saldoFinal: 73 }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: -40 }),
    balanzaRow({ idCuenta: "3201-0001-0000-0000", nombreCuenta: "RESULTADO DEL EJERCICIO", categoriaMaestra: "Patrimonio", saldoFinal: -33 }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", saldoFinal: 0 }),
  ];
  const tree = buildPosicionTree({ "2025": rows }, ["2025"]);
  const capital = tree.find((node) => node.id === "epf:capital");
  const grupo = capital?.children?.find((node) => node.id === "epf:capital-resultado-ejercicio");
  assert.ok(grupo);
  // Presentación económica: la 3201 acreedora (−33 crudo) se muestra +33
  assert.equal(grupo.values["2025"], 33);
  assert.ok(grupo.children?.some((node) => node.id === "epf:cap:3201-0001-0000-0000"));
  assert.equal(capital?.values["2025"], 33);
  const control = tree.find((node) => node.id === "epf:control");
  assert.ok(control);
  assert.equal(control.values["2025"], 0);
});

test("capitalContableNif: déficit patrimonial real jul-2026 (convención Compac)", () => {
  // Réplica de la balanza real verificada en DB: capital social acreedor
  // −600,000; resultados acumulados deudores netos +10,349,857.41 (pérdidas);
  // PyG YTD deudor +822,603.62 (pérdida del ejercicio). Activos 9,370,898.31;
  // pasivos acreedores −19,943,359.34. Cierra en cero.
  const rows = [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA", saldoFinal: 9_370_898.31 }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: -19_943_359.34 }),
    balanzaRow({ idCuenta: "3101-0001-0001-0000", nombreCuenta: "CAPITAL SOCIAL", categoriaMaestra: "Patrimonio", saldoFinal: -600_000 }),
    balanzaRow({ idCuenta: "3105-0002-0002-0000", nombreCuenta: "EJERCICIO 2021", categoriaMaestra: "Patrimonio", saldoFinal: 10_349_857.41 }),
    balanzaRow({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "VENTAS", categoriaMaestra: "Ingreso", saldoFinal: -4_177_396.38 }),
    balanzaRow({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "COSTO", categoriaMaestra: "COGS", saldoFinal: 5_000_000 }),
  ];
  // Σ saldoFinal = 0 (precondición de cierre CONTPAQi)
  const suma = rows.reduce((acc, fila) => acc + Number(fila.saldoFinal), 0);
  assert.equal(Math.round(suma * 100) / 100, 0);

  // Resultado YTD con signo contable de capital: deudor positivo = pérdida
  assert.equal(resultadoEjercicioYtd(rows), 822_603.62);
  // La identidad detecta la convención acreedor-negativo
  assert.equal(balanceSignConvention(rows), -1);
  // Capital NIF económico: 600,000 − 10,349,857.41 − 822,603.62 = déficit
  assert.equal(capitalContableNif(rows), -10_572_461.03);
  // structureFromBalanza expone ambas lecturas: cruda 3xxx y NIF económico
  const structure = structureFromBalanza(rows);
  assert.equal(structure.patrimonioNeto, 9_749_857.41);
  assert.equal(structure.patrimonioNif, -10_572_461.03);
});

test("capitalContableNif: convención de magnitudes (fallback) conserva el signo económico", () => {
  // Tenant que persiste pasivos/capital como magnitudes con resultado ya
  // asentado en el 3xxx (sin PyG): la identidad A = P + C manda.
  const rows = [
    balanzaRow({ idCuenta: "1102-0001-0001-0000", nombreCuenta: "BBVA", saldoFinal: 110 }),
    balanzaRow({ idCuenta: "2101-0001-0001-0000", nombreCuenta: "PROVEEDOR", categoriaMaestra: "Pasivo", saldoFinal: 60 }),
    balanzaRow({ idCuenta: "3101-0001-0001-0000", nombreCuenta: "CAPITAL", categoriaMaestra: "Patrimonio", saldoFinal: 50 }),
  ];
  assert.equal(balanceSignConvention(rows), 1);
  assert.equal(capitalContableNif(rows), 50);
});
