"use client";

/**
 * Garde-fou "modifications non enregistrées", réutilisable sur les formulaires
 * où perdre du travail coûte cher (une fiche longue à ressaisir, des réglages
 * de modèle) — pas sur chaque boîte de dialogue de l'app, voir l'appel à
 * `useUnsavedChangesGuard` dans `record-form.tsx` et
 * `app/(app)/models/[modelId]/settings/page.tsx`.
 *
 * "Sale" (`isDirty`) vient toujours de `formState.isDirty` de React Hook Form
 * côté appelant — ce hook n'invente pas son propre suivi de modifications,
 * il ne fait que réagir à un booléen qu'on lui donne.
 *
 * Deux mécanismes, pour deux types de départ de la page :
 *
 * 1. Fermeture d'onglet / rechargement / navigation hors app : l'événement
 *    natif `beforeunload` — c'est la seule API que le navigateur offre pour
 *    ce cas, et elle impose sa propre invite native (pas de personnalisation
 *    du texte possible, c'est une limite du navigateur, pas de ce code).
 *
 * 2. Navigation interne (clic sur un lien de la coquille applicative — barre
 *    latérale, bouton "Retour"...) : l'App Router de Next.js 16 n'expose pas
 *    d'équivalent à `useBlocker` de React Router pour bloquer une navigation
 *    déclenchée ailleurs dans l'arbre (voir la doc Next.js citée plus bas).
 *    Le seul mécanisme documenté est le prop `onNavigate` de chaque `<Link>`
 *    individuel (node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md,
 *    section "Blocking navigation") — inapplicable ici sans modifier
 *    `components/app-nav.tsx` (hors périmètre de cette tâche, un autre agent
 *    y travaille en parallèle). On obtient le même résultat sans y toucher :
 *    un écouteur `click` en phase de capture sur `document`, qui s'exécute
 *    avant le gestionnaire interne de `<Link>` (la phase de capture, de
 *    `document` vers la cible, se termine toujours avant la phase de
 *    bouillonnement où `<Link>` navigue) — donc `preventDefault` ici empêche
 *    fiablement la navigation native ET la navigation client de Next, quel
 *    que soit le composant qui a rendu le lien. Cette approche couvre aussi
 *    bien le lien "Retour" propre au formulaire que la barre latérale.
 *
 * Limite documentée et acceptée : le bouton "Précédent"/"Suivant" du
 * navigateur (navigation par l'historique, `popstate`) n'est pas intercepté —
 * aucune API stable ne permet de bloquer proprement ce cas dans l'App Router,
 * et tenter de la simuler (réinjecter une entrée d'historique) est plus
 * trompeur qu'utile. Seul `beforeunload` s'en approche marginalement dans
 * certains navigateurs, pas tous.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const UNSAVED_CHANGES_MESSAGE =
  "Des modifications ne sont pas enregistrées. Voulez-vous vraiment quitter cette page ?";

export interface UseUnsavedChangesGuardResult {
  /** À placer une fois dans le JSX du formulaire gardé — affiche la
   * confirmation quand une navigation interne a été interceptée. */
  dialog: ReactNode;
}

export function useUnsavedChangesGuard(isDirty: boolean): UseUnsavedChangesGuardResult {
  const router = useRouter();
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // 1. Fermeture d'onglet / rechargement / navigation hors app.
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      // Requis par certains navigateurs (Chrome) pour afficher l'invite native ;
      // le texte lui-même n'est jamais affiché, c'est le navigateur qui l'impose.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // 2. Navigation interne déclenchée par un clic sur un lien (voir le
  // commentaire d'en-tête pour pourquoi une écoute en phase de capture).
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!isDirtyRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
      if (samePage) return; // lien d'ancrage ou vers la page courante — rien à bloquer.

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  const confirmLeave = useCallback(() => {
    if (pendingHref) router.push(pendingHref);
    setPendingHref(null);
  }, [pendingHref, router]);

  const cancelLeave = useCallback(() => setPendingHref(null), []);

  const dialog = (
    <AlertDialog open={pendingHref !== null} onOpenChange={(open) => !open && cancelLeave()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
          <AlertDialogDescription>{UNSAVED_CHANGES_MESSAGE}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelLeave}>Rester sur la page</AlertDialogCancel>
          <AlertDialogAction onClick={confirmLeave}>Quitter sans enregistrer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog };
}
