export function isAncestorAccount(parent: string, child: string): boolean {
  if (parent === child) {
    return false;
  }
  const p = parent.split("-");
  const c = child.split("-");
  if (p.length !== c.length || p[0] !== c[0]) {
    return false;
  }
  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === c[i]) {
      continue;
    }
    if (/^0+$/.test(p[i] ?? "")) {
      continue;
    }
    return false;
  }
  return true;
}

const ZERO_SEGMENT = /^0+$/;

/**
 * Devuelve los códigos hoja: los que NO son ancestro de ningún otro código
 * de la lista (misma semántica que comparar cada par con isAncestorAccount).
 *
 * En vez de comparar cada código contra todos —O(n²) con split+regex por par,
 * ~7 s en un plan de ~600 cuentas × 24 meses—, genera los ancestros posibles
 * de cada código (sus segmentos reemplazados por variantes todo-ceros) y los
 * busca en un Set: O(n · 2^(k-1) · z), con k = segmentos por cuenta y
 * z = variantes de ceros presentes (típicamente 7 candidatos por cuenta).
 */
export function selectLeafCodes(codes: string[]): Set<string> {
  const codeSet = new Set(codes);
  const zeroVariants = new Set<string>();
  for (const code of codes) {
    for (const segment of code.split("-")) {
      if (ZERO_SEGMENT.test(segment)) {
        zeroVariants.add(segment);
      }
    }
  }
  const zeros = [...zeroVariants];
  const hasDescendant = new Set<string>();

  for (const child of codes) {
    const segments = child.split("-");
    const segmentCount = segments.length;
    if (segmentCount < 2 || zeros.length === 0) {
      continue;
    }
    if (segmentCount > 8) {
      // Plan con segmentación extrema: barrido clásico solo para este código.
      for (const other of codes) {
        if (isAncestorAccount(other, child)) {
          hasDescendant.add(other);
        }
      }
      continue;
    }
    // El primer segmento debe coincidir exacto: solo se reemplazan 1..k-1.
    const maskCount = 1 << (segmentCount - 1);
    for (let mask = 1; mask < maskCount; mask += 1) {
      const positions: number[] = [];
      for (let index = 1; index < segmentCount; index += 1) {
        if (mask & (1 << (index - 1))) {
          positions.push(index);
        }
      }
      const comboCount = zeros.length ** positions.length;
      for (let combo = 0; combo < comboCount; combo += 1) {
        const candidate = segments.slice();
        let remainder = combo;
        for (const position of positions) {
          candidate[position] = zeros[remainder % zeros.length] as string;
          remainder = Math.floor(remainder / zeros.length);
        }
        const candidateCode = candidate.join("-");
        if (candidateCode !== child && codeSet.has(candidateCode)) {
          hasDescendant.add(candidateCode);
        }
      }
    }
  }

  return new Set(codes.filter((code) => !hasDescendant.has(code)));
}
