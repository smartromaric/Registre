"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { FicheStage, type StageHandle } from "@/components/hero/FicheStage";
import { CtaButton } from "@/components/ui/CtaButton";
import { HERO_SCROLL_VH, PHASE_ORDER, currentPhase, type PhaseName } from "@/lib/config";
import { content } from "@/lib/content";
import { expose } from "@/lib/debug";
import { scrollState, triggers } from "@/lib/scroll-state";
import { typo } from "@/lib/typography";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { appUrl } from "@/lib/urls";

/**
 * L'UNIQUE boucle de rendu — playbook §3, « un seul écrivain ».
 *
 * Aucune autre partie du site ne touche à la fiche. Cette boucle lit la
 * progression publiée dans `triggers.hero` et appelle `stage.render()` une fois
 * par frame. Deux animations ne peuvent donc jamais se disputer le même objet.
 *
 * Et surtout : on **lit** `.progress`, on ne s'abonne pas à `onUpdate`. Ce dernier
 * ne se déclenche que tant que le déclencheur est actif — arriver directement sur
 * `#tarifs` par une ancre laisserait la fiche figée dans son état d'initialisation.
 */

/** État figé retenu en mouvement réduit : la fiche écrite, l'alerte partie. */
const REDUCED_PROGRESS = 0.68;

export function Hero() {
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<StageHandle>(null);
  const [phase, setPhase] = useState<PhaseName>(PHASE_ORDER[0]);
  /** Dernière phase peinte — évite un rendu React à chaque frame. */
  const lastPhase = useRef<PhaseName>(PHASE_ORDER[0]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (reduced) {
      scrollState.hero = REDUCED_PROGRESS;
      stage.render(REDUCED_PROGRESS);
      expose("heroProgress", REDUCED_PROGRESS);
      expose("reducedMotion", true);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const section = sectionRef.current;
    if (!section) return;

    // Le déclencheur ne fait que *mesurer*. Il n'anime rien et n'épingle rien :
    // l'épinglage visuel est un `position: sticky`, plus simple et sans
    // pin-spacer à gérer. Il est publié pour que la boucle puisse le lire.
    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
    });
    triggers.hero = trigger;

    const tick = () => {
      const p = trigger.progress;
      scrollState.hero = p;
      stage.render(p);
      expose("heroProgress", p);

      const next = currentPhase(p);
      if (next !== lastPhase.current) {
        lastPhase.current = next;
        setPhase(next);
        expose("heroPhase", next);
      }
    };

    gsap.ticker.add(tick);
    // Une première peinture immédiate : sans elle, un rechargement en plein
    // milieu de la page afficherait la fiche à l'état zéro jusqu'au premier frame.
    tick();

    return () => {
      gsap.ticker.remove(tick);
      trigger.kill();
      triggers.hero = null;
    };
  }, [reduced]);

  const caption = content.hero.phases[phase];

  if (reduced) {
    return (
      <section id="hero" className="relative">
        <div className="relative flex min-h-[78vh] items-center justify-center overflow-hidden">
          <FicheStage ref={stageRef} />
        </div>
        <div className="mx-auto max-w-3xl px-6 pb-24 text-center">
          <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">{typo(content.hero.eyebrow)}</p>
          {/* Mouvement réduit : chaque phase reste lisible, sous forme de texte.
              Playbook §6 — « prévoyez un état statique lisible pour chaque phase ». */}
          <div className="mt-8 space-y-6 text-left">
            {PHASE_ORDER.map((name) => (
              <div key={name} className="border-l-2 border-line pl-5">
                <h2 className="font-display text-xl font-semibold">{typo(content.hero.phases[name].title)}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{typo(content.hero.phases[name].body)}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <CtaButton href={appUrl("/signup")}>{typo(content.hero.cta.primary)}</CtaButton>
            <CtaButton href="#tarifs" variant="ghost">
              {typo(content.hero.cta.secondary)}
            </CtaButton>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="hero" ref={sectionRef} style={{ height: `${HERO_SCROLL_VH}vh` }} className="relative">
      {/* `position: sticky` crée un contexte d'empilement (playbook §5) : rien
          ici ne cherche à passer au-dessus de l'en-tête fixe, et l'en-tête est
          monté plus haut de son côté. */}
      {/*
       * La légende est AU-DESSUS de la scène, pas superposée.
       *
       * Première version : la fiche en `absolute inset-0` et le texte par-dessus.
       * La planche de captures a montré le résultat — la fiche mordait sur le
       * titre, illisible. Une colonne franche (légende, puis scène dans la place
       * qui reste, puis appels à l'action) rend le recouvrement impossible, quelle
       * que soit la hauteur d'écran, sans le moindre réglage au pixel.
       */}
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden px-6 pt-24 pb-8 sm:pt-28">
        <div className="mx-auto w-full max-w-2xl shrink-0 text-center">
          <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase sm:text-xs">
            {typo(content.hero.eyebrow)}
          </p>

          {/* La clé force le remontage : c'est ce qui rejoue l'animation
              d'entrée du texte à chaque changement de phase. */}
          <div key={phase} data-caption className="mt-6 animate-[caption-in_560ms_var(--ease-out-soft)_both]">
            <h1 className="font-display text-gradient text-3xl leading-[1.1] font-semibold text-balance sm:text-4xl md:text-5xl">
              {typo(caption.title)}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-balance text-muted sm:text-base">
              {typo(caption.body)}
            </p>
          </div>
        </div>

        {/* La scène prend tout l'espace restant et s'y met à l'échelle. */}
        <div className="relative min-h-0 flex-1">
          <FicheStage ref={stageRef} />
        </div>

        <div className="mx-auto w-full max-w-2xl shrink-0 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <CtaButton href={appUrl("/signup")}>{typo(content.hero.cta.primary)}</CtaButton>
            <CtaButton href="#tarifs" variant="ghost">
              {typo(content.hero.cta.secondary)}
            </CtaButton>
          </div>
          <ScrollProgressDots active={phase} />
        </div>
      </div>
    </section>
  );
}

/** Repère de lecture : où en est-on dans la séquence. Décoratif, donc masqué. */
function ScrollProgressDots({ active }: { active: PhaseName }) {
  return (
    <div className="mt-9 flex items-center justify-center gap-2" aria-hidden="true">
      {PHASE_ORDER.map((name) => (
        <span
          key={name}
          className={`h-1 rounded-full transition-all duration-500 ${
            name === active ? "w-7 bg-primary" : "w-1.5 bg-veil/20"
          }`}
        />
      ))}
    </div>
  );
}
