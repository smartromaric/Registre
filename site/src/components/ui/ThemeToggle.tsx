"use client";

import { useSyncExternalStore } from "react";

import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

const KEY = "registre-site-theme";

/**
 * Le thème est déjà posé sur `<html>` par le script inline du layout, avant
 * l'hydratation. Ce composant ne fait que *lire* et *écrire* cet attribut : il
 * n'est pas la source de vérité, le DOM l'est. C'est ce qui évite le scénario
 * classique — un état React initialisé à « dark » qui écrase, à l'hydratation,
 * le thème clair que le script venait de poser.
 */
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function getServerSnapshot(): "light" | "dark" {
  return "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Navigation privée ou stockage refusé : le thème s'applique quand même
      // pour cette visite, il ne survivra simplement pas au rechargement.
    }
    emit();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={typo(content.nav.themeToggle)}
      title={typo(content.nav.themeToggle)}
      className="grid size-9 place-items-center rounded-full border border-line bg-veil/[0.04] text-muted transition-colors hover:border-primary/50 hover:text-fg"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
