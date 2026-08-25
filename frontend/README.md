# Registre — frontend

Application Next.js (App Router, TypeScript strict). Voir [`../PRODUCT.md`](../PRODUCT.md)
§7 pour l'architecture cible complète ; ce document décrit ce qui est **réellement construit
dans ce lot** (scaffold + design system + authentification) et ce qui reste à faire.

## Ce lot en une phrase

Fondations + design system + écrans d'authentification, jusqu'à un tableau de bord *coquille*
qui prouve que l'auth fonctionne bout en bout. Aucune fonctionnalité métier (fiches, stock,
tableaux de bord réels) : c'est le périmètre des lots suivants (§4 PRODUCT.md).

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

## Choix techniques tranchés dans ce lot

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
  (`/auth/me`, `/organizations`, `/auth/organizations`) sont appelées **directement depuis le
  navigateur** vers FastAPI, avec `Authorization: Bearer <access_token>` en mémoire
  (`src/lib/api/http.ts`). Pas de proxy Next.js supplémentaire pour ces appels : le CORS du
  backend autorise déjà `http://localhost:3000` (`backend/app/core/config.py:cors_origins`).
- Pourquoi ce découpage plutôt que "tout en cookie httpOnly" : un cookie httpOnly ne peut pas
  être lu pour construire un header `Authorization`, et le backend FastAPI attend un
  `Bearer` — le faire porter par un cookie aurait exigé un proxy Next.js devant *chaque*
  endpoint métier futur (fiches, stock...). Séparer refresh (cookie httpOnly, jamais exposé)
  et access (mémoire, jamais persisté) donne la meilleure résistance XSS/CSRF sans imposer un
  proxy générique qui devra de toute façon être réévalué au fil des lots suivants.
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
  source de vérité pour l'identité (le principe "un seul endroit qui écrit une vérité donnée"
  de PRODUCT.md §5). Google Identity Services ne fait ici qu'obtenir un `id_token`, transmis
  tel quel au backend qui reste l'unique émetteur de session.

### Design system

- Jetons de thème clair/sombre en variables CSS (`src/app/globals.css`), jamais de couleur en
  dur dans les composants — principe du playbook (`--color-veil`), étendu à une palette
  "Registre" originale : encre indigo (`--primary`) pour la marque et les actions, or discret
  (`--gold`) pour les mises en avant (essai, badges), succès/avertissement/danger distincts.
  Un mot accompagne toujours une couleur d'état (PRODUCT.md §7.2) — jamais de sens porté par
  la seule teinte.
- Bascule de thème via `next-themes` (`attribute="class"`), câblée pour poser la classe sur
  `<html>` avant l'hydratation ; `suppressHydrationWarning` posé sciemment sur `<html>`
  (`src/app/layout.tsx`) pour ce cas précis, conformément au principe du playbook.
- Typographie : Plus Jakarta Sans (texte courant) + Space Grotesk (titres, moments de marque),
  chargées via `next/font/google` — auto-hébergées, aucune requête vers Google Fonts au
  runtime.
- Primitives shadcn/ui (Radix, style `radix-nova`, voir `components.json`) : bouton, champ,
  carte, dialogue, menu déroulant, select, onglets, avatar, badge, tooltip, toasts (`sonner`).
- Transitions douces avec Framer Motion sur les changements d'état (apparition des cartes
  d'auth, écran de patience), en respectant `prefers-reduced-motion` (`useReducedMotion`).

### Client API

- `src/lib/api/types.ts` : types TypeScript en miroir exact des schémas Pydantic du backend
  (`backend/app/schemas/*.py`) — à maintenir synchronisé si le backend change de forme.
- `src/lib/api/http.ts` : fetch typé vers le backend, gère les échecs réseau et HTTP de façon
  honnête (`ApiError`, jamais un succès simulé) — voir `src/lib/api/errors.ts` pour le parsing
  des erreurs FastAPI (`{"detail": ...}`, forme simple ou liste de validation Pydantic 422).
