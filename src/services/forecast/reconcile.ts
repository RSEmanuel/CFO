import { round2 } from "../money";
import type { HorizonMonth } from "./types";

function order(p20: number, p50: number, p80: number): HorizonMonth {
  const sorted = [p20, p50, p80].sort((a, b) => a - b);
  return { periodo: "", p20: sorted[0] ?? p50, p50: sorted[1] ?? p50, p80: sorted[2] ?? p50 };
}

/** P50 por identidad; colas de EBITDA con peor/mejor caja operativa, luego se ordena. */
export function reconcileEbitda(
  ingreso: HorizonMonth[],
  costo: HorizonMonth[],
  gasto: HorizonMonth[],
): HorizonMonth[] {
  const n = Math.min(ingreso.length, costo.length, gasto.length);
  const out: HorizonMonth[] = [];
  for (let i = 0; i < n; i += 1) {
    const ing = ingreso[i];
    const cos = costo[i];
    const gas = gasto[i];
    if (!ing || !cos || !gas) {
      continue;
    }
    const p50 = round2(ing.p50 - cos.p50 - gas.p50);
    const p20raw = round2(ing.p20 - cos.p80 - gas.p80);
    const p80raw = round2(ing.p80 - cos.p20 - gas.p20);
    const ordered = order(p20raw, p50, p80raw);
    out.push({ periodo: ing.periodo, p20: ordered.p20, p50, p80: ordered.p80 });
  }
  return out;
}

export function reconcilePoint(ingreso: number, costo: number, gasto: number): number {
  return round2(ingreso - costo - gasto);
}
