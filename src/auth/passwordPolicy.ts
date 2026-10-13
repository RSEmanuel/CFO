/** Misma política que el User Pool: 8+ caracteres, mayúscula, minúscula y número. */
export function meetsPasswordPolicy(value: string): boolean {
  return value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}
