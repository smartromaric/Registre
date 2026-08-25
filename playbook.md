# Playbook — sites vitrines animés au scroll

Ce document est le contexte à déposer dans un nouveau dépôt pour retrouver le
niveau d'Up Maps. Il ne liste pas des outils : il liste les **décisions
d'architecture** et les **pièges** qui coûtent une demi-journée chacun.

Copiez-le à la racine du nouveau projet sous le nom `AGENTS.md` (ou
`CLAUDE.md`), en remplaçant la section « Le projet » par le vôtre.

---

## 1. Le prompt d'amorçage

À coller au premier message, en remplaçant ce qui est entre crochets.

> Je veux un site vitrine pour **[produit]**, **[une phrase : ce que c'est, pour
> qui, dans quelle ville ou quel marché]**.
>
> Le hero doit être une **séquence narrative pilotée au scroll** : le scroll ne
> fait pas défiler des blocs, il avance dans une animation. Décris-moi le
> déroulé que tu proposes, phase par phase, avant d'écrire la moindre ligne —
> je veux valider la mise en scène d'abord.
>
> Contraintes non négociables :
> - Aucune donnée inventée. Pas de logos clients, pas de témoignages, pas de
>   chiffres plausibles. Si une section en demande, laisse un marqueur explicite
>   et dis-le-moi.
> - Les états d'échec sont honnêtes. Un formulaire non branché doit le dire, pas
>   afficher un faux accusé d'envoi.
> - Écris des tests qui **regardent** le résultat, pas seulement qui compilent.
>   Génère une planche de captures et ouvre-la.
> - Signale-moi tout ce que tu ne peux pas vérifier toi-même.
>
> Stack : Next.js App Router, TypeScript, Tailwind v4, GSAP ScrollTrigger,
> Lenis, Playwright. **[MapLibre si carte / Three.js si 3D / rien sinon]**.

Le point qui change tout : **demander le déroulé avant le code**. Une mise en
scène validée en trois paragraphes évite deux jours de réglages à l'aveugle.

---

## 2. La stack, et pourquoi

| Outil | Rôle | Pourquoi celui-là |
| --- | --- | --- |
| Next.js App Router | Rendu statique + routes API | Le prérendu sert le contenu aux moteurs, les routes API branchent un formulaire sans serveur séparé |
| Tailwind v4 | Style | `@theme` génère des variables CSS : redéfinir un jeton fait basculer tout le site |
| GSAP + ScrollTrigger | Chronologie | Le seul qui gère proprement l'épinglage et le scrub |
| Lenis | Scroll lissé | Se branche sur le ticker GSAP : scrub et rendu tombent sur la même frame |
| MapLibre GL | Carte | Libre, projection globe native, pas de clé d'API obligatoire |
| Playwright | Tests | Le seul qui permet de **piloter le scroll et regarder le rendu** |

Lenis se branche dans le ticker GSAP, jamais en parallèle :

