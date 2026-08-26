/**
 * L'état partagé — playbook §3, « un seul écrivain ».
 *
 * Les sections ne touchent jamais à l'objet animé : elles **déposent leur
 * progression** ici. Une unique boucle de rendu (`components/hero/Hero.tsx`)
 * lit cet état une fois par frame et écrit la fiche. Deux animations ne peuvent
 * donc jamais se disputer le même objet.
 */
export const scrollState = {
  /** Progression globale du hero, 0 → 1. */
  hero: 0,
};

/**
 * Les déclencheurs publiés — playbook §3, « lire la progression, ne pas l'écouter ».
 *
 * `ScrollTrigger.onUpdate` ne se déclenche que tant que le déclencheur est actif :
 * arriver par une ancre (#tarifs) laisserait les progressions figées et la fiche
 * dans son état d'initialisation. On publie donc le déclencheur et on lit
 * `.progress` dans la boucle, à chaque frame.
 */
export const triggers: Record<string, { progress: number } | null> = {
  hero: null,
};
