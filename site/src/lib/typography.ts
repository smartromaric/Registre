/**
 * Typographie française — playbook §6.
 *
 * « Espaces fines insécables dans les guillemets, sinon le chevron fermant tombe
 * seul en début de ligne. » La règle vaut aussi pour la ponctuation double et
 * pour les groupes de milliers : « 45 000 FCFA » coupé en fin de ligne donne
 * « 45 » puis « 000 FCFA », ce qui est illisible dans une grille tarifaire.
 *
 * Un seul endroit connaît la règle, et un test la vérifie. L'alternative — poser
 * les caractères à la main dans le fichier de contenu — était intenable : ces
 * espaces sont *invisibles* à la relecture, donc jamais maintenues.
 */

/** U+202F, espace fine insécable : guillemets et ponctuation double. */
const NARROW = "\u202f";
/** U+00A0, espace insécable : deux-points, unités, groupes de milliers. */
const NBSP = "\u00a0";

/** Toute espace, y compris celles déjà insécables — pour rester idempotent. */
const SP = "[\s\u00a0\u202f]";

export function typo(text: string): string {
  return (
    text
      // Guillemets français : la fine se pose à l'intérieur des chevrons.
      .replace(new RegExp("«" + SP + "*", "g"), "«" + NARROW)
      .replace(new RegExp(SP + "*»", "g"), NARROW + "»")
      // Ponctuation double : fine avant ; ! ?, insécable pleine avant les deux-points.
      .replace(new RegExp(SP + "+([;!?])", "g"), NARROW + "$1")
      .replace(new RegExp(SP + "+:", "g"), NBSP + ":")
      // Groupes de milliers : « 45 000 » ne doit jamais se couper.
      .replace(/(\d)[\s\u00a0]+(?=\d{3}\b)/g, "$1" + NBSP)
      // Une unité ne se sépare pas de son nombre. Le pourcentage est traité à
      // part : `\b` ne se pose pas après « % » — deux caractères non
      // alphanumériques de suite ne forment pas de frontière de mot — et la
      // règle y resterait donc muette.
      .replace(/(\d)[\s\u00a0]+%/g, "$1" + NBSP + "%")
      .replace(/(\d)[\s\u00a0]+(Go|Mo|Ko|km|FCFA|jours|mois)\b/g, "$1" + NBSP + "$2")
  );
}
