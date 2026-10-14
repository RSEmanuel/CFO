"use client";

import { useLocale } from "@/context/LocaleContext";
import type { ReactNode } from "react";
import { ScenePoster, SceneText, Topbar, useSceneCopy } from "./shared";
import { SCENE_IDS, type LandingManifest, type SceneId } from "./types";

const NAV_SCENES: SceneId[] = ["resultados", "caja", "cobranza", "salud"];

/**
 * Version estatica de la landing: las mismas escenas, el mismo copy y los mismos CTA en un flujo
 * normal de pagina. Se usa con prefers-reduced-motion, cuando faltan los videos, antes de que cargue
 * JavaScript (HTML del servidor) y cuando la persona elige "Ver sin animaciones".
 */
export function StaticScenes({ manifest, children }: { manifest: LandingManifest; children: ReactNode }) {
  const { t } = useLocale();
  const copies = useSceneCopy(SCENE_IDS);
  const total = SCENE_IDS.length;

  const nav = (
    <nav className="lp-nav" aria-label={t("landing.nav.label")}>
      {NAV_SCENES.map((id) => (
        <a key={id} className="lp-nav__item" href={`#${id}`}>
          {copies[SCENE_IDS.indexOf(id)].label}
        </a>
      ))}
    </nav>
  );

  return (
    <>
      <Topbar nav={nav} />
      <main id="contenido">
        {copies.map((c, i) => {
          const assets = manifest.scenes[c.id];
          return (
            <section
              key={c.id}
              id={c.id}
              className={`lp-section${i === 0 ? " lp-section--first" : ""}`}
              aria-labelledby={`${c.id}-titulo`}
            >
              <div>
                <SceneText
                  copy={c}
                  index={i}
                  total={total}
                  headingLevel={i === 0 ? 1 : 2}
                  withCta={i === total - 1}
                />
              </div>
              <div>
                <div className="lp-frame">
                  <div className="lp-poster">
                    <ScenePoster id={c.id} assets={assets} />
                  </div>
                </div>
                {assets.poster ? null : <p className="lp-sample">{t("landing.sampleNote")}</p>}
              </div>
            </section>
          );
        })}
        {children}
      </main>
    </>
  );
}
