import { existsSync } from "node:fs";
import path from "node:path";
import { ASSET_BASE, SCENE_IDS, type LandingManifest, type SceneAssets, type SceneId } from "./types";

/**
 * Revisa que archivos existen en `public/scroll-world/` y arma el manifiesto de la landing.
 * Se ejecuta en el servidor (en build para la pagina estatica): si no hay videos, la landing
 * muestra la version estatica con posters de muestra; cuando se agregan los archivos y se
 * vuelve a desplegar, el vuelo por scroll se activa solo.
 *
 * Convencion de nombres (una por escena, en el orden de SCENE_IDS):
 *   posters/<id>.webp          posters/<id>-m.webp
 *   video/<id>.mp4             video/<id>-m.mp4
 *   video/conn<i>.mp4          video/conn<i>-m.mp4        (i = 1..escenas-1)
 */
const PUBLIC_DIR = path.join(process.cwd(), "public", "scroll-world");

function has(rel: string): string | undefined {
  return existsSync(path.join(PUBLIC_DIR, rel)) ? `${ASSET_BASE}/${rel}` : undefined;
}

export function loadLandingManifest(): LandingManifest {
  const scenes = {} as Record<SceneId, SceneAssets>;
  for (const id of SCENE_IDS) {
    scenes[id] = {
      poster: has(`posters/${id}.webp`),
      posterMobile: has(`posters/${id}-m.webp`),
      clip: has(`video/${id}.mp4`),
      clipMobile: has(`video/${id}-m.mp4`),
    };
  }
  const connectors: (string | null)[] = [];
  const connectorsMobile: (string | null)[] = [];
  for (let i = 1; i < SCENE_IDS.length; i += 1) {
    connectors.push(has(`video/conn${i}.mp4`) ?? null);
    connectorsMobile.push(has(`video/conn${i}-m.mp4`) ?? null);
  }
  const hasClips = SCENE_IDS.some((id) => Boolean(scenes[id].clip));
  return { scenes, connectors, connectorsMobile, hasClips };
}
