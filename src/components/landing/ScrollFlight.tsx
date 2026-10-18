"use client";

import { useLocale } from "@/context/LocaleContext";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScenePoster, SceneText, Topbar, useSceneCopy } from "./shared";
import { SCENE_IDS, type LandingManifest, type SceneId } from "./types";

/**
 * Motor "scroll-world": el scroll maneja el tiempo de una cadena de videos (inmersiones por escena
 * y conectores entre escenas) como un solo vuelo de camara continuo.
 *
 * Adaptado de la referencia vanilla de la skill scroll-world (scrub-engine.js) a React: el DOM lo
 * pinta React y las actualizaciones por frame se hacen de forma imperativa (refs) para no
 * re-renderizar en cada scroll. Cambios respecto a la referencia:
 *  - sin innerHTML ni CSS inyectado (todo en landing.css con tokens de marca);
 *  - la escena queda "pegada" (sticky) dentro de su contenedor, asi el resto de la pagina
 *    (como funciona, demo, pie) sigue despues del vuelo;
 *  - limpieza completa: listeners, rAF, fetch en curso y blob URLs;
 *  - sin particulas ni movimiento propio cuando hay prefers-reduced-motion (ese caso ni siquiera
 *    monta este componente: ver LandingPage).
 */

const DIVE_SCROLL = 1.2; // alturas de pantalla de scroll por clip de inmersion
const CONN_SCROLL = 0.9; // idem por conector
const CROSSFADE = 0.12; // ancho de la disolvencia entre segmentos (en alturas de pantalla)
const DESKTOP_SHIFT_VW = 7; // el diorama se corre a la derecha para dejar sitio al texto

/** Ritmo por escena: mas scroll = mas tiempo en la escena; linger = la camara se asienta mientras se lee. */
const PACING: Partial<Record<SceneId, { scroll: number; linger: number }>> = {
  torre: { scroll: 1.5, linger: 0.35 },
  mundo: { scroll: 1.6, linger: 0.3 },
};

/** Escenas que aparecen en la barra de navegacion (los modulos). */
const NAV_SCENES: SceneId[] = ["resultados", "caja", "cobranza", "salud"];

type Segment = {
  kind: "dive" | "conn";
  /** indice de la escena de la que parte el segmento */
  si: number;
  posterId: SceneId;
  clip: string | null;
  clipM: string | null;
  w: number;
  linger: number;
};

function buildSegments(manifest: LandingManifest): Segment[] {
  const segs: Segment[] = [];
  SCENE_IDS.forEach((id, i) => {
    const pace = PACING[id];
    segs.push({
      kind: "dive",
      si: i,
      posterId: id,
      clip: manifest.scenes[id].clip ?? null,
      clipM: manifest.scenes[id].clipMobile ?? null,
      w: pace?.scroll ?? DIVE_SCROLL,
      linger: pace?.linger ?? 0,
    });
    const conn = manifest.connectors[i];
    // El conector es opcional: sin archivo, las dos inmersiones se disuelven directo.
    if (i < SCENE_IDS.length - 1 && conn) {
      segs.push({
        kind: "conn",
        si: i,
        posterId: SCENE_IDS[i + 1],
        clip: conn,
        clipM: manifest.connectorsMobile[i] ?? null,
        w: CONN_SCROLL,
        linger: 0,
      });
    }
  });
  return segs;
}

type VideoEvents = {
  meta: (i: number) => void;
  seeked: (i: number) => void;
  loaded: (i: number) => void;
};

