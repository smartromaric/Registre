# Registre — frontend

Application Next.js (App Router, TypeScript strict). Voir [`../PRODUCT.md`](../PRODUCT.md)
pour l'architecture cible complète et le détail fonctionnel du produit ; ce document décrit
ce qui est **réellement construit** côté interface, lot par lot, et ce qui reste à faire.

Ce projet a été généré avec Next.js 16.3.2, dont l'App Router diffère de ce qu'un modèle de
langage connaît par défaut de ses données d'entraînement — voir `AGENTS.md` avant de modifier
une convention de routing/structure.

## Démarrage

Prérequis : Node.js 22+, et le backend FastAPI joignable (voir `../backend/README.md`).

```bash
npm install
cp .env.example .env.local     # puis adapter au besoin
npm run dev
```

L'application tourne sur http://localhost:3000. Par défaut elle attend le backend sur
http://localhost:8000 (`NEXT_PUBLIC_API_URL`, préfixe `/api/v1` déjà géré côté client).

```bash
npm run build   # build de production — doit passer sans erreur
npm run lint    # ESLint (eslint-config-next)
```

## Variables d'environnement (`.env.local`, voir `.env.example`)

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | URL de base du backend FastAPI (sans le `/api/v1`, ajouté par `src/lib/api/config.ts`). |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Identifiant client OAuth Google (Google Identity Services). Absent → le bouton "Continuer avec Google" affiche un état "non configuré" honnête au lieu de simuler une connexion. |
| `SESSION_SECRET` | Réservé pour une future signature de cookie côté serveur (non utilisé pour l'instant : le cookie de session porte directement le refresh token émis par le backend — voir plus bas). |

## Choix techniques tranchés — fondations

### Gestion des jetons (access / refresh)

Le sujet n'était pas complètement figé dans PRODUCT.md ("cookies httpOnly si possible, sinon
un store client documenté") — voici la stratégie retenue et pourquoi :

- **Refresh token** (30 jours, `backend/app/core/config.py:refresh_token_expire_days`) : stocké
  **uniquement** dans un cookie `httpOnly` posé par nos propres Route Handlers Next.js
  (`src/app/api/auth/{signup,login,google,refresh}/route.ts`), jamais lisible par du
  JavaScript client. Portée `Path=/api/auth`, `SameSite=Lax`, `Secure` en production.
- **Access token** (24 h) : **jamais persisté** — ni cookie, ni `localStorage`. Il vit en
  mémoire dans `AuthProvider` (`src/lib/auth/auth-context.tsx`) et est reconstruit au
  chargement de l'app via `POST /api/auth/refresh`, qui lit le cookie httpOnly côté serveur
  et renvoie un nouvel access token au client dans le corps JSON (jamais le refresh token).
- Toutes les routes protégées du backend qui ne concernent pas l'émission de jetons
  (`/auth/me`, `/organizations`, fiches, stock, documents...) sont appelées **directement
  depuis le navigateur** vers FastAPI, avec `Authorization: Bearer <access_token>` en mémoire
  (`src/lib/api/http.ts`). Pas de proxy Next.js supplémentaire pour ces appels : le CORS du
  backend autorise déjà `http://localhost:3000` (`backend/app/core/config.py:cors_origins`).
- Pourquoi ce découpage plutôt que "tout en cookie httpOnly" : un cookie httpOnly ne peut pas
  être lu pour construire un header `Authorization`, et le backend FastAPI attend un
  `Bearer` — le faire porter par un cookie aurait exigé un proxy Next.js devant *chaque*
  endpoint métier. Séparer refresh (cookie httpOnly, jamais exposé) et access (mémoire,
  jamais persisté) donne la meilleure résistance XSS/CSRF sans imposer un proxy générique.
- Déconnexion : le backend est stateless (JWT signés, pas de table de sessions) — se
  déconnecter efface le cookie httpOnly et l'état en mémoire, rien d'autre à révoquer.

### Authentification Google

Intégration **réelle**, pas une simulation : le bouton "Continuer avec Google"
(`src/components/auth/google-signin-button.tsx`) charge Google Identity Services
(`accounts.google.com/gsi/client`) et récupère un vrai `id_token`, envoyé à
`POST /api/v1/auth/google` (vérifié côté backend via `google.oauth2.id_token`).

- **Si `NEXT_PUBLIC_GOOGLE_CLIENT_ID` est absent** : le composant affiche directement
  "Connexion Google non configurée sur cet environnement" — aucun script chargé, aucun faux
  bouton. C'est l'état honnête par défaut de ce dépôt (aucune clé Google réelle fournie).
  Le repli e-mail/mot de passe reste pleinement fonctionnel dans tous les cas.
- **Si elle est présente** : bouton officiel Google (`renderButton`, respecte les règles de
  marque de Google — impossible de le re-styler entièrement), qui s'adapte au thème
  clair/sombre. En cas d'échec de chargement du script (réseau, bloqueur), un message honnête
  s'affiche à la place ("Google est injoignable...").
- Le backend renvoie lui-même une erreur 503 explicite si `GOOGLE_CLIENT_ID` n'est pas
  configuré côté serveur (`GoogleNotConfiguredError`) — relayée telle quelle par
  `src/app/api/auth/google/route.ts`, jamais masquée.
- Non fait : NextAuth/Auth.js n'a pas été utilisé. Le backend émet et gère déjà ses propres
  JWT (access/refresh) ; faire porter la session par NextAuth aurait introduit une deuxième
  source de vérité pour l'identité. Google Identity Services ne fait ici qu'obtenir un
  `id_token`, transmis tel quel au backend qui reste l'unique émetteur de session.

### Design system

- Jetons de thème clair/sombre en variables CSS (`src/app/globals.css`), jamais de couleur en
  dur dans les composants — palette "Registre" originale : encre indigo (`--primary`) pour la
  marque et les actions, or discret (`--gold`) pour les mises en avant (essai, badges),
  succès/avertissement/danger distincts. Un mot accompagne toujours une couleur d'état — jamais
  de sens porté par la seule teinte.
- Bascule de thème via `next-themes` (`attribute="class"`), câblée pour poser la classe sur
  `<html>` avant l'hydratation ; `suppressHydrationWarning` posé sciemment sur `<html>`
  (`src/app/layout.tsx`) pour ce cas précis.
- Typographie : Plus Jakarta Sans (texte courant) + Space Grotesk (titres, moments de marque),
  chargées via `next/font/google` — auto-hébergées, aucune requête vers Google Fonts au
  runtime.
- Primitives shadcn/ui (Radix, style `radix-nova`, voir `components.json`).
- Transitions douces avec Framer Motion sur les changements d'état, en respectant
  `prefers-reduced-motion` (`useReducedMotion`).

### Client API

- `src/lib/api/types.ts` : types TypeScript en miroir exact des schémas Pydantic du backend
  (`backend/app/schemas/*.py`) — à maintenir synchronisé si le backend change de forme.
- `src/lib/api/http.ts` : fetch typé vers le backend, gère les échecs réseau et HTTP de façon
  honnête (`ApiError`, jamais un succès simulé) — voir `src/lib/api/errors.ts` pour le parsing
  des erreurs FastAPI (`{"detail": ...}`, forme simple ou liste de validation Pydantic 422).
- TanStack Query pour le cache serveur ; React Hook Form + Zod pour tous les formulaires,
  avec des contraintes alignées sur les schémas Pydantic (longueurs, formats).

## Choix techniques tranchés — module Stock

- **Un article de stock reste une fiche** : le panneau Stock (`components/stock/`)
  s'affiche sur l'écran de détail de fiche existant quand `model.nature ===
  "stock_item"` (`app/(app)/models/[modelId]/records/[recordId]/page.tsx`) — pas un
  second écran séparé qui dupliquerait navigation, titre, statut, documents.
- **Saisie de mouvement en quatre onglets** (entrée/sortie/ajustement/transfert,
  `components/stock/movement-dialog.tsx`) plutôt qu'un formulaire unique avec des
  champs qui apparaissent/disparaissent selon le type — chaque opération a des règles
  propres (l'ajustement exige une justification et une confirmation
  actuel/compté/écart, l'entrée exige un lot si l'article en suit, le transfert
  refuse un même dépôt aux deux bouts) plus lisibles séparées qu'agglomérées.
- **Seuils** : un seuil global de variante et ses surcharges par dépôt
  (`components/stock/variant-threshold-dialog.tsx`) sont deux entrées distinctes du
  même dialogue, jamais un seul champ ambigu — cohérent avec `ThresholdSet.depot_id`
  côté backend (`null` = global, sinon surcharge d'un dépôt précis).
- **Historique et lots paginés côté serveur** (`lib/api/stock.ts:listMovements`,
  `listLots`) — jamais tout chargé puis découpé côté client, l'historique d'un dépôt
  actif peut grossir sans limite.

## Choix techniques tranchés — moteur de fiches

- **Rendu de champ générique** (`components/fiches/field-renderer.tsx` en saisie,
  `field-value.tsx` en lecture) : les 14 types du moteur de fiches
  (`backend/app/dynamic_fields/types.py`) sont gérés de façon exhaustive par un seul
  composant à partir d'une `FieldDefinitionOut` — jamais de formulaire codé en dur par
  modèle. Un champ personnalisé ajouté par une organisation obtient automatiquement le bon
  contrôle de saisie, sans code frontend supplémentaire.
- **Constructeur de modèles** (`app/(app)/models/new`, `.../[modelId]/settings`) : création
  d'un modèle et de ses champs, puis modification/suppression/réorganisation des champs déjà
  enregistrés (`components/fiches/existing-field-list.tsx`), branché sur les routes
  `PATCH`/`DELETE`/`PUT .../reorder` de `model-definitions`. La clé technique et le type d'un
  champ existant restent verrouillés dans l'éditeur (`lockKey`) : les fiches déjà écrites
  portent leurs valeurs sous cette clé et sous cette forme, les renommer romprait
  silencieusement les données existantes — même règle appliquée côté backend.
- **Documents et photos** : une pièce jointe reste consultable et ouvrable depuis une fiche à
  tout moment, même longtemps après le téléversement — son URL signée est relue à chaque
  affichage (`getDocument`/`listDocuments` dans `lib/api/documents.ts`) plutôt que mise en
  cache avec expiration devinée côté client. `lib/documents-cache.ts` ne sert plus qu'à
  afficher le nom d'un fichier immédiatement après son propre téléversement, dans la même
  session d'édition (confort d'affichage, jamais une source de vérité).
- **Bibliothèque de modèles** (`app/(app)/models/library`) : active un modèle prêt à l'emploi
  (Véhicule, Personnel, Extincteur, Contrat, Stock de gaz, Vêtements) en un clic.

## Structure

```
src/
  app/
    (auth)/            connexion, inscription, onboarding organisation
    (app)/              coquille applicative connectée (nav, sélecteur d'org)
      models/            constructeur et bibliothèque de modèles, réglages
      models/[id]/records/  création et édition de fiches
      depots/              gestion des dépôts (module Stock)
      r/[recordId]/       lien court vers le détail d'une fiche
    api/auth/*/route.ts   Route Handlers = seul endroit qui touche le cookie httpOnly
    layout.tsx, providers.tsx, globals.css
  components/
    ui/                 primitives shadcn/ui
    auth/, brand/, form/ écrans d'authentification et éléments de marque
    fiches/              moteur de rendu des champs dynamiques (saisie + lecture),
                         constructeur de modèle, éditeur/liste de champs, documents
    stock/                panneau Stock d'une fiche article, saisie de mouvement,
                         seuils, lots, consignation, dépôts
    data-table.tsx, state-views.tsx, app-nav.tsx, command-palette.tsx
  lib/
    api/                client HTTP par domaine (auth, organizations, model-definitions,
                         records, documents, stock) — chaque fonction lève `ApiError`
    auth/               AuthProvider (contexte React) + gardes de route
    session.ts          cookie httpOnly (refresh token) — server-only
    countries.ts, sectors.ts, roles.ts, format.ts, utils.ts, due-date-status.ts, ...
```

`(app)` et `(auth)` sont des **groupes de routes** (les parenthèses sont retirées de l'URL).

## État : fait / pas fait

**Fait**
- Projet Next.js 16 (App Router, TypeScript strict) + Tailwind v4 + shadcn/ui installés et
  configurés, `npm run build` et `npm run lint` passent.
- Design system clair/sombre, typographie, micro-transitions.
- Inscription et connexion e-mail/mot de passe, connexion/inscription Google (si clé fournie),
  onboarding organisation, sélecteur d'organisation, coquille applicative.
- **Moteur de fiches** : constructeur de modèles (création, modification, suppression et
  réorganisation de champs après coup), formulaire dynamique pour les 14 types de champ,
  liste et détail de fiche, événements datés, bibliothèque de modèles, documents/photos avec
  relecture à tout moment.
- **Module Stock** : dépôts, configuration d'article (unité, prix, lots, consignation,
  variantes), saisie de mouvement (entrée/sortie/ajustement/transfert), seuils
  globaux et par dépôt, historique paginé, lots et péremption, consignation.

**Pas fait (hors périmètre à ce stade, volontairement)**
- Tableaux de bord — vue globale puis focalisable par modèle (cahier des charges §10.2) ;
  le backend est prêt (PRODUCT.md §10.4), l'écran reste à construire.
- Écrans d'abonnement/espace éditeur.
- Mode hors-ligne (PWA, lot 5).
- Réinitialisation de mot de passe, 2FA, acceptation d'invitation par e-mail (pas encore
  construites côté backend non plus).
- Type de champ « Lien vers une fiche » : saisie par UUID brut, pas encore de sélecteur
  visuel. Type « Code » : saisie manuelle seulement, pas encore de scan par caméra.
- Aucun garde-fou de type « modifications non enregistrées » sur les formulaires.
- Génération automatique du client TS depuis l'OpenAPI du backend : les types sont recopiés
  à la main dans `src/lib/api/types.ts` pour l'instant.

## Compatibilité

Mobile-first sur les écrans d'auth et de saisie (formulaires en colonne unique, cible tactile
≥ 40px) tout en restant confortable sur desktop — cahier des charges §14.5. Testé visuellement
aux largeurs courantes (téléphone, tablette, desktop) ; pas de test automatisé de compatibilité
navigateur.
