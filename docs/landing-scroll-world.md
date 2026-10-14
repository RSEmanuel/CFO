# Landing "scroll-world" de Cifra

Landing pública de marketing en `/landing`. Técnica "scroll-world": al hacer scroll, una cámara pregrabada vuela de escena en escena sin cortes (skill [oso95/scroll-world](https://github.com/oso95/scroll-world), código de terceros, licencia MIT).

Estado actual: **estructura, motor y copy listos; sin videos**. Mientras no existan los videos, la página muestra la versión estática con posters de muestra (dioramas SVG con los tokens de marca). Cuando los videos se dejen en `public/scroll-world/` y se vuelva a desplegar, el vuelo se activa solo.

## Qué hay y dónde

| Pieza | Archivo |
|---|---|
| Ruta pública | `src/app/landing/page.tsx` (metadata, correo de demo, manifiesto de assets) |
| Orquestador (vuelo vs. estática) | `src/components/landing/LandingPage.tsx` |
| Motor del vuelo (adaptación React de `scrub-engine.js`) | `src/components/landing/ScrollFlight.tsx` |
| Versión estática (mismas escenas y CTA) | `src/components/landing/StaticScenes.tsx` |
| Piezas compartidas (barra, copy, cómo funciona, demo, pie) | `src/components/landing/shared.tsx` |
| Posters de muestra (SVG isométrico) | `src/components/landing/posters.tsx` |
| Estilos (solo variables `--cifra-*`) | `src/components/landing/landing.css` |
| Detección de assets en el build | `src/components/landing/manifest.server.ts` |
| Copy es/en | `src/i18n/messages/{es,en}.json`, llave `landing` |

La ruta no usa el shell `(app)` ni `AuthGate`, y `middleware.ts` solo protege `/api/*`, así que `/landing` responde 200 sin sesión. No hubo que agregar lista de rutas públicas.

## Escenas (6)

1. `torre` Inicio: "Tus cifras, en claro." (problema y promesa).
2. `resultados` Resultados.
3. `caja` Caja y flujo.
4. `cobranza` Cobranza.
5. `salud` Salud financiera.
6. `mundo` Empezar: CTA (Iniciar sesión / Solicitar demo).

Después del vuelo siguen, en flujo normal: "Cómo funciona" (3 pasos), bloque `#demo` y pie con "Un producto de Data Frontier" (solo ahí).

## Cómo se decide qué ve cada persona

- HTML del servidor y sin JavaScript: versión estática (indexable).
- `prefers-reduced-motion: reduce`, o el botón "Ver sin animaciones": versión estática.
- Sin videos en `public/scroll-world/video/`: versión estática.
- Con al menos un clip: vuelo por scroll.
- Vista previa del vuelo sin videos (solo posters): `/landing?vuelo=1`. Forzar la estática: `/landing?vuelo=0`.

## Dónde dejar los assets

Nombres fijos, uno por escena (ids de la lista de arriba) y conectores numerados 1 a 5 en orden:

```
public/scroll-world/video/<id>.mp4         inmersión en la escena (landscape 16:9)
public/scroll-world/video/<id>-m.mp4       opcional, versión móvil (9:16 nativo)
public/scroll-world/video/conn1.mp4 ... conn5.mp4        conector escena i -> i+1
public/scroll-world/video/conn1-m.mp4 ... conn5-m.mp4    opcional, móvil
public/scroll-world/posters/<id>.webp      opcional, reemplaza al SVG de muestra
public/scroll-world/posters/<id>-m.webp    opcional, poster vertical
```

El manifiesto se calcula en el build (`manifest.server.ts`): después de agregar archivos hay que volver a desplegar. Un conector que falte no rompe nada: las dos escenas se disuelven directo.

### Git y producción

`.gitignore` excluye `public/scroll-world/*` salvo `posters/*.webp` (ligeros) y los `.gitkeep`. **Los videos no van en git, así que no llegan a Vercel por el flujo normal.** Hay que decidir cómo se publican (ver "Pendiente para producción").

## Cómo regenerar los assets con la skill

1. Instalación manual (ya hecha en esta máquina): `~/.claude/skills/scroll-world` (copia de `skills/scroll-world` del repo de oso95, revisada antes de copiarla).
2. Requisitos de la skill: CLI de Monid con saldo (video, por clip), CLI de Higgsfield autenticado (imágenes fijas), `ffmpeg`, Python 3 con Pillow. Opcional: Codex CLI para las imágenes fijas con suscripción de ChatGPT.
3. En Claude Code, pedir "crea el scroll-world de Cifra" o invocar `/scroll-world`, y responder el intake con estas decisiones:
   - Sujeto: Cifra · CFO virtual, para dueños de PyME mexicana. Escenas y orden: las 6 de arriba.
   - Estilo: maqueta arquitectónica isométrica mate, base papel, acentos cobalto, sin personajes. Es el mismo lenguaje que los posters SVG de muestra.
   - Paleta (tokens `tokens/cifra.tokens.css`): Cobalto `#1550E0`, Papel `#F1F3FB`, Tinta `#101425`, Grafito `#646B85`. Fondo de escena: Papel. No usar naranja ni colores de señal.
   - Cámara: "Fly through the world" (arquitectura B, inmersiones + conectores aéreos) o "Locked isometric glide" (A, más calmado y barato de repetir). Recomendado para esta marca sobria: locked isometric.
   - Prompts: siempre "no text, no letters, no numbers, no logos" (la marca no puede mostrar cifras ni logos inventados). El logo real solo se importa de `assets/`.
   - Composición: el motor corre el diorama unos 7vw a la derecha para dejar el texto a la izquierda. Pedir el diorama centrado-derecha (centro cerca del 58% del ancho).
4. Colocar la salida con los nombres de arriba (la skill genera `assets/vid/<nombre>.mp4`, `connN.mp4`, `-m.mp4`; renombrar a la convención de esta landing) y volver a desplegar.
5. No usar el motor `scrub-engine.js` original ni su `index-template.html`: aquí ya está adaptado (`ScrollFlight.tsx`).

### Revisión de seguridad hecha a la skill

Se leyeron completos `SKILL.md`, `prompts.md`, `pipeline.md`, `scrub-engine.js`, `index-template.html`, `knockout.py`, `plugin.json` y `marketplace.json`, y se buscaron caracteres Unicode ocultos (ninguno). El motor JS solo hace `fetch` de las URLs de clips que se le configuran y usa `innerHTML` con texto escapado; no hay `eval`, cookies, almacenamiento ni red hacia terceros. `knockout.py` solo procesa imágenes con PIL. Los scripts de `pipeline.md` ejecutan los CLI de Monid/Higgsfield/Codex/ffmpeg (suben fotogramas a un espacio de archivos de Monid mediante URL firmada; es el comportamiento documentado). Nada sospechoso. El riesgo operativo real es de dinero (clips de pago), no de código.

## Costos aproximados (ESTIMADOS, NO VERIFICADOS)

Cifras tomadas de la documentación de la skill (medidas por su autor en julio de 2026, hoy es octubre de 2026). No se consultó ningún precio real ni se tocó ninguna cuenta. El precio de Higgsfield no lo expone su CLI.

Cadena de 6 escenas = 6 inmersiones (8 s) + 5 conectores (5 s) = 11 clips. Monid (Seedance 2.0), por clip según la skill:

| Resolución | Inmersión | Conector | Cadena desktop | Con ~15% de repeticiones | Desktop + móvil 9:16 (x2) |
|---|---|---|---|---|---|
| 480p (previsualización) | ~US$0.28 | ~US$0.35 | ~US$3.4 | ~US$4 | ~US$8 |
| 720p | ~US$1.21 | ~US$0.76 | ~US$11 | ~US$13 | ~US$25 |
| 1080p | ~US$2.99 | ~US$1.87 | ~US$27 | ~US$31 | ~US$63 |

Imágenes fijas (6): Higgsfield `gpt_image_2`, la skill observó ~15 créditos cada una en un plan Plus (~90 créditos); o con Codex CLI, sin créditos pero con límites de uso de la suscripción de ChatGPT. La alternativa de pagar los videos con créditos de Higgsfield tampoco está verificada.

Cómo verificarlo antes de gastar:
- `monid balance` y `monid inspect` del endpoint de Seedance (la skill indica que el catálogo cambia).
- Una sola prueba de 480p (~US$0.28) para confirmar que el cobro por clip coincide.
- Para Higgsfield: comparar `higgsfield workspace list` antes y después de una imagen y un video, y extrapolar.

Recomendación de la propia skill: hacer toda la cadena en 480p como previsualización, aprobar el recorrido y volver a renderizar en 720p o 1080p.

## Credenciales y variables de entorno

- La skill **no documenta nombres de variables de entorno**. Monid se autentica con una llave de API que administra su CLI (`monid keys list`) y Higgsfield con `higgsfield auth login` (OAuth interactivo). Ninguna credencial pertenece a este repo ni se guarda en él.
- Variable propia de la landing (la única):
  - `NEXT_PUBLIC_LANDING_DEMO_EMAIL`: correo al que apunta "Solicitar demo" (`mailto:`). Sin ella se muestra un marcador visible en el bloque `#demo`. Definirla en Vercel (Production y Preview) y volver a desplegar, porque es `NEXT_PUBLIC_` y se incrusta en el build.

## Activar, desactivar o mover la ruta

- Está activa en `/landing`. `/` sigue igual (redirige a `/dashboard` o `/login`, `src/app/page.tsx`).
- Desactivar: borrar `src/app/landing/` (los componentes en `src/components/landing/` quedan sin usar), o hacer que `page.tsx` llame a `notFound()`.
- Hacerla la portada de `app.cfocifra.com`: en `src/app/page.tsx` habría que conservar la redirección de quienes ya tienen sesión. Es una decisión de producto; no se cambió. Otra opción es publicarla en el dominio de marketing y dejar la app en `app.`.

## Marca y accesibilidad aplicadas

- Solo variables `--cifra-*` (cero hexadecimales en el código), modo oscuro vía los tokens; lockup importado de `/assets/`, nunca redibujado; sin colores de señal.
- Manrope 800 con `-0.045em` en titulares; cifras de muestra (`$X`, `N`) con Azeret Mono y `.cifra-num`.
- Los posters de muestra no tienen cifras reales y la página lo dice ("Ilustración de muestra").
- Foco visible, enlace "Saltar al contenido", todo el texto está en el DOM (no depende del video), los enlaces de escenas ocultas no reciben foco, y hay "Ver sin animaciones".

## Pendiente para producción

1. Decidir presupuesto, herramienta (Monid o Higgsfield) y si habrá versión móvil 9:16 nativa (duplica el costo de video).
2. Generar y revisar los videos (costura entre escenas, cuadro por cuadro).
3. Cómo servir los videos: git no es apto (pesados). Opciones: Vercel Blob o un bucket con CDN y un manifiesto remoto (hoy el manifiesto solo lee `public/`; habría que ampliarlo y permitir CORS porque el motor baja los clips con `fetch`).
4. Definir el correo (o formulario) de "Solicitar demo" y la variable `NEXT_PUBLIC_LANDING_DEMO_EMAIL`.
5. Aviso de privacidad y términos en el pie (no existen en el repo; no se inventaron enlaces).
6. Revisar copy final con el dueño, `metadataBase`/canonical/imagen social cuando se defina el dominio de marketing, y medir peso real (los videos de 1080p pesan varios MB cada uno).
7. Prueba en un iPhone real si se activa el vuelo en móvil (la skill advierte de comportamientos de iOS que aquí solo se pudieron emular).
