/**
 * Preset de Tailwind para Cifra.
 * Uso:  module.exports = { presets: [require("./tokens/tailwind.cifra.js")], ... }
 * Requiere tokens/cifra.tokens.css importado para que las variables existan.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand:   { DEFAULT: "var(--cifra-brand)", soft: "var(--cifra-brand-soft)", contrast: "var(--cifra-brand-contrast)" },
        paper:   "var(--cifra-paper)",
        surface: { DEFAULT: "var(--cifra-surface)", 2: "var(--cifra-surface-2)" },
        ink:     { DEFAULT: "var(--cifra-ink)", 2: "var(--cifra-ink-2)", 3: "var(--cifra-ink-3)" },
        line:    { DEFAULT: "var(--cifra-line)", 2: "var(--cifra-line-2)" },
        good:    { DEFAULT: "var(--cifra-good)", soft: "var(--cifra-good-soft)" },
        warn:    { DEFAULT: "var(--cifra-warn)", soft: "var(--cifra-warn-soft)" },
        bad:     { DEFAULT: "var(--cifra-bad)",  soft: "var(--cifra-bad-soft)" },
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["Azeret Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { DEFAULT: "10px", brand: "15px" },
      letterSpacing: { display: "-0.045em" },
    },
  },
};
