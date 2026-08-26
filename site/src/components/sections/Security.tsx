import { MotifCard, Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

/** Cloisonnement et cycle de vie (§4.2, §4.3, §12.3). */
export function Security() {
  const { security } = content;

  return (
    <Section kicker={security.kicker} title={security.title}>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {security.items.map((item, i) => (
          <Reveal key={item.title} delay={i * 90}>
            <MotifCard className="flex h-full flex-col p-7">
              <h3 className="font-display text-lg leading-snug font-semibold text-balance">{typo(item.title)}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{typo(item.body)}</p>
              <p className="mt-5 font-mono text-[11px] tracking-wide text-muted/70">
                Cahier des charges {typo(item.ref)}
              </p>
            </MotifCard>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
