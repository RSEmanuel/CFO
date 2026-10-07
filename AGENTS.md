# Identidad de marca — Cifra

Aplica estas reglas en TODO lo que generes para este proyecto: componentes, estilos, copy de interfaz,
nombres de archivo, textos de marketing y metadatos.

## 1. Nombre

- El producto se llama **Cifra**. Siempre así: mayúscula inicial, resto en minúsculas.
- Descriptor de categoría: **"Cifra · CFO virtual"**. Úsalo en `<title>`, meta description, hero y
  primer contacto comercial. Dentro del producto, Cifra va solo.
- Tagline: **"Tus cifras, en claro."**
- Empresa matriz: **Data Frontier**. Aparece como endoso ("Un producto de Data Frontier") en el pie de
  página, en "Acerca de" y en documentos legales. NO aparece en el encabezado del producto.
- PROHIBIDO: `CIFRA` en mayúsculas (no es acrónimo), `La Cifra` (el artículo lo vuelve genérico),
  `Cifra App`, `CifraApp`, `Cifra AI`.
- Los módulos NO llevan sub-marca. Se llaman por su función:
  `Salud financiera` · `Rentabilidad` · `Caja y capital de trabajo` · `Escenarios`.
  Nunca inventes `Cifra Pulse`, `Cifra Flow`, `Cifra Forecast` ni equivalentes.

## 2. Logo

Los archivos viven en `assets/`. **Nunca redibujes el logo ni generes uno nuevo**: importa el SVG.

| Archivo | Cuándo |
|---|---|
| `cifra-symbol.svg` | Símbolo sólido sobre fondo claro |
| `cifra-symbol-dark.svg` | Símbolo en modo oscuro |
| `cifra-symbol-mono.svg` | Símbolo libre, hereda `currentColor` |
| `cifra-lockup.svg` | Símbolo + palabra, horizontal |
| `cifra-lockup-dark.svg` | Lockup en modo oscuro |
| `favicon.svg` | Pestaña del navegador |
| `CifraMark.tsx` | Componente React con estados |

El símbolo es un **cero punteado**: un óvalo con un punto exacto al centro.

- El punto mide un cuarto del ancho interior del óvalo. Más grande parece un ojo; más chico desaparece a 16 px.
- Tamaño mínimo: 16 px en digital. El lockup horizontal no baja de 90 px de ancho.
- Área de respeto: el grosor del trazo del óvalo por los cuatro costados.
- PROHIBIDO: rotarlo, aplicarle degradado, rellenar el óvalo, sustituir el punto por otra figura,
  inclinarlo o encerrarlo en otra forma.

### El punto es el dato

El punto central representa la EXISTENCIA del dato. Úsalo como indicador en la interfaz:

- **Punto sólido** → cifra confirmada, viene de la contabilidad
- **Punto hueco** → cifra estimada o calculada por el sistema
- **Sin punto, óvalo discontinuo** → no hay dato

Esto no es decorativo: es el sistema con el que el producto declara la calidad de cada número.

## 3. Color

Importa `tokens/cifra.tokens.css` y **usa siempre las variables**, nunca hexadecimales en el código.

- `--cifra-brand` `#1550E0` (Cobalto) — marca, acciones, enlaces, foco
- `--cifra-ink` `#101425` (Tinta) — texto y cifras. Nunca uses `#000`
- `--cifra-paper` `#F1F3FB` (Papel) — fondo base. **Es blanco teñido de cobalto, no blanco puro.**
  Esta es la firma visual de la marca: no es blanco con botones azules, es un ambiente azul completo.
- `--cifra-ink-3` `#646B85` (Grafito) — texto secundario, etiquetas, ejes de gráficas

### Colores de señal — regla estricta

`--cifra-good` `--cifra-warn` `--cifra-bad` son EXCLUSIVAMENTE para estado. Nunca para decoración,
ilustración, fondos de sección ni acentos de diseño. Un rojo solo aparece cuando hay un riesgo con
monto cuantificado.

### Proporción

60% papel · 30% tinta y grafito · 10% cobalto.
Los tres colores de señal juntos nunca pasan del 2% de una pantalla.

## 4. Tipografía

- **Manrope** (`--cifra-font-sans`) para todo lo que se lee: UI, titulares, copy.
  Titulares en peso 800 con `letter-spacing: -0.045em`.
- **Azeret Mono** (`--cifra-font-mono`) para todo lo que se cuenta.

**REGLA NO NEGOCIABLE:** toda cifra que aparezca en una tabla, un KPI, un eje de gráfica o una
etiqueta de dato usa la mono con `font-variant-numeric: tabular-nums`. Si las columnas de números no
se alinean dígito con dígito, está mal. Usa la clase `.cifra-num` o el atributo `data-numeric`.

## 5. Copy de interfaz

El usuario es dueño de una PyME mexicana y NO es contador. Escribe en español de México.

- **Di el número, di qué significa, di qué hacer.** Nunca en más de dos renglones.
- **Toda alerta termina en verbo.** Si no hay acción concreta, no hay alerta.
- **Nunca celebres un dato aislado.** Un buen mes se reporta con su contexto.
- **Nunca inventes cifras de ejemplo que parezcan reales.** Si necesitas datos de muestra, que sean
  evidentemente de ejemplo. Es el activo más frágil de una marca financiera.

### Léxico

| Escribe | No escribas |
|---|---|
| Meses de respiro | Runway |
| Tu caja | Posición de liquidez |
| Te va a faltar | Se proyecta un déficit |
| Cliente que no te paga | Cuenta con antigüedad mayor a 90 días |
| Cifra calculó | El sistema detectó |
| Esta cifra es estimada | Dato aproximado |

### Ejemplo

❌ "Su razón circulante presenta un valor de 0.41x, situándose por debajo del umbral recomendado."

✅ "Por cada peso que debes este año tienes 41 centavos para pagarlo. Antes de la próxima
amortización hay que renegociar plazo o acelerar cobranza."

## 6. Modo oscuro

Los tokens ya resuelven los tres estados: `:root` (claro), `prefers-color-scheme: dark` con el guard
`:root:not([data-theme="light"])`, y `:root[data-theme="dark"]`.

Nunca definas un color solo dentro de un bloque de media query o `[data-theme]`: si no existe en el
`:root` base, la página se rompe cuando el usuario no ha elegido tema.
