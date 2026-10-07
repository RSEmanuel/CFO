# Prompt para pegar en Cursor

Después de copiar la carpeta al repo, abre el chat de Cursor en **modo Agent** y pega esto:

---

Acabo de agregar el paquete de marca de **Cifra** al proyecto. Lee `.cursor/rules/cifra-brand.mdc`
completo antes de tocar nada, y luego aplica la identidad a todo el código existente:

1. **Nombre.** Reemplaza cualquier nombre de producto anterior o placeholder por `Cifra` en
   `package.json`, `<title>`, meta tags, manifest, README, encabezados y textos visibles.
   El descriptor de categoría es `Cifra · CFO virtual` y va en title y meta description.
   No uses `CIFRA` ni `La Cifra`.

2. **Tokens.** Importa `tokens/cifra.tokens.css` en el CSS global. Después recorre el proyecto y
   reemplaza TODO color hexadecimal escrito a mano por su variable equivalente. Si encuentras un
   color que no mapea a ningún token, no lo inventes: párate y dime cuál es y dónde está.

3. **Fuentes.** Carga Manrope y Azeret Mono. Aplica Manrope como fuente base.
   Luego busca todos los lugares donde se muestra un número —KPIs, tablas, ejes de gráficas,
   montos— y aplícales la mono con `font-variant-numeric: tabular-nums`.

4. **Logo.** Sustituye cualquier logo o placeholder por los SVG de `assets/`.
   Usa el lockup en el encabezado y el símbolo solo donde no quepa la palabra.
   Configura `favicon.svg`. No redibujes el logo.

5. **Modo oscuro.** Verifica que ningún color esté definido únicamente dentro de un bloque
   `@media (prefers-color-scheme: dark)` o `[data-theme]`. Todos deben existir primero en `:root`.

6. **Copy.** Revisa los textos de interfaz contra el léxico de la regla. Cambia los anglicismos
   ("runway" → "meses de respiro") y reescribe las alertas para que terminen en una acción concreta.

Antes de empezar, dame un plan de los archivos que vas a tocar. No modifiques lógica de negocio
ni nombres de variables que no tengan que ver con la marca.

---

## Si Cursor se pone creativo

Estas tres son las que más se rompen. Si las ves, córtalo de inmediato:

- **Inventa sub-marcas** para los módulos (`Cifra Flow`, `Cifra Pulse`). Los módulos van con nombre
  descriptivo: Salud financiera, Rentabilidad, Caja y capital de trabajo, Escenarios.
- **Pone el fondo en blanco puro.** El papel es `#F1F3FB`, cobalto muy diluido. Es la firma de la marca.
- **Usa verde o rojo como acento de diseño.** Esos colores son exclusivamente de estado.
