/**
 * Point d'entrée du contenu.
 *
 * Le français fait référence — playbook §3 : une seconde langue devrait avoir
 * exactement la forme de `Content`, TypeScript refusant alors toute clé
 * manquante. Aucune n'est écrite pour l'instant : le marché visé est
 * francophone, et une traduction à moitié faite est pire que pas de traduction.
 */
export { fr as content } from "./fr";
export type { Content } from "./fr";
