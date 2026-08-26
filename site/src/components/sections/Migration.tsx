import { MotifCard, Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

/**
 * La reprise de l'existant (§9). Trois étapes numérotées, reliées par un filet :
 * l'argument est un déroulé, pas une liste de fonctions.
 */
export function Migration() {
  const { migration } = content;

  return (
    <Section kicker={migration.kicker} title={migration.title} intro={migration.body}>
      <div className="relative mt-14 grid gap-5 sm:grid-cols-3">
        {/* Le filet qui relie les trois étapes, masqué dès qu'elles s'empilent. */}
        <div className="rule-brand pointer-events-none absolute top-[3.25rem] right-[16%] left-[16%] hidden h-px sm:block" aria-hidden="true" />

        {migration.steps.map((step, i) => (
          <Reveal key={step.n} delay={i * 110}>
            <MotifCard className="relative h-full p-7 text-center">
              <span className="font-display mx-auto grid size-11 place-items-center rounded-full border border-primary/40 bg-surface text-base font-semibold text-primary">
                {step.n}
              </span>
              <h3 className="font-display mt-5 text-base font-semibold">{typo(step.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{typo(step.body)}</p>
            </MotifCard>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
