import { MotifCard, Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

const ICONS = [
  // Déclarer : un gabarit et ses champs.
  <path key="a" strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM8 9h8M8 13h8M8 17h4" />,
  // Surveiller : une cloche.
  <path key="b" strokeLinecap="round" strokeLinejoin="round" d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5ZM10.5 19a1.8 1.8 0 0 0 3 0" />,
  // Ne rien écraser : deux flux qui s'additionnent.
  <path key="c" strokeLinecap="round" strokeLinejoin="round" d="M4 7h9l-2.5-2.5M4 7l2.5 2.5M20 17h-9l2.5 2.5M20 17l-2.5-2.5" />,
];

export function Pillars() {
  const { pillars } = content;

  return (
    <Section id="produit" kicker={pillars.kicker} title={pillars.title}>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {pillars.items.map((item, i) => (
          <Reveal key={item.title} delay={i * 90}>
            <MotifCard className="flex h-full flex-col p-7">
              <span className="flex size-11 items-center justify-center rounded-xl border border-primary/35 bg-primary/12" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-5 text-primary" fill="none" stroke="currentColor" strokeWidth="1.7">
                  {ICONS[i]}
                </svg>
              </span>
              <h3 className="font-display mt-5 text-lg leading-snug font-semibold text-balance">{typo(item.title)}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{typo(item.body)}</p>
              {/* La référence au cahier des charges est affichée, pas cachée : elle
                  dit au lecteur que l'affirmation est vérifiable. */}
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