- `src/lib/countries.ts` : miroir exact de `backend/app/core/countries.py` (pays → devise) —
  à garder synchronisé pour que l'aperçu de devise affiché à l'onboarding corresponde à ce que
  l'API applique réellement.
- TanStack Query (`src/lib/api/query-provider.tsx`) pour le cache serveur (liste des
  organisations) ; React Hook Form + Zod pour tous les formulaires d'auth, avec des
  contraintes alignées sur les schémas Pydantic (longueurs, formats).

## Structure

```
src/
  app/
    (auth)/           layout dédié (logo, bascule de thème) + login, signup, onboarding
    (app)/            layout applicatif (barre supérieure, sélecteur d'organisation) + accueil
    api/auth/*/route.ts   Route Handlers = seul endroit qui touche le cookie httpOnly
    layout.tsx, providers.tsx, globals.css
  components/
    ui/               primitives shadcn/ui
    auth/             carte d'auth, bouton Google
    brand/             logo, écran de patience
    form/             enveloppe champ + erreur
    theme-toggle.tsx
  lib/
    api/              client API typé (config, http, erreurs, auth, organizations, types)
    auth/             AuthProvider (contexte React) + gardes de route
    session.ts        cookie httpOnly (refresh token) — server-only
    countries.ts, sectors.ts, roles.ts, format.ts, utils.ts
```

`(app)` est un **groupe de routes** (les parenthèses sont retirées de l'URL) : l'accueil
applicatif vit donc à `/`, pas à `/app` — cohérent avec la structure suggérée par
PRODUCT.md §7.3.

## État : fait / pas fait

**Fait**
- Projet Next.js 16 (App Router, TypeScript strict) + Tailwind v4 + shadcn/ui installés et
  configurés, `npm run build` passe.
- Design system clair/sombre, typographie, micro-transitions.
- Inscription et connexion e-mail/mot de passe, bout en bout contre le backend réel
  (`/api/v1/auth/signup`, `/auth/login`, `/auth/refresh`).
- Connexion/inscription Google fonctionnelle **si une clé cliente est fournie**, honnêtement
  désactivée sinon.
- Onboarding organisation (`POST /api/v1/auth/organizations`) avec aperçu de devise par pays.
- Sélecteur d'organisation (un utilisateur peut appartenir à plusieurs organisations, §4.4),
  menu utilisateur, déconnexion.
- Coquille de tableau de bord après connexion — délibérément vide au-delà de l'identité de
  l'organisation et du rôle, pour ne pas afficher de données inventées.

**Pas fait (hors périmètre de ce lot, volontairement)**
- Toute fonctionnalité métier : moteur de fiches, stock, échéances, notifications, recherche,
  tableaux de bord réels (lots 1 à 4, PRODUCT.md §4).
- Réinitialisation de mot de passe, 2FA, acceptation d'invitation par e-mail (pas encore
  construites côté backend non plus — voir `PRODUCT.md` §10.1).
- Palette de commandes (`⌘K`) — prévue en UX (§7.2) mais pas construite ici : rien à y mettre
  tant que les fiches/modèles n'existent pas.
- Mode hors-ligne (PWA, lot 5).
- Génération automatique du client TS depuis l'OpenAPI du backend : les types sont recopiés
  à la main dans `src/lib/api/types.ts` pour l'instant (documenté ci-dessus) plutôt que générés,
  pour ne pas ajouter une étape de build supplémentaire dans ce lot de fondations.

## Compatibilité

Mobile-first sur les écrans d'auth (formulaires en colonne unique, cible tactile ≥ 40px) tout
en restant confortable sur desktop — cahier des charges §14.5. Testé visuellement aux largeurs
courantes (téléphone, tablette, desktop) ; pas de test automatisé de compatibilité navigateur
dans ce lot.
