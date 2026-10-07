# Paquete de marca — Cifra

Todo lo que Cursor necesita para aplicar el nombre y el logo sin que tengas que explicárselo.

## Instalación (2 minutos)

1. **Copia el contenido de esta carpeta a la raíz de tu repo.** Respeta la estructura:

```
tu-proyecto/
├── .cursor/rules/cifra-brand.mdc   ← Cursor lo lee solo, en cada chat
├── .cursorrules                     ← respaldo para versiones viejas de Cursor
├── AGENTS.md                        ← lo leen Claude Code, Codex y otros agentes
├── assets/                          ← los SVG del logo
└── tokens/                          ← color y tipografía
```

2. **Importa los tokens** en tu CSS global o en `layout.tsx`:

```css
@import "./tokens/cifra.tokens.css";
```

3. **Carga las fuentes.** En el `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Azeret+Mono:wght@400;500;700&display=swap">
```

En Next.js, mejor con `next/font/google`: `Manrope` y `Azeret_Mono`.

4. **Si usas Tailwind**, agrega el preset:

```js
// tailwind.config.js
module.exports = {
  presets: [require("./tokens/tailwind.cifra.js")],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
};
```

5. **Reinicia Cursor** para que tome la regla nueva.

## Cómo verificar que Cursor ya la está usando

Abre el chat de Cursor y pregunta: *"¿cuál es el color primario de este proyecto y por qué el fondo no es blanco puro?"*

Si responde `#1550E0` y explica que el papel está teñido de cobalto, la regla cargó bien.
Si no, revisa que `.cursor/rules/cifra-brand.mdc` esté en la raíz y que el archivo tenga el bloque
`---` de frontmatter al inicio.

## Qué contiene

| Ruta | Qué es |
|---|---|
| `.cursor/rules/cifra-brand.mdc` | Regla de proyecto con `alwaysApply: true`. Cursor la inyecta en cada conversación |
| `.cursorrules` | Mismo contenido, formato antiguo. Inofensivo si tu Cursor ya usa `.mdc` |
| `AGENTS.md` | Mismo contenido, para otros agentes de código |
| `assets/cifra-symbol.svg` | Símbolo sólido |
| `assets/cifra-symbol-dark.svg` | Símbolo en modo oscuro |
| `assets/cifra-symbol-mono.svg` | Símbolo que hereda `currentColor` |
| `assets/cifra-lockup.svg` | Símbolo + palabra |
| `assets/cifra-lockup-dark.svg` | Lockup en modo oscuro |
| `assets/favicon.svg` | Favicon |
| `assets/cifra-state-*.svg` | Los tres estados del punto |
| `assets/CifraMark.tsx` | Componente React con la prop `state` |
| `tokens/cifra.tokens.css` | Variables CSS, claro y oscuro |
| `tokens/cifra.tokens.json` | Los mismos tokens en JSON |
| `tokens/tailwind.cifra.js` | Preset de Tailwind |

## Favicon e íconos de app

`favicon.svg` funciona en navegadores modernos. Para el resto:

```bash
npx pwa-asset-generator assets/favicon.svg ./public/icons -b "#1550E0" -p 12%
```

O sube `favicon.svg` a realfavicongenerator.net y usa `#1550E0` como fondo.

---

Un producto de Data Frontier.
