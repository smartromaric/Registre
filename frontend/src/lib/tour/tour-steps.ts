/**
 * Visite guidée du premier accès (§ onboarding). Les cibles sont désignées par
 * un attribut `data-tour` dédié, jamais par une classe utilitaire ni une
 * structure DOM : une classe Tailwind change au premier ajustement visuel et
 * emporterait la visite avec elle, sans que rien ne le signale.
 *
 * Chaque étape est **facultative** : `driver.js` saute proprement une cible
 * absente, ce qui est indispensable ici — la barre latérale est masquée sous
 * `lg`, et plusieurs entrées sont réservées à l'administrateur (voir
 * `app-nav.tsx`). Une visite qui exigerait toutes ses cibles se casserait donc
 * sur mobile et pour tout rôle non-administrateur.
 */

/** Attribut posé sur les éléments que la visite peut désigner. */
export const TOUR_ATTRIBUTE = "data-tour";

export const TOUR_TARGETS = {
  sidebar: "sidebar",
  models: "models",
  newModel: "new-model",
  search: "search",
  notifications: "notifications",
  offline: "offline",
  account: "account",
} as const;

export type TourTarget = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];

/** Sélecteur CSS d'une cible — un seul endroit qui sait comment l'attribut est écrit. */
export function tourSelector(target: TourTarget): string {
  return `[${TOUR_ATTRIBUTE}="${target}"]`;
}

export interface TourStep {
  target: TourTarget;
  title: string;
  description: string;
}

/** Ordre volontaire : on part de « où suis-je » (la navigation) pour arriver à
 * « qu'est-ce que je fais maintenant » (créer un modèle), plutôt que d'énumérer
 * les fonctions dans l'ordre du menu. */
export const TOUR_STEPS: TourStep[] = [
  {
    target: TOUR_TARGETS.sidebar,
    title: "Votre navigation",
    description:
      "Tout part d'ici. Le rail reste réduit pour laisser la place au contenu : survolez-le pour le déplier, ou épinglez-le ouvert avec « Garder ouvert » en bas.",
  },
  {
    target: TOUR_TARGETS.models,
    title: "Vos modèles",
    description:
      "Un modèle décrit ce que vous suivez : des véhicules, du personnel, des bouteilles de gaz… Chaque modèle a ses propres champs, que vous définissez vous-même.",
  },
  {
    target: TOUR_TARGETS.newModel,
    title: "Commencez par un modèle",
    description:
      "Créez le vôtre, ou partez d'un modèle prêt à l'emploi depuis la Bibliothèque — vous pourrez toujours ajouter ou retirer des champs ensuite.",
  },
  {
    target: TOUR_TARGETS.search,
    title: "Retrouver quelque chose",
    description:
      "La recherche ouvre aussi la palette de commandes : Ctrl + K depuis n'importe quel écran pour aller droit à un modèle ou à une action.",
  },
  {
    target: TOUR_TARGETS.notifications,
    title: "Ce qui arrive à échéance",
    description:
      "La cloche affiche le nombre d'alertes non lues : échéance qui approche, stock sous son seuil, lot bientôt périmé. L'écran Alertes garde l'historique complet, même après acquittement.",
  },
  {
    target: TOUR_TARGETS.offline,
    title: "Vous pouvez travailler hors connexion",
    description:
      "Cet indicateur reste visible en permanence. Sans réseau, vos saisies sont conservées sur l'appareil et repartent toutes seules dès que la connexion revient.",
  },
  {
    target: TOUR_TARGETS.account,
    title: "Votre compte",
    description:
      "Vous retrouverez cette visite guidée ici à tout moment, ainsi que le changement de thème et la déconnexion.",
  },
];
