"use client";

/**
 * Visite guidée du premier accès, bâtie sur `driver.js` (MIT, sans dépendance
 * à React — donc rien à réaligner à chaque version majeure de React).
 *
 * Deux règles de conduite :
 * - **Une seule fois, jamais imposée deux fois.** Le fait d'avoir vu la visite
 *   est mémorisé localement, par utilisateur. Un guide qui se relance à chaque
 *   connexion cesse d'être une aide.
 * - **Rejouable à la demande** depuis le menu du compte : un utilisateur qui
 *   l'a passée trop vite doit pouvoir y revenir, sinon la seule issue est de
 *   vider son stockage local.
 *
 * Le module `driver.js` est importé dynamiquement : il n'entre dans le bundle
 * que le jour où la visite démarre réellement, c'est-à-dire une fois dans la
 * vie d'un compte.
 */

import { useCallback, useEffect } from "react";

import { TOUR_STEPS, tourSelector } from "./tour-steps";

const SEEN_KEY_PREFIX = "registre.tourSeen.";

function seenKey(userId: string): string {
  return `${SEEN_KEY_PREFIX}${userId}`;
}

function hasSeenTour(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    // Stockage indisponible : on considère la visite comme déjà vue plutôt que
    // de la relancer à chaque chargement — une aide qu'on ne peut pas faire
    // taire devient une gêne.
    return true;
  }
}

function markTourSeen(userId: string): void {
  try {
    window.localStorage.setItem(seenKey(userId), "1");
  } catch {
    // Sans persistance, la visite se relancera au prochain accès : acceptable,
    // et sans conséquence sur les données.
  }
}

async function runTour(onDone: () => void): Promise<void> {
  const [{ driver }] = await Promise.all([import("driver.js"), import("driver.js/dist/driver.css")]);

  const steps = TOUR_STEPS.filter((step) => document.querySelector(tourSelector(step.target))).map((step) => ({
    element: tourSelector(step.target),
    popover: { title: step.title, description: step.description },
  }));

  // Toutes les cibles peuvent être absentes à la fois (écran étroit, rôle sans
  // les entrées d'administration) : mieux vaut ne rien lancer que d'ouvrir une
  // bulle vide au milieu de l'écran.
  if (steps.length === 0) {
    onDone();
    return;
  }

  driver({
    steps,
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: "registre-tour",
    nextBtnText: "Suivant",
    prevBtnText: "Précédent",
    doneBtnText: "Terminer",
    progressText: "{{current}} / {{total}}",
    onDestroyed: onDone,
  }).drive();
}

export interface TourController {
  /** Relance la visite à la demande (menu du compte). */
  start: () => void;
}

export function useTour(userId: string | undefined, ready: boolean): TourController {
  const start = useCallback(() => {
    if (!userId) return;
    void runTour(() => markTourSeen(userId));
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId || hasSeenTour(userId)) return;
    // Un temps de repos avant de démarrer : les cibles de la visite sont
    // montées par la coquille applicative et par des requêtes qui viennent
    // d'aboutir. Désigner un élément qui n'est pas encore là ferait sauter
    // l'étape silencieusement.
    const timer = window.setTimeout(() => {
      void runTour(() => markTourSeen(userId));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [ready, userId]);

  return { start };
}