```ts
const lenis = new Lenis({ lerp: 0.085 });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

---

## 3. Sept principes d'architecture

### Un seul objet, plusieurs états

Ne créez pas trois visuels pour trois moments. Créez **un objet** et déplacez-le.
Sur Up Maps, une seule instance MapLibre vit derrière toute la page : le
téléphone, le survol de la ville et le globe sont trois états de la même caméra.
C'est ce qui donne l'impression d'un plan-séquence — et ça coûte moins cher que
trois composants.

### Un seul écrivain

Un objet animé n'a qu'un seul écrivain. Sur Up Maps, une unique boucle de rendu
appelle `map.jumpTo()` une fois par frame. Toutes les autres sections ne font
que **déposer leur progression** dans un état partagé. Deux animations ne
peuvent donc jamais se disputer le même objet.

```ts
// lib/scroll-state.ts — l'état partagé, sans framework
export const scrollState = { hero: 0, globe: 0, explore: 0 };
```

### Lire la progression, ne pas l'écouter

**`ScrollTrigger.onUpdate` ne se déclenche que tant que le déclencheur est
actif.** Sauter directement à une ancre laisse donc les progressions figées, et
l'objet reste dans son état d'initialisation. Publiez les déclencheurs et lisez
`.progress` dans la boucle, à chaque frame :

```ts
export const triggers: Record<string, { progress: number } | null> = {};
// dans la boucle de rendu :
if (triggers.hero) scrollState.hero = triggers.hero.progress;
```

### Le scroll pilote, il ne joue pas

Pas de `<video autoplay>`. La position du scroll est une **variable d'entrée**
qui calcule un état. Découpez la chronologie en phases nommées, dans un seul
fichier de configuration :

```ts
export const PHASES = {
  typing: [0.05, 0.17],
  pin:    [0.22, 0.30],
  open:   [0.31, 0.44],
  tour:   [0.44, 0.74],
} as const;
```

Régler l'animation devient alors une édition de deux nombres, pas une chasse
dans le code.

### Séparer ce qui est de la langue

Dès le départ, deux fichiers : la **configuration** (coordonnées, phases,
réglages) et les **textes**. Le français fait référence, les autres langues
doivent avoir exactement sa forme :

```ts
// lib/content/types.ts
export type Content = typeof fr;
// lib/content/en.ts
export const en: Content = { … }; // TypeScript refuse toute clé manquante
```

Bascule côté client, sans changement d'URL, quand la page est une expérience
continue : des routes par langue rechargeraient tout et remettraient l'animation
au début. Le prix à connaître : seule la langue prérendue est indexée.

### Un jeton pour le thème

Un thème clair ne s'ajoute pas à la fin en repeignant cent classes. Définissez
dès le départ un jeton pour **la couleur des voiles et des filets** :

```css
@theme { --color-veil: #ffffff; }          /* fond sombre */
:root[data-theme="light"] { --color-veil: #0c1320; }  /* fond clair */
```

Puis n'écrivez plus jamais `bg-white/10` : écrivez `bg-veil/10`. Redéfinir cette
seule variable fait basculer la page entière. Posez le thème par un script
inline **avant l'hydratation**, avec `suppressHydrationWarning` sur `<html>`.

### Les états d'échec sont honnêtes

Un formulaire dont la réception n'est pas branchée doit **le dire** et renvoyer
vers l'e-mail direct. Jamais un faux « message envoyé ».

```ts
const webhook = process.env.CONTACT_WEBHOOK_URL;
if (!webhook) return Response.json({ code: "not_configured" }, { status: 503 });
```

---

## 4. La méthode : des tests qui regardent

C'est le point qui sépare un site correct d'un site fini. **Sans navigateur, on
code à l'aveugle.** Sur Up Maps, tous les défauts sérieux ont été trouvés par les
tests, aucun par relecture.

### La planche de captures

Un test qui ne vérifie rien, mais produit une image par moment clé :

```ts
for (const frame of FRAMES) {
  await scrollHeroTo(page, frame.progress);
  await page.screenshot({ path: `tests/screenshots/${frame.name}.png` });
}
```

C'est l'outil de réglage : on modifie deux nombres, on relance, **on ouvre les
images**. Ajoutez-y une passe dans le second thème et sur un contexte tactile —
c'est là que se cachent les défauts.

### Exposer l'état pour pouvoir l'assert

```ts
// lib/debug.ts — ni secret, ni coûteux
export function expose(key: string, value: unknown) { … } // → window.__upmap
```

Les tests peuvent alors vérifier la **réalité** : zoom de la caméra, longueur de
la trace, opacité effective, luminance d'une surface face à son texte.

### Reproduire avant de corriger

Quand un défaut est signalé, écrivez d'abord le test qui le rejoue dans les deux
contextes. Deux fois sur ce projet, la reproduction a montré que la cause n'était
pas celle qu'on supposait. Ne devinez jamais : mesurez.

```ts
const state = await page.evaluate(() => ({
  finePointer: matchMedia("(hover: hover) and (pointer: fine)").matches,
  zoom: window.__upmap.map.getZoom(),
}));
```

---

## 5. Les pièges qui coûtent une demi-journée

### La CSS d'une librairie bat vos utilitaires

Tailwind v4 met ses utilitaires dans `@layer utilities`. **Toute CSS hors layer
les bat**, quelle que soit la spécificité. MapLibre pose `.maplibregl-map`
(`position: relative`) sur le conteneur : le `absolute inset-0` est ignoré, la
hauteur tombe à zéro, et la carte se charge **sans jamais rien afficher**.

Le remède : une classe hors layer, déclarée après la feuille de la librairie, à
appliquer systématiquement.

```css
.up-map-fill { position: absolute; inset: 0; width: 100%; height: 100%; }
```

Ce piège s'est représenté à l'identique deux mois plus tard sur une seconde
carte. Écrivez la règle **et la consigne**.

### `position: sticky` crée un contexte d'empilement

Un enfant en `z-30` d'un conteneur `sticky` ne passera jamais au-dessus d'un
élément `fixed` en `z-20` : son `z-index` est prisonnier du contexte. C'est le
conteneur `sticky` qu'il faut monter, en le laissant `pointer-events: none` pour
que les gestes atteignent ce qu'il y a derrière.

### Une animation continue écrase les gestes

Une rotation lente qui réécrit la caméra à chaque frame annule aussi bien un
glissement qu'un vol de caméra — le tout **sans erreur**, l'objet paraît
simplement mort. Coupez l'animation dès `mousedown`, pas sur `dragstart` : à ce
moment-là le geste a déjà commencé.

### `pointer: fine` exclut la moitié des visiteurs

Conditionner une reprise en main à `(pointer: fine)` désactive la fonction sur
téléphone et tablette. Séparez deux notions :

- **la zone est active** — vrai sur tous les appareils, autorise les boutons ;
- **les gestes directs sont permis** — réservé au pointeur fin.

Sur tactile, un glissement doit rester un défilement de page. Ne piégez jamais
l'utilisateur dans un objet manipulable.

### Une surface figée sous un texte qui bascule

Un fond écrit en dur (`bg-[#0a0f17]`) sous un texte qui suit le thème donne du
sombre sur sombre. Tout ce qui porte du texte doit basculer avec lui. Un test qui
mesure l'écart de luminance entre la surface et son texte, **dans les deux
thèmes**, est le seul garde-fou fiable.

### Ni `styledata` ni `idle` ne disent qu'un style est prêt

Le premier peut se déclencher avant le parsing et ne jamais revenir ; le second
n'arrive pas tant que des ressources chargent. Sondez, avec une borne :

```ts
export function whenReady(check: () => boolean, run: () => void, max = 100) {
  let n = 0;
  const tick = () => (check() ? run() : ++n <= max && setTimeout(tick, 100));
  tick();
}
```

### Le worker d'une librairie sous Turbopack

MapLibre 6 déduit l'URL de son worker de `import.meta.url` ; après passage dans
un bundler, ce n'est plus une URL `http(s)` et `new Worker("")` échoue **en
silence**. Servez le worker depuis `public/` via un script `prebuild`. La leçon
générale : quand une librairie se charge sans erreur mais ne fait rien,
**suspectez son worker**.

---

## 6. Les barres de qualité

Non négociables, à vérifier avant de livrer.

**Accessibilité.** Une fenêtre modale se fait avec `<dialog>` natif : focus
piégé, Échap et fond inerte viennent du navigateur. Un `<footer>` imbriqué dans
`<main>` ne porte pas le rôle `contentinfo`. Les liens qui n'en sont pas doivent
être des `<button>`.

**Mouvement réduit.** `prefers-reduced-motion` n'est pas une option : prévoyez
un état statique lisible pour chaque phase.

**Performance.** Créez les objets lourds à l'entrée dans l'écran
(`IntersectionObserver`), et **coupez leur animation quand ils en sortent**. Une
sphère qui tourne hors écran coûte le même GPU qu'à l'écran.

**Typographie française.** Espaces fines insécables dans les guillemets (`« … »`),
sinon le chevron fermant tombe seul en début de ligne. Relisez les accords.

**Attribution.** Un fond cartographique libre impose une mention. Vérifiez les
conditions pour un usage commercial avant la mise en ligne.

---

## 7. Ce qu'il ne faut pas tenter

**Dessiner un humain en SVG.** Trois tentatives de main sur ce projet, trois
échecs — le résultat ressemblait successivement à des blobs, une cuillère et une
patate. Une main plate se lit comme une tache. Remplacez le signifiant : une
**onde de tap** sur l'élément sélectionné dit « quelqu'un a touché l'écran »
sans rien dessiner d'anatomique. Les formes géométriques et abstraites, elles,
marchent très bien.

**Générer la vidéo par IA sans préparation.** Les mains et les écrans sont ce
que les modèles ratent le plus. Si vidéo il y a : plan fixe, écran vert, et
l'interface incrustée en post — jamais générée. Et pour un scroll, exportez une
**séquence d'images**, pas un MP4 : le rembobinage image par image saccade sur
Safari.

**Inventer du contenu.** Logos clients, témoignages, chiffres « plausibles » :
jamais. Une section sans contenu réel se signale, ou ne se fait pas.

---

## 8. Le fichier à copier

Structure de départ qui a fait ses preuves :

```
lib/
  config.ts          coordonnées, phases, réglages caméra — rien de la langue
  content/           fr.ts (référence), en.ts, types.ts
  scroll-state.ts    l'état partagé + les déclencheurs publiés
  <domaine>-*.ts     helpers du domaine (geo, layers, explorer…)
components/
  <Objet>Stage.tsx   l'objet unique, en position fixed
  hero/Hero.tsx      l'unique boucle de rendu
  sections/          les sections statiques
tests/
  helpers.ts         boot, scroll par progression, lecture d'état
  screenshots.spec.ts  la planche de contrôle
docs/playbook.md     ce document
```
