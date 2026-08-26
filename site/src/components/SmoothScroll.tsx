"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { LENIS_LERP } from "@/lib/config";
import { expose } from "@/lib/debug";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Le scroll lissé, monté une seule fois pour toute la page.
 *
 * PLAYBOOK §2, le point à ne pas rater : Lenis se branche **dans le ticker GSAP**,
 * jamais en parallèle. Deux boucles indépendantes (le rAF de Lenis d'un côté, le
 * ticker de GSAP de l'autre) tombent sur des frames différentes, et le décalage
 * se voit — l'objet animé « traîne » d'une frame derrière le scroll.
 *
 * `lagSmoothing(0)` désactive le rattrapage de GSAP : après un à-coup (onglet
 * réactivé, GC), GSAP avancerait le temps d'un bond pour « rattraper », ce qui
 * ferait sauter la mise en scène au lieu de la reprendre là où elle en est.
 */
export function SmoothScroll() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    // Sans mouvement réduit : aucun lissage, on laisse le scroll natif. Un
    // défilement inertiel est précisément ce que ce réglage demande d'éviter.
    if (reduced) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ lerp: LENIS_LERP });
    lenis.on("scroll", ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Exposé pour les tests : sans cela, un `window.scrollTo` est immédiatement
    // ramené par Lenis, et un test ne peut pas se placer à une progression
    // précise. `scrollTo(y, { immediate: true })` est le seul moyen fiable.
    expose("lenis", lenis);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      expose("lenis", null);
    };
  }, [reduced]);

  return null;
}
