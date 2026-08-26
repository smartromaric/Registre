import { CtaButton } from "@/components/ui/CtaButton";
import { MotifCard, Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";
import { appUrl } from "@/lib/urls";

/**
 * La grille tarifaire — §12.1 du cahier des charges, valeurs par défaut reprises
 * telles quelles. Aucun prix n'est inventé ici.
 *
 * Trois honnêtetés que ce genre de section escamote d'habitude, et qui sont
 * écrites noir sur blanc en bas : les montants sont des valeurs par défaut
 * ajustables, le dépassement de quota ne bloque QUE l'envoi de fichiers, et il
 * n'y a **aucun paiement en ligne** — le règlement se fait hors plateforme.
 * Laisser croire à un paiement par carte serait un faux état de succès.
 */
export function Pricing() {
  const { pricing } = content;

  return (
    <Section id="tarifs" kicker={pricing.kicker} title={pricing.title} intro={pricing.intro} align="center">
      <Reveal delay={80} className="mx-auto mt-5 max-w-2xl text-center">
        <p className="text-sm leading-relaxed text-muted/85">{typo(pricing.rationale)}</p>
      </Reveal>

      <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
        {pricing.plans.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 100} className={plan.featured ? "lg:-my-3" : ""}>
            <MotifCard
              // Le motif reste corail sur les trois cartes : teinté au jeton de
              // filet, il devenait invisible et les offres non mises en avant
              // tombaient à plat. C'est la bordure et l'ombre qui distinguent
              // l'offre recommandée, pas l'absence de motif chez les autres.
              accent="var(--color-primary)"
              className={`flex h-full flex-col p-7 ${
                plan.featured ? "border-primary/45 shadow-[0_30px_70px_-32px_color-mix(in_oklch,var(--color-primary),transparent_50%)]" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{typo(plan.name)}</h3>
                {plan.featured ? (
                  <span className="rounded-full border border-primary/40 bg-primary/12 px-2.5 py-1 text-[10px] font-medium tracking-wide text-primary uppercase">
                    {typo(pricing.featuredLabel)}
                  </span>
                ) : null}
              </div>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold tracking-tight">{typo(plan.price)}</span>
                <span className="text-sm text-muted">{typo(pricing.currency)}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {typo(`${plan.duration} · ${pricing.perMonth.replace("{x}", plan.monthly)}`)}
              </p>

              <dl className="mt-7 space-y-3 border-t border-line/70 pt-6 text-sm">
                <Row label={pricing.durationLabel} value={plan.duration} />
                <Row label={pricing.usersLabel} value={plan.users} />
                <Row label={pricing.storageLabel} value={plan.storage} />
              </dl>

              <p className="mt-4 text-xs leading-relaxed text-muted/80">{typo(plan.capacity)}</p>

              <CtaButton
                href={appUrl("/signup")}
                variant={plan.featured ? "primary" : "ghost"}
                className="mt-7 w-full"
              >
                {typo(pricing.cta)}
              </CtaButton>
            </MotifCard>
          </Reveal>
        ))}
      </div>

      {/* L'essai, mis en avant : c'est le vrai appel à l'action de la page. */}
      <Reveal delay={340} className="mt-10">
        <MotifCard
          interactive={false}
          className="flex flex-col items-center gap-6 border-primary/35 p-8 text-center md:flex-row md:justify-between md:p-9 md:text-left"
        >
          <div className="max-w-xl">
            <h3 className="font-display text-xl font-semibold">{typo(pricing.trial.title)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{typo(pricing.trial.body)}</p>
          </div>
          <CtaButton href={appUrl("/signup")} className="shrink-0">
            {typo(pricing.trial.cta)}
          </CtaButton>
        </MotifCard>
      </Reveal>

      <Reveal delay={420} className="mx-auto mt-10 max-w-3xl">
        <ul className="space-y-2.5 text-left">
          {pricing.notes.map((note) => (
            <li key={note} className="flex gap-3 text-xs leading-relaxed text-muted/80">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted/50" aria-hidden="true" />
              <span>{typo(note)}</span>
            </li>
          ))}
          <li className="flex gap-3 text-xs leading-relaxed text-muted/80">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted/50" aria-hidden="true" />
            <span>{typo(pricing.capacityNote)}</span>
          </li>
        </ul>
      </Reveal>
    </Section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{typo(label)}</dt>
      <dd className="text-right font-medium">{typo(value)}</dd>
    </div>
  );
}
