import { MotifCard } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

/**
 * Le hors-ligne (§11). Section pleine largeur sur fond appuyé : c'est le
 * différenciateur réel sur le marché visé, il ne doit pas ressembler à une
 * fonctionnalité parmi douze.
 */
export function Offline() {
  const { offline } = content;

  return (
    <section id="hors-ligne" className="relative py-24 sm:py-32">
      {/* Nappe de fond : elle sort de la grille pour couper le rythme de la page. */}
      <div
        className="pointer-events-none absolute inset-x-0 inset-y-8 -z-10"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, color-mix(in oklch, var(--color-primary), transparent 92%), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid items-start gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <Reveal>
            <div className="flex items-center gap-3">
              <span className="rule-brand h-px w-8 shrink-0" aria-hidden="true" />
              <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase">{typo(offline.kicker)}</p>
            </div>
            <h2 className="font-display text-gradient mt-5 text-3xl leading-[1.12] font-semibold text-balance sm:text-4xl md:text-[2.75rem]">
              {typo(offline.title)}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted">{typo(offline.body)}</p>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {offline.items.map((item, i) => (
              <Reveal key={item.title} delay={i * 90}>
                <MotifCard className="h-full p-5">
                  <h3 className="text-sm font-semibold">{typo(item.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{typo(item.body)}</p>
                </MotifCard>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
