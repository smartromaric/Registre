import { CtaButton } from "@/components/ui/CtaButton";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";
import { appUrl } from "@/lib/urls";

/** Le dernier appel à l'action. Aucun formulaire : il mènerait à l'inscription
 *  de toute façon, et un formulaire de contact non branché mentirait (playbook §3). */
export function FinalCta() {
  const { finalCta } = content;

  return (
    <section className="relative mx-auto max-w-6xl px-5 pb-28 sm:pb-36">
      <Reveal>
        <div className="card-motif relative overflow-hidden rounded-[2rem] border border-primary/30 bg-surface/70 px-6 py-16 text-center backdrop-blur-sm sm:px-16 sm:py-20">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(ellipse 70% 90% at 50% 110%, color-mix(in oklch, var(--color-primary), transparent 82%), transparent 68%)",
            }}
          />
          <h2 className="font-display text-gradient mx-auto max-w-2xl text-3xl leading-[1.12] font-semibold text-balance sm:text-4xl md:text-[2.75rem]">
            {typo(finalCta.title)}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-balance text-muted">{typo(finalCta.body)}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <CtaButton href={appUrl("/signup")}>{typo(finalCta.primary)}</CtaButton>
            <CtaButton href={appUrl("/login")} variant="ghost">
              {typo(finalCta.secondary)}
            </CtaButton>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
