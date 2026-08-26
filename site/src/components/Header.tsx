"use client";

import { useState } from "react";

import { CtaButton } from "@/components/ui/CtaButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";
import { appUrl } from "@/lib/urls";

/**
 * En-tête fixe. `z-50` le place au-dessus du hero épinglé.
 *
 * PLAYBOOK §5 : `position: sticky` crée un contexte d'empilement, et un enfant du
 * conteneur épinglé ne pourrait jamais passer au-dessus d'un élément `fixed`,
 * quel que soit son `z-index`. La règle suivie ici est l'inverse et elle est
 * simple : rien, dans le hero, n'essaie de passer au-dessus de cet en-tête.
 */
export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <a href="#hero" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight">{typo(content.nav.brand)}</span>
        </a>

        <nav className="hidden items-center gap-1 rounded-full border border-line bg-surface/70 px-2 py-1.5 backdrop-blur-xl md:flex">
          {content.nav.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-1.5 text-sm text-muted transition-colors hover:bg-veil/[0.06] hover:text-fg"
            >
              {typo(link.label)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={appUrl("/login")}
            className="hidden rounded-full px-3.5 py-2 text-sm text-muted transition-colors hover:text-fg sm:block"
          >
            {typo(content.nav.login)}
          </a>
          {/*
           * Toujours visible, y compris sur téléphone — c'est l'appel à l'action
           * principal du site, le masquer sur le format le plus utilisé du marché
           * visé n'aurait aucun sens.
           *
           * Il portait au départ `hidden sm:inline-flex`… et s'affichait quand même :
           * `inline-flex` est déjà dans les classes de base du bouton, et entre deux
           * utilitaires `display` c'est l'ORDRE DANS LA FEUILLE générée qui tranche,
           * jamais l'ordre dans l'attribut `class`. Trouvé sur la planche mobile.
           */}
          <CtaButton href={appUrl("/signup")} className="px-4 py-2 text-xs sm:px-5 sm:text-sm">
            {typo(content.nav.cta)}
          </CtaButton>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={typo(open ? content.nav.menuClose : content.nav.menuOpen)}
            className="grid size-9 place-items-center rounded-full border border-line bg-veil/[0.04] text-muted md:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              {open ? (
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <div className="mx-5 rounded-2xl border border-line bg-surface/95 p-3 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col">
            {content.nav.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-veil/[0.06] hover:text-fg"
              >
                {typo(link.label)}
              </a>
            ))}
            <a
              href={appUrl("/login")}
              className="rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-veil/[0.06] hover:text-fg"
            >
              {typo(content.nav.login)}
            </a>
          </nav>
          <CtaButton href={appUrl("/signup")} className="mt-2 w-full">
            {typo(content.nav.cta)}
          </CtaButton>
        </div>
      ) : null}
    </header>
  );
}

/**
 * Le logo : la lettre R suggérée par un registre — trois filets et une reliure.
 * Formes géométriques uniquement (playbook §7), et il suit la couleur de marque.
 */
function Logo() {
  return (
    <span className="grid size-9 place-items-center rounded-xl border border-primary/40 bg-primary/12" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-4.5 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" d="M7 5v14" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7" />
        <path strokeLinecap="round" d="m12.5 12 4.5 7" />
      </svg>
    </span>
  );
}
