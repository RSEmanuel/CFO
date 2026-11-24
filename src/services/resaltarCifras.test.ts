import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tramosConCifras } from "@/services/resaltarCifras";

function cifras(frase: string): string[] {
  return tramosConCifras(frase)
    .filter((tramo) => tramo.cifra)
    .map((tramo) => tramo.texto);
}

describe("resaltar cifras en una frase", () => {
  it("resalta montos, porcentajes y plazos sin tocar el resto", () => {
    assert.deepEqual(
      cifras("Vendiste $1,234.56 y te quedaron -$12.00; subió 4.5% y cobras en 45 días."),
      ["$1,234.56", "-$12.00", "4.5%", "45 días"],
    );
  });

  it("incluye la unidad del monto compacto y los plazos en inglés", () => {
    assert.deepEqual(cifras("Closing near $2.4M in 3.5 months, 1.2x coverage"), ["$2.4M", "3.5 months", "1.2x"]);
  });

  it("no resalta números sueltos como años o conteos", () => {
    assert.deepEqual(cifras("En 2026 revisamos 12 cuentas"), []);
  });

  it("no corta palabras que empiezan con la unidad", () => {
    assert.deepEqual(cifras("Hace 3 mesesitos"), []);
    assert.deepEqual(cifras("Pagas en 30 días."), ["30 días"]);
  });

  it("al unir los tramos regresa la frase original", () => {
    const frase = "Por cada peso que debes tienes 41 centavos; faltan $3.9 M en 2 meses.";
    assert.equal(
      tramosConCifras(frase)
        .map((tramo) => tramo.texto)
        .join(""),
      frase,
    );
  });
});
