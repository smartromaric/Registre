import { content } from "@/lib/content";
import { typo } from "@/lib/typography";
import { appUrl } from "@/lib/urls";

/**
 * PLAYBOOK §6 : un `<footer>` imbriqué dans `<main>` ne porte PAS le rôle
 * `contentinfo`. Il est donc rendu en frère de `<main>` dans `page.tsx`, pas
 * dedans — c'est la seule façon qu'il soit annoncé comme pied de page.
 *
 * Aucune mention légale, aucun réseau social, aucune adresse : rien de tout cela
 * n'existe encore. Playbook §7 — une section sans contenu réel ne se fait pas.
 */
export function Footer() {
  const { footer, nav } = content;

  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-14 sm:flex-row sm:justify-between">
        <div className="max-w-xs">
          <p className="font-display text-lg font-semibold tracking-tight">{typo(nav.brand)}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{typo(footer.tagline)}</p>
        </div>

        <div className="flex gap-14">
          <nav aria-label={typo(footer.productTitle)}>
            <p className="text-[11px] font-medium tracking-[0.16em] text-muted/70 uppercase">{typo(footer.productTitle)}</p>
            <ul className="mt-4 space-y-2.5">
              {nav.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-muted transition-colors hover:text-fg">
                    {typo(link.label)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={typo(footer.appTitle)}>
            <p className="text-[11px] font-medium tracking-[0.16em] text-muted/70 uppercase">{typo(footer.appTitle)}</p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a href={appUrl("/login")} className="text-sm text-muted transition-colors hover:text-fg">
                  {typo(footer.appLinks.login)}
                </a>
              </li>
              <li>
                <a href={appUrl("/signup")} className="text-sm text-muted transition-colors hover:text-fg">
                  {typo(footer.appLinks.signup)}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="border-t border-line/70">
        <div className="mx-auto max-w-6xl px-5 py-6">
          {/* Pas d'année : le site est exporté en statique et pourrait n'être pas
              reconstruit au 1er janvier. Une année fausse est pire qu'aucune. */}
          <p className="text-xs text-muted/70">© {typo(footer.rights)}</p>
        </div>
      </div>
    </footer>
  );
}