export function ScrollFlight({
  manifest,
  onExit,
  children,
}: {
  manifest: LandingManifest;
  /** Cambia a la version estatica (enlace "Ver sin animaciones"). */
  onExit: () => void;
  /** Contenido que sigue despues del vuelo (como funciona, demo). */
  children: ReactNode;
}) {
  const { t } = useLocale();
  const copies = useSceneCopy(SCENE_IDS);
  const total = SCENE_IDS.length;
  const segments = useMemo(() => buildSegments(manifest), [manifest]);
  const segKey = segments.map((s) => `${s.kind}${s.si}:${s.clip ?? ""}:${s.clipM ?? ""}:${s.w}:${s.linger}`).join("|");
  const segsRef = useRef(segments);
  segsRef.current = segments;

  const rootRef = useRef<HTMLDivElement>(null);
  const sceneEls = useRef<(HTMLDivElement | null)[]>([]);
  const posterEls = useRef<(HTMLDivElement | null)[]>([]);
  const videoEls = useRef<(HTMLVideoElement | null)[]>([]);
  const copyEls = useRef<(HTMLElement | null)[]>([]);
  const fillRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<(i: number) => void>(() => {});
  const eventsRef = useRef<VideoEvents>({ meta: () => {}, seeked: () => {}, loaded: () => {} });

  const [active, setActive] = useState(0);
  const [videoUrls, setVideoUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const segs = segsRef.current;
    const nseg = segs.length;

    const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const smallMQ = window.matchMedia("(max-width: 860px)");
    const isMobile = () => coarse || smallMQ.matches;

    type State = {
      start: number;
      end: number;
      loading: boolean;
      failed: boolean;
      ready: boolean;
      hasClip: boolean;
      cur: number;
      target: number;
      visible: boolean;
    };
    const st: State[] = segs.map(() => ({
      start: 0,
      end: 0,
      loading: false,
      failed: false,
      ready: false,
      hasClip: false,
      cur: 0,
      target: 0,
      visible: false,
    }));

    let vh = window.innerHeight;
    let laidOutW = window.innerWidth;
    let totalW = 0;
    let activeIdx = -1;
    let userReady = false;
    let disposed = false;
    let rafId = 0;
    let readId = 0;
    let readPending = false;
    const aborts: AbortController[] = [];
    const blobUrls: string[] = [];

    const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const smooth = (x: number) => {
      const c = clamp(x);
      return c * c * (3 - 2 * c);
    };
    // Remapeo monotono scroll->tiempo: la camara se asienta a media escena (donde el texto esta
    // en su punto) y acelera hacia los empalmes. f(0)=0 y f(1)=1, asi que los empalmes no cambian.
    const lingerEase = (x: number, l: number) => {
      const L = clamp(l);
      const c = x - 0.5;
      return (1 - L) * x + L * (4 * c * c * c + 0.5);
    };

    function layout() {
      vh = window.innerHeight;
      laidOutW = window.innerWidth;
      let off = 0;
      segs.forEach((s, i) => {
        st[i].start = off * vh;
        off += s.w;
        st[i].end = off * vh;
      });
      totalW = off;
      // +1 pantalla para que el ultimo vuelo se complete antes de soltar la escena.
      root!.style.height = `${totalW * vh + vh}px`;
      read();
    }

    function loadClip(i: number) {
      const a = st[i];
      const s = segs[i];
      if (a.loading || a.failed) return;
      const url = isMobile() && s.clipM ? s.clipM : s.clip;
      if (!url) return;
      a.loading = true;
      const ac = new AbortController();
      aborts.push(ac);
      // Se baja como Blob y se reproduce desde memoria: siempre es "seekable", aunque el
      // servidor no soporte rangos HTTP.
      fetch(url, { signal: ac.signal })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`http ${r.status}`))))
        .then((blob) => {
          if (disposed) return;
          const objectUrl = URL.createObjectURL(blob);
          blobUrls.push(objectUrl);
          a.hasClip = true;
          setVideoUrls((prev) => ({ ...prev, [i]: objectUrl }));
        })
        .catch(() => {
          a.loading = false;
          a.failed = true; // no reintentar en cada scroll
        });
    }

    function read() {
      readPending = false;
      if (disposed) return;
      const y = -root!.getBoundingClientRect().top;
      const fade = CROSSFADE * vh;
      const desktop = window.innerWidth > 860;
      let ci = 0;
      for (let i = 0; i < nseg; i += 1) if (y >= st[i].start) ci = i;

      for (let i = 0; i < nseg; i += 1) {
        const a = st[i];
        if (y > a.start - 1.6 * vh && y < a.end + 1.6 * vh) loadClip(i);
        const local = clamp((y - a.start) / (a.end - a.start), 0, 1);
        a.target = segs[i].linger ? lingerEase(local, segs[i].linger) : local;
        let outside = 0;
        // La primera escena no se desvanece antes de empezar ni la ultima despues de terminar:
        // la ultima se queda a la vista mientras la pagina suelta la escena fijada.
        if (y < a.start) outside = i === 0 ? 0 : a.start - y;
        else if (y > a.end) outside = i === nseg - 1 ? 0 : y - a.end;
        const op = smooth(1 - outside / fade);
        const scene = sceneEls.current[i];
        if (scene) {
          scene.style.opacity = String(op);
          scene.style.zIndex = i === ci ? "120" : String(100 + Math.round(op * 10));
        }
        a.visible = op > 0.001;
        const poster = posterEls.current[i];
        if (poster && (!a.hasClip || !a.ready)) {
          const sc = 1.02 + local * 0.08;
          poster.style.transform = `translateX(${desktop ? DESKTOP_SHIFT_VW : 0}vw) scale(${sc.toFixed(3)})`;
        }
      }

      for (let i = 0; i < total; i += 1) {
        const diveIdx = segs.findIndex((s) => s.kind === "dive" && s.si === i);
        const a = st[diveIdx];
        const pr = clamp((y - a.start) / (a.end - a.start), 0, 1);
        const before = y < a.start;
        const after = y > a.end;
        let cop: number;
        if (i === 0) cop = after ? 0 : smooth(1 - pr / 0.62); // saluda al llegar
        else if (i === total - 1) cop = before ? 0 : smooth(pr / 0.4); // sostiene el CTA al final
        else cop = before || after ? 0 : smooth(1 - Math.abs(pr - 0.5) / 0.5);
        const c = copyEls.current[i];
        if (!c) continue;
        const on = cop > 0.5;
        c.style.opacity = String(cop);
        c.style.transform = desktop ? `translateY(calc(-50% + ${((0.5 - pr) * 4).toFixed(2)}vh))` : "none";
        c.style.pointerEvents = on ? "auto" : "none";
        // Los enlaces de una escena oculta no deben recibir foco por teclado.
        if (c.dataset.on !== String(on)) {
          c.dataset.on = String(on);
          c.querySelectorAll<HTMLElement>("a, button").forEach((f) => {
            if (on) f.removeAttribute("tabindex");
            else f.setAttribute("tabindex", "-1");
          });
        }
      }

      const cur = segs[ci];
      const frac = (y - st[ci].start) / (st[ci].end - st[ci].start);
      const near = clamp(cur.kind === "dive" ? cur.si : frac > 0.5 ? cur.si + 1 : cur.si, 0, total - 1);
      if (near !== activeIdx) {
        activeIdx = near;
        setActive(near);
      }
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${clamp(y / (totalW * vh))})`;
      if (hintRef.current) hintRef.current.style.opacity = String(clamp(1 - y / (0.5 * vh)));
    }

    function tick() {
      if (disposed) return;
      const eps = isMobile() ? 0.02 : 0.008; // paso de busqueda mas grueso en telefonos
      for (let i = 0; i < nseg; i += 1) {
        const a = st[i];
        const v = videoEls.current[i];
        if (!a.hasClip || !a.ready || !v) continue;
        // Nunca encolar una busqueda mientras el decodificador resuelve la anterior.
        if (v.seeking) continue;
        if (!a.visible && Math.abs(a.cur - a.target) < 0.002) continue;
        a.cur += (a.target - a.cur) * 0.18;
        const t0 = clamp(a.cur, 0, 0.999) * (v.duration || 1);
        if (Math.abs(v.currentTime - t0) > eps) {
          try {
            v.currentTime = t0;
          } catch {
            /* el video aun no admite busquedas */
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    // iOS necesita un gesto antes de pintar un video mudo: se "primea" con play->pause.
    function prime(v: HTMLVideoElement | null) {
      if (!isMobile() || !v) return;
      try {
        const p = v.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            try {
              v.pause();
            } catch {
              /* noop */
            }
          }).catch(() => {});
        }
      } catch {
        /* noop */
      }
    }
    function onFirstGesture() {
      if (userReady) return;
      userReady = true;
      videoEls.current.forEach((v) => prime(v));
    }

    eventsRef.current = {
      meta: (i) => {
        st[i].ready = true;
        read();
      },
      // Se revela el video (y se oculta el poster) hasta que ya pinto un frame real.
      seeked: (i) => sceneEls.current[i]?.classList.add("has-clip"),
      loaded: (i) => {
        const v = videoEls.current[i];
        try {
          v?.pause();
        } catch {
          /* noop */
        }
        if (userReady) prime(v);
      },
    };

    jumpRef.current = (i) => {
      const diveIdx = segs.findIndex((s) => s.kind === "dive" && s.si === i);
      if (diveIdx < 0) return;
      const frac = i === 0 ? 0 : i === total - 1 ? 0.6 : 0.5;
      const rootTop = root!.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: rootTop + st[diveIdx].start + (st[diveIdx].end - st[diveIdx].start) * frac, behavior: "smooth" });
    };

    function onScroll() {
      if (readPending) return;
      readPending = true;
      readId = requestAnimationFrame(read);
    }
    // En tactil el `resize` se dispara al mostrar/ocultar la barra de URL: solo se recalcula si
    // cambio el ancho (la rotacion llega por orientationchange).
    function onResize() {
      if (coarse && window.innerWidth === laidOutW) return;
      layout();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", layout);
    window.addEventListener("load", layout);
    window.addEventListener("pointerdown", onFirstGesture, { once: true, passive: true });
    window.addEventListener("touchstart", onFirstGesture, { once: true, passive: true });
    layout();
    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(readId);
      aborts.forEach((ac) => ac.abort());
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", layout);
      window.removeEventListener("load", layout);
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      setVideoUrls({});
    };
  }, [segKey, total]);

  const nav = (
    <nav className="lp-nav" aria-label={t("landing.nav.label")}>
      {NAV_SCENES.map((id) => {
        const i = SCENE_IDS.indexOf(id);
        return (
          <button
            key={id}
            type="button"
            className={`lp-nav__item${active === i ? " is-active" : ""}`}
            aria-current={active === i ? "true" : undefined}
            onClick={() => jumpRef.current(i)}
          >
            {copies[i].label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <Topbar nav={nav} />
      <main id="contenido">
        <div className="lp-flight" ref={rootRef}>
          <div className="lp-pin">
            <div className="lp-sky" aria-hidden="true" />
            <div className="lp-progress" aria-hidden="true">
              <span ref={fillRef} />
            </div>
            <div className="lp-stage" aria-hidden="true">
              {segments.map((s, i) => (
                <div
                  className="lp-scene"
                  key={`${s.kind}-${s.si}`}
                  ref={(el) => {
                    sceneEls.current[i] = el;
                  }}
                >
                  <div
                    className="lp-poster"
                    ref={(el) => {
                      posterEls.current[i] = el;
                    }}
                  >
                    <ScenePoster id={s.posterId} assets={manifest.scenes[s.posterId]} />
                  </div>
                  {videoUrls[i] ? (
                    <video
                      className="lp-scene__video"
                      src={videoUrls[i]}
                      muted
                      playsInline
                      preload="auto"
                      tabIndex={-1}
                      ref={(el) => {
                        if (el) el.muted = true;
                        videoEls.current[i] = el;
                      }}
                      onLoadedMetadata={() => eventsRef.current.meta(i)}
                      onSeeked={() => eventsRef.current.seeked(i)}
                      onLoadedData={() => eventsRef.current.loaded(i)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="lp-copylayer">
              {copies.map((c, i) => (
                <article
                  className="lp-copy"
                  key={c.id}
                  id={c.id}
                  ref={(el) => {
                    copyEls.current[i] = el;
                  }}
                >
                  <SceneText copy={c} index={i} total={total} headingLevel={i === 0 ? 1 : 2} withCta={i === total - 1} />
                </article>
              ))}
            </div>
            <ul className="lp-route" aria-label={t("landing.nav.label")}>
              {copies.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="lp-route__dot"
                    aria-label={`${c.label}. ${t("landing.nav.sceneOf", { n: i + 1, total })}`}
                    aria-current={active === i ? "true" : undefined}
                    onClick={() => jumpRef.current(i)}
                  >
                    <span className="lp-route__label">{c.label}</span>
                    <i />
                  </button>
                </li>
              ))}
            </ul>
            <div className="lp-hint" ref={hintRef} aria-hidden="true">
              <span>{t("landing.hint")}</span>
              <i />
            </div>
            <button type="button" className="lp-static-toggle" onClick={onExit}>
              {t("landing.staticToggle")}
            </button>
          </div>
        </div>
        {children}
      </main>
    </>
  );
}
