/**
 * Tipos y constantes compartidas de la landing "scroll-world".
 * Los ids de escena coinciden con los nombres de archivo de los assets
 * (ver docs/landing-scroll-world.md).
 */

export const SCENE_IDS = ["torre", "resultados", "caja", "cobranza", "salud", "mundo"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/** Carpeta publica donde se dejan los assets generados (videos y posters). */
export const ASSET_BASE = "/scroll-world";

export type SceneAssets = {
  /** Poster real (webp) que reemplaza al SVG de muestra. */
  poster?: string;
  posterMobile?: string;
  /** Clip de la "inmersion" en la escena (video mp4 escrutable por scroll). */
  clip?: string;
  clipMobile?: string;
};

export type LandingManifest = {
  scenes: Record<SceneId, SceneAssets>;
  /** Conector i entre la escena i y la i+1 (length = escenas - 1). null = no existe. */
  connectors: (string | null)[];
  connectorsMobile: (string | null)[];
  /** true cuando existe al menos un clip: solo entonces se activa el vuelo por defecto. */
  hasClips: boolean;
};

export type PosterLabels = {
  confirmed: string;
  estimated: string;
  missing: string;
  months: string;
};
