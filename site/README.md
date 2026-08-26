# Site vitrine — Registre

Page unique, animée au scroll, qui amène le visiteur vers l'application. Elle
suit le [playbook](../playbook.md) du dépôt ; les sections citées ci-dessous y
renvoient.

## Démarrer

```bash
npm install
npm run dev            # http://localhost:3000
```

Une seule variable, dans `.env.local` :

```
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

C'est l'adresse de l'application vers laquelle pointent tous les appels à
l'action. Elle est **figée au moment de la construction** (le site est exporté
en statique) : la changer impose de reconstruire.

## La mise en scène

Le scroll ne fait pas défiler des blocs : il **avance dans une animation**. Une
seule fiche vit derrière tout le hero, et le traverse en six états.

| Phase | Ce qui se passe |
| --- | --- |
| `gather` | Des feuillets épars convergent et s'empilent en une fiche |
| `declare` | La fiche écrit ses propres champs |
| `ripen` | L'échéance mûrit : J-30 → aujourd'hui, l'anneau se remplit |
| `alert` | L'alerte se détache et se pose sur la fiche |
| `offline` | Le réseau coupe, la file monte, puis se vide au retour |
| `library` | La caméra recule, la fiche se démultiplie en six modèles |

Les bornes vivent **uniquement** dans [`src/lib/config.ts`](src/lib/config.ts).
Régler l'animation, c'est éditer deux nombres — pas chasser dans le code.

## Où se trouve quoi

```
src/lib/config.ts          les phases et les réglages — rien de la langue
src/lib/content/fr.ts      TOUS les textes, et leur source dans le cahier des charges
src/lib/scroll-state.ts    l'état partagé et les déclencheurs publiés
src/lib/typography.ts      les espaces fines insécables (§6)
src/components/hero/
  FicheStage.tsx           l'objet unique : il sait PEINDRE un état
  Hero.tsx                 l'unique boucle de rendu : elle seule décide QUAND
src/components/sections/   les sections statiques
tests/                     la planche de captures et les tests qui regardent
```

Deux principes structurent tout le reste (playbook §3) :

- **Un seul objet.** Pas six visuels pour six moments : une fiche, six états.
- **Un seul écrivain.** `FicheStage.render()` n'a qu'un appelant, la boucle de
  `Hero.tsx`. Deux animations ne peuvent donc jamais se disputer le même objet.

## Les tests

```bash
npm run test           # les tests qui vérifient la réalité
npm run shots          # la planche de captures → tests/screenshots/
```

`npm run shots` ne vérifie rien : il produit **une image par phase, dans les
deux thèmes, sur desktop et sur mobile**. C'est l'outil de réglage — on modifie
deux nombres dans `config.ts`, on relance, **on ouvre les images**. Sur ce
projet, tous les défauts sérieux ont été trouvés là, aucun par relecture :

- un `transform` CSS silencieusement invalide, qui n'a jamais mis la scène à
  l'échelle ;
- la fiche qui recouvrait le titre ;
- un bouton portant `hidden` et qui s'affichait quand même.

`npm run test` vérifie ce qu'une capture ne voit pas : que la chronologie avance
vraiment, que le compte à rebours change, que l'indicateur hors-ligne ne ment
jamais, que le contraste tient dans les deux thèmes sur **tout** le texte de la
page, et qu'en mouvement réduit les six phases restent lisibles.

## Contenu : rien n'est inventé

Playbook §7. Aucun logo client, aucun témoignage, aucun chiffre « plausible ».
Chaque affirmation de `content/fr.ts` porte en commentaire sa source dans
`cahier-des-charges-registre.html`. Les tarifs sont ceux du §12.1, la fiche
animée reprend les exemples du §5.2 et du §8.

Trois honnêtetés sont écrites noir sur blanc plutôt qu'escamotées : les montants
sont des valeurs par défaut ajustables, le dépassement de quota ne bloque que
l'envoi de fichiers, et **il n'y a aucun paiement en ligne** — le règlement se
fait hors plateforme.

## Deux pièges déjà payés

**`@theme inline`, jamais `@theme`.** Sans `inline`, Tailwind v4 résout les
`var()` à la compilation et fige tous les utilitaires sur la dernière palette
déclarée. Le thème sombre affichait un fond sombre avec les couleurs du thème
clair, sans la moindre erreur.

**`localhost`, jamais `127.0.0.1` pour les tests.** Le serveur de développement
de Next 16 renvoie **403 sur ses propres chunks** quand la page est servie sur
`127.0.0.1` : le HTML s'affiche, rien ne s'hydrate, et chaque test échoue sur un
délai d'attente qui semble venir de l'animation.
