import type { ReactNode } from "react";

import { Reveal } from "@/components/ui/Reveal";
import { typo } from "@/lib/typography";

/**
 * L'ossature commune des sections. Un seul endroit décide de la largeur, du
 * rythme vertical et de la forme d'un titre — sans quoi douze sections dérivent
 * chacune de trois pixels et la page perd sa régularité.
 */
export function Section({
  id,
  kicker,
  title,
  intro,
  children,
  align = "left",
  className = "",
}: {
  id?: string;
  kicker: string;
  title: string;
  intro?: string;
  children?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <section id={id} className={`relative mx-auto max-w-6xl px-5 py-24 sm:py-32 ${className}`}>
      <Reveal className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
        <div className={`flex items-center gap-3 ${centered ? "justify-center" : ""}`}>
          <span className="rule-brand h-px w-8 shrink-0" aria-hidden="true" />
          <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase">{typo(kicker)}</p>
        </div>
        <h2 className="font-display text-gradient mt-5 text-3xl leading-[1.12] font-semibold text-balance sm:text-4xl md:text-[2.75rem]">
          {typo(title)}
        </h2>
        {intro ? <p className="mt-5 text-base leading-relaxed text-muted">{typo(intro)}</p> : null}
      </Reveal>
      {children}
    </section>
  );
}

/**
 * La carte à motif. `--card-accent` permet de teinter la trame carte par carte
 * tout en restant dans la charte : la couleur passée est toujours un jeton du
 * thème, jamais une valeur écrite en dur.
 */
export function MotifCard({
  children,
  accent,
  className = "",
  interactive = true,
}: {
  children: ReactNode;
  accent?: string;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`card-motif rounded-[var(--radius-card)] border border-line bg-surface/70 backdrop-blur-sm ${
        interactive
          ? "transition-[transform,border-color,box-shadow] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_28px_60px_-28px_rgba(0,0,0,0.6)]"
          : ""
      } ${className}`}
      style={accent ? ({ "--card-accent": accent } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
