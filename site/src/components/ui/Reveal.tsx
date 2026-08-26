"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Apparition à l'entrée dans l'écran.
 *
 * PLAYBOOK §6, « performance » : on n'anime que ce qui est visible. Un
 * `IntersectionObserver` unique par élément, qui **se débranche après le premier
 * déclenchement** — garder cinquante observateurs vivants pour des sections déjà
 * révélées coûte pour rien.
 *
 * On écrit une classe, pas un état React : cela évite un rendu par section
 * révélée, et l'animation reste entièrement en CSS (donc composée par le GPU).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Mouvement réduit : on montre directement, sans transition.
    if (reduced) {
      el.dataset.revealed = "true";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.dataset.revealed = "true";
          observer.disconnect();
        }
      },
      // Un peu avant l'entrée réelle : l'élément est déjà en place quand il
      // devient lisible, plutôt que de commencer à bouger sous les yeux.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <Tag
      // @ts-expect-error — la ref est bien un élément HTML quelle que soit la balise choisie.
      ref={ref}
      data-reveal=""
      style={{ transitionDelay: `${delay}ms` }}
      className={className}
    >
      {children}
    </Tag>
  );
}
