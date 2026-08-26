import { MotifCard, Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

/**
 * La bibliothèque (§5.6). Les deux natures — actif suivi et article de stock —
 * sont distinguées par une pastille *et par un mot*, jamais par la seule couleur :
 * c'est la règle du produit lui-même (PRODUCT.md §7.2), et elle vaut ici aussi.
 */
export function Templates() {
  const { templates } = content;

  return (
    <Section id="modeles" kicker={templates.kicker} title={templates.title} intro={templates.intro}>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {templates.items.map((tpl, i) => {
          const kind = templates.kinds[tpl.kind];
          const accent = tpl.kind === "stock" ? "var(--color-success)" : "var(--color-primary)";

          return (
            <Reveal key={tpl.name} delay={(i % 3) * 80}>
              <MotifCard accent={accent} className="flex h-full flex-col p-6">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full" style={{ background: accent }} aria-hidden="true" />
                  <span className="text-[10px] font-medium tracking-[0.16em] uppercase" style={{ color: accent }}>
                    {typo(kind.label)}
                  </span>
                </div>
                <h3 className="font-display mt-3 text-xl font-semibold">{typo(tpl.name)}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{typo(tpl.fields)}</p>
                <p className="mt-5 border-t border-line/70 pt-4 text-xs text-muted/80">{typo(kind.hint)}</p>
              </MotifCard>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
