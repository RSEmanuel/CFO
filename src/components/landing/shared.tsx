"use client";

import { useLocale } from "@/context/LocaleContext";
import type { ReactNode } from "react";
import { PosterArt } from "./posters";
import type { PosterLabels, SceneAssets, SceneId } from "./types";

/** Destinos de los CTA. La app vive en https://app.cfocifra.com; aqui son rutas relativas. */
export const LOGIN_HREF = "/login";
export const DEMO_ANCHOR = "#demo";

const SCENE_TAGS = ["tagA", "tagB"] as const;
/** La escena final lleva CTA en lugar de etiquetas. */
const SCENES_WITHOUT_TAGS: ReadonlySet<SceneId> = new Set<SceneId>(["mundo"]);

export type SceneCopy = {
  id: SceneId;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
};

/** Copy de cada escena, tomado de landing.scenes.<id> en src/i18n/messages. */
export function useSceneCopy(ids: readonly SceneId[]): SceneCopy[] {
  const { t } = useLocale();
  return ids.map((id) => ({
    id,
    label: t(`landing.scenes.${id}.label`),
    eyebrow: t(`landing.scenes.${id}.eyebrow`),
    title: t(`landing.scenes.${id}.title`),
    body: t(`landing.scenes.${id}.body`),
    tags: SCENES_WITHOUT_TAGS.has(id) ? [] : SCENE_TAGS.map((tag) => t(`landing.scenes.${id}.${tag}`)),
  }));
}

export function usePosterLabels(): PosterLabels {
  const { t } = useLocale();
  return {
    confirmed: t("landing.poster.confirmed"),
    estimated: t("landing.poster.estimated"),
    missing: t("landing.poster.missing"),
    months: t("landing.poster.months"),
  };
}

/** Lockup oficial importado de /assets (nunca redibujado). El oscuro se activa con los tokens. */
export function Logo() {
  return (
    <a href="/landing" className="lp-brand" aria-label="Cifra">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/cifra-lockup.svg" alt="Cifra" className="lp-logo lp-logo--light" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/cifra-lockup-dark.svg" alt="" aria-hidden="true" className="lp-logo lp-logo--dark" />
    </a>
  );
}

export function Topbar({ nav }: { nav?: ReactNode }) {
  const { t } = useLocale();
  return (
    <header className="lp-topbar">
      <Logo />
      {nav}
      <div className="lp-actions">
        <a className="lp-btn lp-btn--ghost lp-btn--sm" href={LOGIN_HREF}>
          {t("landing.header.login")}
        </a>
        <a className="lp-btn lp-btn--primary lp-btn--sm" href={DEMO_ANCHOR}>
          {t("landing.header.demo")}
        </a>
      </div>
    </header>
  );
}

/** Poster de una escena: la imagen real si existe, o el diorama SVG de muestra. */
export function ScenePoster({ id, assets }: { id: SceneId; assets: SceneAssets }) {
  const labels = usePosterLabels();
  if (assets.poster) {
    return (
      <picture>
        {assets.posterMobile ? <source media="(max-width: 860px)" srcSet={assets.posterMobile} /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lp-poster-img" src={assets.poster} alt="" decoding="async" />
      </picture>
    );
  }
  return <PosterArt id={id} labels={labels} />;
}

export function CtaButtons() {
  const { t } = useLocale();
  return (
    <>
      <a className="lp-btn lp-btn--primary" href={LOGIN_HREF}>
        {t("landing.scenes.mundo.primary")}
      </a>
      <a className="lp-btn lp-btn--ghost" href={DEMO_ANCHOR}>
        {t("landing.scenes.mundo.secondary")}
      </a>
    </>
  );
}

export function SceneText({
  copy,
  index,
  total,
  headingLevel,
  withCta,
}: {
  copy: SceneCopy;
  index: number;
  total: number;
  headingLevel: 1 | 2;
  withCta: boolean;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <>
      <span className="lp-copy__num cifra-num" aria-hidden="true">
        {pad(index + 1)} / {pad(total)}
      </span>
      <span className="lp-copy__eyebrow">{copy.eyebrow}</span>
      <Heading className="lp-copy__title" id={`${copy.id}-titulo`}>{copy.title}</Heading>
      <p className="lp-copy__body">{copy.body}</p>
      {copy.tags.length > 0 ? (
        <ul className="lp-copy__tags">
          {copy.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
      {withCta ? (
        <div className="lp-copy__cta">
          <CtaButtons />
        </div>
      ) : null}
    </>
  );
}

export function HowItWorks() {
  const { t } = useLocale();
  const steps = ["one", "two", "three"] as const;
  return (
    <section className="lp-how" id="como-funciona" aria-labelledby="como-funciona-titulo">
      <span className="lp-copy__eyebrow">{t("landing.how.eyebrow")}</span>
      <h2 className="lp-copy__title" id="como-funciona-titulo">
        {t("landing.how.title")}
      </h2>
      <p className="lp-copy__body">{t("landing.how.lede")}</p>
      <ol className="lp-how__steps">
        {steps.map((step, i) => (
          <li className="lp-step" key={step}>
            <span className="lp-step__n cifra-num">0{i + 1}</span>
            <h3 className="lp-step__title">{t(`landing.how.${step}.title`)}</h3>
            <p className="lp-step__body">{t(`landing.how.${step}.body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Texto visible cuando aun no hay correo de contacto confirmado. Se reemplaza al definir la variable. */
const DEMO_EMAIL_PENDING = "[Correo de contacto por definir: configura NEXT_PUBLIC_LANDING_DEMO_EMAIL]";

export function DemoBlock({ demoEmail }: { demoEmail?: string }) {
  const { t } = useLocale();
  const href = demoEmail
    ? `mailto:${demoEmail}?subject=${encodeURIComponent(t("landing.demo.subject"))}`
    : undefined;
  return (
    <section className="lp-demo" id="demo" aria-labelledby="demo-titulo">
      <div className="lp-demo__box">
        <span className="lp-copy__eyebrow">{t("landing.demo.eyebrow")}</span>
        <h2 className="lp-copy__title" id="demo-titulo">
          {t("landing.demo.title")}
        </h2>
        <p className="lp-copy__body">{t("landing.demo.body")}</p>
        {href ? (
          <div className="lp-copy__cta">
            <a className="lp-btn lp-btn--primary" href={href}>
              {t("landing.demo.button")}
            </a>
          </div>
        ) : (
          <p className="lp-demo__pending" role="note">
            {DEMO_EMAIL_PENDING}
          </p>
        )}
        <a className="lp-demo__login" href={LOGIN_HREF}>
          {t("landing.demo.login")}
        </a>
      </div>
    </section>
  );
}

export function Footer() {
  const { t } = useLocale();
  return (
    <footer className="lp-footer">
      <span>Cifra · {t("landing.footer.tagline")}</span>
      <span>{t("landing.footer.endorsement")}</span>
    </footer>
  );
}
