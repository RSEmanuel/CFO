"use client";

import { useEffect, useState } from "react";
import "./landing.css";
import { ScrollFlight } from "./ScrollFlight";
import { DemoBlock, Footer, HowItWorks } from "./shared";
import { StaticScenes } from "./StaticScenes";
import type { LandingManifest } from "./types";
import { useLocale } from "@/context/LocaleContext";

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduce(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

/**
 * Landing de marketing. El HTML del servidor es siempre la version estatica (indexable, sin JS);
 * al hidratar se pasa al vuelo por scroll solo si:
 *  - la persona no pidio menos movimiento (prefers-reduced-motion) ni eligio "Ver sin animaciones";
 *  - existen los videos generados (manifiesto), o se fuerza la vista previa con ?vuelo=1.
 * ?vuelo=0 fuerza la version estatica.
 */
export function LandingPage({ manifest, demoEmail }: { manifest: LandingManifest; demoEmail?: string }) {
  const { t } = useLocale();
  const reduce = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [optOut, setOptOut] = useState(false);
  const [preview, setPreview] = useState<"on" | "off" | null>(null);

  useEffect(() => {
    setMounted(true);
    const flag = new URLSearchParams(window.location.search).get("vuelo");
    setPreview(flag === "1" ? "on" : flag === "0" ? "off" : null);
  }, []);

  const flight =
    mounted && !reduce && !optOut && preview !== "off" && (manifest.hasClips || preview === "on");

  const tail = (
    <>
      <HowItWorks />
      <DemoBlock demoEmail={demoEmail} />
    </>
  );

  return (
    <div className="lp-root">
      <a className="lp-skip" href="#contenido">
        {t("landing.skip")}
      </a>
      {flight ? (
        <ScrollFlight
          manifest={manifest}
          onExit={() => {
            setOptOut(true);
            window.scrollTo(0, 0);
          }}
        >
          {tail}
        </ScrollFlight>
      ) : (
        <StaticScenes manifest={manifest}>{tail}</StaticScenes>
      )}
      <Footer />
    </div>
  );
}
