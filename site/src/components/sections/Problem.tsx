import { MotifCard, Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

/**
 * Les trois conséquences, reprises mot pour mot du §1 du cahier des charges.
 * Elles sont teintées à la couleur d'alarme et non à la couleur de marque : ce
 * sont des situations subies, pas des fonctions du produit.
 */
export function Problem() {
  const { problem } = content;

  return (
    <Section kicker={problem.kicker} title={problem.title}>
      <div className="mt-14 grid gap-5 sm:grid-cols-3">
        {problem.items.map((item, i) => (
          <Reveal key={item.title} delay={i * 90}>
            <MotifCard accent="var(--color-danger)" className="h-full p-7">
              <span className="flex size-10 items-center justify-center rounded-xl border border-danger/35 bg-danger/10" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-5 text-danger" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
              </span>
              <h3 className="font-display mt-5 text-lg font-semibold">{typo(item.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{typo(item.body)}</p>
            </MotifCard>
          </Reveal>
        ))}
      </div>

      <Reveal delay={280} className="mt-10 max-w-2xl">
        <p className="border-l-2 border-primary/50 pl-5 text-base leading-relaxed text-balance text-muted">
          {typo(problem.footnote)}
        </p>
      </Reveal>
    </Section>
  );
}
