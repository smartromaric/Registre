import { MotifCard } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

/**
 * Le champ Échéance (§5.3). Mise en page à deux colonnes plutôt qu'en grille de
 * cartes : l'argument est une démonstration — trois informations séparées d'un
 * côté, réunies de l'autre — et une grille de trois cartes égales le raterait.
 */
export function Deadline() {
  const { deadline } = content;

  return (
    <section className="relative mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <div className="grid items-start gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal>
          <div className="flex items-center gap-3">
            <span className="rule-brand h-px w-8 shrink-0" aria-hidden="true" />
            <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase">{typo(deadline.kicker)}</p>
          </div>
          <h2 className="font-display text-gradient mt-5 text-3xl leading-[1.12] font-semibold text-balance sm:text-4xl md:text-[2.75rem]">
            {typo(deadline.title)}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted">{typo(deadline.body)}</p>
          <p className="mt-6 border-l-2 border-primary/50 pl-5 text-sm leading-relaxed text-muted">
            {typo(deadline.closing)}
          </p>
        </Reveal>

        <div className="relative">
          {/* L'accolade visuelle : trois éléments qui convergent vers un seul. */}
          <div className="space-y-4">
            {deadline.parts.map((part, i) => (
              <Reveal key={part.title} delay={i * 110}>
                <MotifCard className="flex items-start gap-4 p-5">
                  <span className="font-display mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-primary/35 bg-primary/12 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{typo(part.title)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{typo(part.body)}</p>
                  </div>
                </MotifCard>
              </Reveal>
            ))}
          </div>

          <Reveal delay={360} className="mt-5">
            <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-primary/35 bg-primary/[0.07] px-5 py-4">
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
              <p className="text-sm font-medium">{typo(deadline.result)}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
