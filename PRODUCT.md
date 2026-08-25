# Registre — fiche produit et architecture

> Document vivant. Source de vérité fonctionnelle : [`cahier-des-charges-registre.html`](./cahier-des-charges-registre.html) v0.2 (24 août 2026).
> Ce document traduit le cahier des charges en décisions d'architecture et en état d'avancement. Il est mis à jour à chaque lot livré — voir §10.

---

## 1. Pitch

Les entreprises visées gèrent aujourd'hui leur parc et leurs stocks sur des
cahiers, des classeurs et des fichiers Excel dispersés. Registre n'est pas un
logiciel par métier (« parc automobile », « stock de gaz »...) : c'est un
**socle unique** dans lequel chaque entreprise déclare ce qu'elle suit, et se
fait prévenir avant qu'une échéance ne tombe ou qu'un stock ne s'épuise. Une
bibliothèque de modèles prêts à l'emploi évite l'effet page blanche.

Marché initial : PME d'Afrique de l'Ouest/Centrale (le cas d'usage de
référence est une entreprise de transport à Douala — voir cahier des charges
§18). Conséquences directes sur les choix techniques : réseau mobile
intermittent (→ mode hors-ligne non négociable), téléphones d'entrée de gamme
(→ budget de performance strict), devise et fuseau horaire par organisation.

## 2. Utilisateurs et rôles

Cinq rôles, cloisonnés par organisation (une organisation = une entreprise
cliente = une unité d'abonnement) :

| Rôle | Résumé |
| --- | --- |
| Éditeur | Exploite le service (offres, prix, quotas, organisations). Aucun accès par défaut aux données métier des clients. |
| Administrateur d'organisation | Dirigeant / responsable IT du client. Modèles de fiche, utilisateurs, abonnement. |
| Gestionnaire | Responsable d'un domaine (chef de parc, responsable dépôt). CRUD sur ses fiches, reçoit les alertes. |
| Opérateur | Agent de terrain. Mouvements de stock, photos, champs autorisés. |
| Lecteur | Consultation et export seuls. |

Détail de la matrice des droits : cahier des charges §4.2. Le réglage
« partiel »/« option » est piloté modèle par modèle et champ par champ par
l'administrateur — voir §7.3 plus bas (moteur de permissions).

## 3. Vocabulaire

Voir cahier des charges §3 — Organisation, Modèle de fiche, Fiche, Champ,
Échéance, Article, Variante, Dépôt, Mouvement, Alerte, Offre. Ces mots sont
les noms des entités du modèle de données ci-dessous ; ne pas les renommer en
cours de route (ni dans le code, ni dans l'UI).

## 4. Périmètre et priorités de construction

Le cahier des charges découpe le travail en 7 lots (§16). Ce document en garde
la structure comme feuille de route (§10), avec un ordre légèrement réordonné
pour construire des fondations solides avant l'UI :

1. **Lot 0 — Fondations** : auth, organisations cloisonnées (RLS), rôles, stockage fichiers, journal d'audit.
2. **Lot 1 — Moteur de fiches & actifs suivis** : modèles configurables, tous les types de champs, échéances, événements, notifications, modèle Véhicule.
3. **Lot 2 — Stock** : articles, variantes, dépôts, mouvements, seuils, lots/péremption, consignation.
4. **Lot 3 — Exploitation** : recherche, filtres, vues enregistrées, import/export, tableaux de bord (globaux puis focalisables §10.2).
5. **Lot 4 — Abonnements & espace éditeur** : offres, quotas, devises, cycle de vie, encaissement manuel, factures.
6. **Lot 5 — Hors-ligne** : PWA, base locale, file d'opérations, synchronisation.
7. **Lot 6 — WhatsApp** : hors périmètre v1 ; le moteur de notifications est conçu pour l'accueillir sans réécriture (§8.6).

### Décisions prises sur les points laissés ouverts (cahier des charges §17.2)

Le cahier des charges liste six questions encore ouvertes côté client. Pour ne
pas bloquer la construction, les hypothèses de travail suivantes sont
retenues — **à confirmer avec le client**, sans impact structurant si la
réponse change :

| Réf. | Question | Hypothèse retenue ici |
| --- | --- | --- |
| Q1 | Nom définitif | On garde « Registre » comme nom de travail dans le code et l'UI. |
| Q6 | Volumes à un an | Dimensionné pour ~50 000 fiches et ~500 000 mouvements de stock par organisation et par an (borne haute raisonnable pour une PME). Index et pagination conçus en conséquence (§14.3). |
| Q7 | Modèle Personnel + consignes nominatives | Modèle Personnel **inclus** (déjà dans la bibliothèque §5.6) avec les protections §14.6 (durée de conservation déclarée, accès par rôle, export/effacement à la demande). Consignes : **compteurs globaux par dépôt uniquement**, pas de fichier client nominatif (c'est déjà la position par défaut du cahier des charges §7.6). |
| Q9 | Profondeur du hors-ligne | Le découpage proposé au §11.2 est adopté tel quel comme périmètre v1. |
| Q10 | Qui valide, sous quel délai | Sans objet pour la construction ; chaque lot livre un scénario de recette écrit (§16.1) que le client déroule quand il le souhaite. |
| Q11 | Stockage supplémentaire à la demande | Non construit en v1 (pas d'achat de Go hors changement d'offre). Le modèle `Offer` est conçu pour accueillir un add-on plus tard sans migration de rupture. |

## 5. Architecture générale

Monorepo à deux applications, séparées par un contrat d'API explicite (OpenAPI
généré par FastAPI, consommé par un client TypeScript généré côté frontend) :

```
Registre/
  backend/     API FastAPI — voir backend/README.md
  frontend/    Application Next.js — voir frontend/README.md
  docs/        Manuel utilisateur, notes complémentaires
  docker-compose.yml   Postgres, Redis, MinIO pour le dev local
  PRODUCT.md   ce document
```

Principe directeur (hérité du playbook joint, généralisé au-delà du site
vitrine) : **un seul endroit qui écrit une vérité donnée**. Le cloisonnement
multi-organisation n'est jamais délégué à la vigilance d'un développeur qui
n'oublierait pas un `WHERE organization_id = ...` : il est appliqué **au
niveau de la base** (Postgres Row-Level Security), donc impossible à
contourner par une route mal écrite. Voir §6.3.

## 6. Backend

### 6.1 Stack

| Brique | Choix | Raison |
| --- | --- | --- |
| Langage / framework | Python 3.13, FastAPI | Typé, async, OpenAPI généré automatiquement (→ client TS frontend) |
| ORM | SQLAlchemy 2 (async) + asyncpg | Contrôle fin du SQL généré, nécessaire pour la RLS et les index JSONB |
| Base de données | PostgreSQL 16 | RLS native, JSONB indexable (GIN), fiable pour l'auditabilité |
| Migrations | Alembic | Standard, versionné avec le code |
| Files d'attente / tâches planifiées | Celery + Redis | Balayage nocturne des échéances (§8.2), envoi de notifications, compression différée |
| Fichiers | Stockage objet compatible S3 (MinIO en dev) | Séparé de la base, liens signés à courte durée (§14.1) |
| Auth | Google OAuth2 (Authlib) + e-mail/mot de passe (passlib bcrypt) + JWT | Chemin principal sans mot de passe (§4.4) |
| Tests | pytest, pytest-asyncio, httpx | Cloisonnement, idempotence des alertes, additivité des mouvements testés en priorité (§16.1) |

### 6.2 Architecture en couches

```
backend/app/
  core/            config, sécurité, session DB, dépendances FastAPI
  models/          entités SQLAlchemy (une source de vérité du schéma)
  schemas/         contrats Pydantic entrée/sortie (jamais les models exposés tels quels)
  repositories/    accès aux données ; seule couche qui touche la session SQLAlchemy
  services/        règles métier ; orchestrent les repositories, ignorent HTTP
  api/v1/routers/  couche HTTP fine : validation, appel service, sérialisation
  dynamic_fields/  moteur de modèles/champs configurables (le cœur du produit, §5)
  alerts/          moteur d'échéances et de seuils (§8)
  notifications/   intentions + porteurs interchangeables (§8.6)
  tasks/           tâches Celery planifiées
  seeds/           bibliothèque de modèles prêts à l'emploi (§5.6)
```

Règle stricte : une route API ne parle jamais directement à SQLAlchemy. Ça
garde le cloisonnement et les règles métier testables sans serveur HTTP.

### 6.3 Cloisonnement multi-organisation

Chaque table métier porte une colonne `organization_id`. Une politique RLS
Postgres (`USING (organization_id = current_setting('app.current_org_id')::uuid)`)
est active sur ces tables. La dépendance FastAPI d'authentification exécute
`SET LOCAL app.current_org_id = ...` au début de chaque requête, dans la même
transaction que la requête métier. Conséquence : même une requête mal écrite
dans un service ne peut pas lire les données d'une autre organisation — la
garantie est dans la base, pas dans la relecture de code (cahier des charges
§14.1, testé par `test_tenant_isolation.py`).

### 6.4 Le moteur de fiches (cœur du produit, §5)

Modèle hybride, comme prescrit au §15 du cahier des charges :

- `model_definitions` / `field_definitions` : le gabarit qu'un administrateur
  configure (nom, icône, nature `asset` ou `stock_item`, liste de champs,
  colonnes de la vue liste, rôles autorisés).
- `records` (les fiches) : colonnes fixes du socle (statut, affectation,
  horodatage, organisation) + colonne `data JSONB` pour les champs
  personnalisés, avec index GIN sur les chemins marqués « filtrable ».
- Le type de champ **Échéance** est un objet composite (date de fin,
  justificatif, règle de rappel) et non une simple date : c'est lui qui
  alimente le moteur d'alertes (§8) et se referme tout seul au renouvellement
  (§5.4).
- Six modèles prêts à l'emploi sont semés à la création d'une organisation
  (`app/seeds/templates.py`) : Véhicule, Stock de gaz, Vêtements, Personnel,
  Extincteur, Contrat. Activer un modèle en fait une copie propre à
  l'organisation (plus de lien vers l'original), conformément au §5.6.

### 6.5 Moteur d'échéances et de notifications (§8)

- Une tâche Celery Beat par organisation (fuseau horaire propre) balaie
  échéances, seuils de stock et lots. Elle est **idempotente** : rejouée deux
  fois le même jour, elle ne duplique aucune alerte (clé d'unicité
  `(source_type, source_id, palier)`).
- Cycle de vie d'une alerte : `émise → acquittée | reportée → résolue`
  (résolution automatique dès que la cause disparaît).
- Le moteur ne connaît pas le canal : il produit une **intention de
  notification** (destinataire, gabarit, données, priorité), consommée par des
  porteurs interchangeables (`InAppCarrier`, `EmailCarrier` en v1,
  `WhatsAppCarrier` stub prêt pour le lot 6 — §8.6).
- Regroupement : toutes les alertes du jour pour un même destinataire partent
  en un seul envoi (§8.4), jamais en rafale.

### 6.6 Stock (§7)

Un mouvement de stock est **immuable et additif** — jamais modifié, corrigé
par un mouvement inverse. C'est ce qui rend le stock auditable et rend la
synchronisation hors-ligne possible sans conflit (deux agents qui sortent du
stock hors-ligne s'additionnent, ne s'écrasent jamais — cahier des charges
§7.3, §11.3, §11.4). Cette contrainte est posée dès le lot 0 même si le
hors-ligne n'arrive qu'au lot 5, pour ne pas avoir à réécrire le socle plus
tard.

### 6.7 Abonnements (§12)

`Offer` (durée, prix par devise, quota de stockage, nombre d'utilisateurs) →
`Subscription` (état : essai, actif, avant expiration, lecture seule,
suspendu, archivé) → `Payment` (enregistrement manuel par l'éditeur en v1,
conçu pour accueillir un opérateur de paiement mobile plus tard sans
réécriture — §12.4). Un défaut de paiement ne supprime jamais de données : il
fait seulement passer l'organisation en lecture seule puis en suspension,
selon les durées configurables par l'éditeur (§12.3).

## 7. Frontend

### 7.1 Stack

Next.js (App Router) + TypeScript, Tailwind CSS (jetons de thème clair/sombre
posés dès le départ, §3 du playbook joint — jamais de couleur en dur),
shadcn/ui (Radix — accessibilité gratuite : focus piégé, `<dialog>` natif),
Framer Motion pour les transitions (changement de focalisation d'un tableau de
bord, centre de notifications), TanStack Query (cache serveur) + TanStack
Table (listes de 10 000 fiches, §14.3), React Hook Form + Zod pour les
formulaires **générés dynamiquement à partir des définitions de champs**
(le formulaire de saisie d'une fiche n'est jamais codé en dur : il est produit
par le même moteur de rendu quel que soit le modèle).

### 7.2 Direction UX

- **Page d'accueil = « qu'est-ce qui demande mon attention aujourd'hui »**, pas
  un mur de chiffres (§10.1).
- **Tout indicateur est cliquable** (§10.5) — aucun chiffre mort.
- **L'état ne dépend jamais de la seule couleur** — un mot accompagne toujours
  une pastille (§10.5), pour rester lisible en noir et blanc et par les
  utilisateurs daltoniens.
- **Palette de commandes** (`⌘K` / `Ctrl K`) pour aller à une fiche, un
  modèle, un dépôt sans naviguer à la souris — le produit est aussi utilisé
  par des gestionnaires qui vivent au clavier.
- **États d'échec honnêtes** (principe du playbook joint, généralisé) : pas de
  faux « synchronisé » quand une opération est encore en file, pas de faux
  succès sur un envoi qui a échoué.
- **Mobile-first sur les écrans de saisie terrain**, desktop-first sur les
  écrans de configuration et d'analyse (§14.5).

### 7.3 Structure

```
frontend/src/
  app/                routes (App Router), groupées par contexte : (auth)/, (app)/, (editor)/
  components/ui/      primitives shadcn/ui + jetons de design
  components/         composants métier (FicheForm, DashboardTile, AlertCenter...)
  lib/api/            client généré depuis l'OpenAPI du backend
  lib/                utilitaires, état partagé, hooks
```

## 8. Sécurité et conformité (§14)

- HTTPS obligatoire sans exception.
- Comptes Google : aucun mot de passe créé ni stocké.
- Comptes e-mail : mots de passe en empreinte (bcrypt), 2FA optionnelle pour
  les administrateurs.
- Documents/photos jamais servis publiquement — liens signés à courte durée.
- Journal d'audit non modifiable (auteur, date, ancienne/nouvelle valeur) sur
  toute création/modification/suppression/export.
- Éditeur sans accès par défaut aux données client ; toute intervention de
  support exige une autorisation explicite et limitée dans le temps de
  l'administrateur, tracée dans le journal de l'organisation (§4.3).

## 9. Méthode de test

Directement inspirée du playbook joint, généralisée à une application
métier : **sans preuve qui regarde le résultat, on livre à l'aveugle.**

- Trois familles de tests existent dès le lot 0, avant tout le reste :
  cloisonnement inter-organisations, rejouabilité du moteur d'alertes,
  additivité des mouvements de stock sous conflit hors-ligne simulé.
- Aucune donnée inventée dans les jeux de démo au-delà de ce qui est
  explicitement marqué comme tel (pas de faux témoignage, pas de faux
  montant présenté comme réel).
- Un test qui compile n'est pas un test qui prouve quelque chose : les tests
  d'API vérifient l'état réellement écrit en base, pas seulement le code HTTP
  de la réponse.

## 10. Feuille de route et état d'avancement

Mis à jour à chaque commit de lot. Statuts : ⬜ à faire · 🔶 en cours · ✅ fait.

| Lot | Contenu | Statut |
| --- | --- | --- |
| 0 | Fondations (auth, orgs cloisonnées/RLS, rôles, stockage fichiers, journal d'audit) | ✅ |
| 1 | Moteur de fiches, actifs suivis, échéances, notifications, modèle Véhicule | ✅ |
| 2 | Stock (articles, variantes, dépôts, mouvements, seuils, lots, consignation) | ✅ |
| 3 | Recherche, vues, import/export, tableaux de bord focalisables | ✅ |
| 4 | Abonnements, devises, espace éditeur, encaissement manuel, factures | ✅ |
| 5 | Mode hors-ligne (PWA, file d'opérations, synchronisation) | ✅ (backend §10.11, frontend §10.12) |
| 6 | Notifications WhatsApp | ⬜ (hors périmètre v1, architecture prête) |

**Lot 5 repris (2026-08-25)** : le périmètre §11.2 (« à valider », Q9) est adopté tel
quel comme périmètre v1, à la demande du client. Le socle serveur nécessaire à la
synchronisation — fusion champ par champ avec journal de conflit, téléversement repris
par morceaux — est livré et testé (§10.11) ; il s'appuie sur les fondations déjà posées
au lot 0 (identifiants générés côté client, mouvements de stock additifs et immuables,
journal d'opérations via le journal d'audit — §10.6). Le service worker, la file
d'opérations locale (IndexedDB) et l'indicateur de connexion côté frontend sont livrés
séparément, dans une passe suivante (§10.12).

Le frontend avance en parallèle, sur ses propres jalons (fondations d'abord, puis un
écran par lot backend livré) :

| Frontend | Contenu | Statut |
| --- | --- | --- |
| Fondations | Next.js + design system clair/sombre + auth (Google et e-mail) + onboarding + coquille applicative | ✅ |
| Fiches | Constructeur de modèles, formulaires dynamiques, liste/détail de fiche, bibliothèque de modèles | ✅ |
| Stock | Dépôts, articles/variantes, saisie de mouvements, seuils | ✅ |
| Tableaux de bord | Vue globale puis focalisable par modèle (§10.2) | ✅ |
| Abonnements/éditeur | Écrans de facturation, espace éditeur | ✅ |
| Hors-ligne (PWA) | Service worker, file d'opérations IndexedDB, indicateur de connexion, journal de conflits | ✅ |

Détail de ce qui est fait/pas fait dans `frontend/README.md`.

### 10.1 Détail du lot 0 livré

- Inscription et connexion par e-mail/mot de passe et par compte Google (`/api/v1/auth/*`).
- Onboarding organisation (nom, pays → devise/fuseau, secteur), essai de 14 jours.
- Organisations cloisonnées : politique **RLS Postgres réelle** sur `memberships` et
  `audit_logs`, vérifiée par un test qui prouve qu'une ligne d'une autre organisation
  est invisible **même au sein de la même transaction** (`tests/test_tenant_isolation.py`).
- Quatre rôles d'organisation, matrice de permissions (`core/permissions.py`).
- Invitation et gestion des membres, avec compte "en attente" tant qu'il n'est pas réclamé.
- Journal d'audit non modifiable (trigger Postgres qui rejette UPDATE/DELETE).
- Stockage de fichiers à deux implémentations interchangeables (filesystem local avec
  liens signés HMAC pour le dev, S3/MinIO pour la production).
- Migrations Alembic appliquées et vérifiées contre une vraie base PostgreSQL locale.

**2FA (2026-08-25)** : TOTP (RFC 6238, compatible Google Authenticator/Authy) plutôt
que par SMS — aucun coût d'envoi récurrent, aucune dépendance à un opérateur.
`POST /auth/2fa/setup` (secret + QR code SVG, ne verrouille rien tant qu'aucun code
n'est confirmé) → `POST /auth/2fa/enable` (confirme, active, renvoie 10 codes de
secours à usage unique **en clair une seule fois**, seule leur empreinte bcrypt est
conservée). `POST /auth/login` renvoie désormais `requires_2fa` + `challenge_token`
(jeton dédié, 5 min) au lieu des jetons directement pour un compte protégé — forme
volontairement additive (`tokens`/`user` restent toujours renseignés exactement comme
avant pour l'immense majorité des comptes, 2FA non activée) pour ne rompre aucun appelant
existant. `POST /auth/2fa/verify` accepte un code TOTP ou un code de secours.
`POST /auth/2fa/disable` exige le mot de passe (pas seulement la session active) :
désactiver la 2FA affaiblit durablement la sécurité du compte, ne doit jamais
dépendre d'un seul jeton d'accès déjà en main (session volée). Testé par
`tests/test_two_factor.py` (6 tests, y compris l'usage unique d'un code de secours).
**Limite assumée de cet environnement de développement** : les scripts de fumée
manuels contre un serveur local ont été perturbés par une machine visiblement sous
charge (plusieurs agents en arrière-plan + une suite de tests longue tournant en
parallèle), avec des échecs transitoires jamais reproduits deux fois de suite ni
jamais observés dans la suite pytest déterministe — même classe de flakiness que
d'autres épisodes déjà rencontrés cette session (jamais un vrai défaut de code
confirmé). La vérification en conditions réelles s'appuie donc ici sur la suite
automatisée, plus rigoureuse (session/transaction partagée réelle), plutôt que sur
un script de fumée qui n'a pas pu tourner de façon stable.

**Raffinements ajoutés a posteriori (2026-08-25) — réinitialisation de mot de passe et
acceptation d'invitation par e-mail :**

- `POST /auth/password/forgot` (toujours 204, qu'un compte existe ou non pour cet
  e-mail — énumérer les comptes serait une fuite d'information) et
  `POST /auth/password/reset` (jeton dédié `password_reset`, 1 h de validité, déjà
  posé dès le lot 0 mais jamais branché à une route jusqu'ici).
- `GET /auth/invitations/{token}` (aperçu avant de demander un mot de passe — e-mail,
  nom de l'organisation, jamais le jeton lui-même) et `POST /auth/invitations/accept`.
  Le jeton d'invitation (14 jours de validité) porte `organization_id` en plus de
  l'identifiant utilisateur : accepter une invitation se produit avant toute
  authentification, donc avant que `SET LOCAL app.current_org_id` n'ait de raison
  d'être positionné — sans cette information explicite dans le jeton signé, la ligne
  `memberships` correspondante resterait invisible sous RLS (même blocage de
  démarrage que l'onboarding d'une organisation, §10.6). Un utilisateur déjà titulaire
  d'un mot de passe (déjà actif sur la plateforme, invité dans une nouvelle
  organisation) n'a rien à accepter par e-mail : il se connecte normalement, aucun
  e-mail n'est envoyé.
- Si le SMTP n'est pas configuré sur l'environnement, `POST .../members` renvoie quand
  même 201 (l'appartenance est bien créée) mais avec `invitation_email_sent: false` et
  `invitation_link` rempli, pour qu'un administrateur puisse transmettre le lien à la
  main plutôt que l'invitation ne reste bloquée sans que personne ne le sache.

**Bug réel trouvé en testant le flux d'invitation via l'API (pas seulement via les
tests automatisés)** : `Membership.user` est une relation `lazy="joined"` — ce réglage
ne joue qu'au moment d'un `SELECT` (jointure automatique), jamais après la simple
construction et le `flush()` d'un objet neuf. Sérialiser la réponse de `POST
.../members` déclenchait donc un lazy-load de `membership.user` hors du pont async
(`MissingGreenlet`) — présent depuis le lot 0, jamais exercé par un test HTTP jusqu'ici
puisque `list_members`/`update_member` relisent toujours la ligne par un `SELECT`
(donc bénéficient normalement de la jointure), alors que `invite()` construit l'objet
en mémoire. Corrigé en affectant directement `membership.user = user` (l'objet est
déjà en main, inutile de recharger la ligne) — même famille de bug que le correctif
`onupdate=utcnow` de `models/base.py`, cause différente, remède similaire : ne jamais
laisser SQLAlchemy tenter une résolution paresseuse pendant la sérialisation Pydantic.

### 10.2 Détail du lot 1 livré

- **Moteur de fiches** (`app/dynamic_fields`, `app/models/model_definition.py`) : modèles
  et champs configurables, tous les types de champs du §5.2, validation stricte contre
  les définitions de champs (`validate_and_normalize`), unicité vérifiée à l'écriture.
- **Fiches** (`app/models/record.py`) : structure hybride colonnes fixes + JSONB
  (§15), statut configurable, affectation, événements datés (§6.2), archivage.
- **Bibliothèque de modèles** : Véhicule, Personnel, Extincteur, Contrat activables en un
  clic (`POST /organizations/{id}/templates/{key}/activate`) — copie propre, aucun lien
  vivant vers le gabarit (§5.6). Stock de gaz et Vêtements rejoignent la bibliothèque au
  lot 2, une fois le moteur de stock capable de les faire fonctionner réellement.
- **Moteur d'échéances et d'alertes** (`app/alerts`) : index matérialisé des échéances
  (`RecordDeadline`), calcul des paliers J-60/J-30/J-7/jour J puis relance périodique en
  retard, écriture idempotente via `ON CONFLICT DO NOTHING` sur une contrainte
  d'unicité — **vérifié par un test qui rejoue le balayage et constate zéro doublon**,
  pas seulement affirmé (§8.2, §16.1).
- **Notifications** (`app/notifications`) : intentions + porteurs interchangeables,
  porteur "dans l'application" fonctionnel, porteur e-mail prêt (dépend d'un SMTP
  configuré), porteur WhatsApp en stub explicite qui échoue clairement plutôt que de
  prétendre envoyer (§8.6).
- **Documents et photos** : téléversement lié à une fiche, URL signée à chaque lecture ;
  relecture possible à tout moment après coup (`GET .../records/{id}/documents` liste,
  `GET .../documents/{document_id}` renouvelle l'URL signée — §14.1, durée de vie
  courte du lien) plutôt que de n'exister qu'au moment du téléversement initial.
- **Gestion des champs après création** (§5.6, « ajoutez, retirez ou renommez des
  champs ») : `PATCH .../fields/{id}` (libellé, options, visibilité — jamais `key` ni
  `field_type`, pour ne pas rompre silencieusement les fiches déjà écrites sous cette
  clé), `DELETE .../fields/{id}` (refuse avec 409 si le champ sert de titre aux
  fiches), `PUT .../fields/reorder`. Le constructeur de modèles ne pouvait auparavant
  qu'ajouter des champs, jamais modifier un champ existant après coup.

**Correctif d'architecture découvert en testant le parcours réel** (pas seulement les
tests automatisés, qui masquaient le problème en partageant une seule transaction) :
la table `memberships` est celle qu'on interroge pour *établir* le contexte
d'organisation — avec une politique RLS unique fondée sur l'organisation courante, cette
requête de bootstrap ne pouvait jamais rien voir, y compris ses propres appartenances.
Elle porte maintenant une politique de lecture dédiée (visible si l'organisation
correspond au contexte courant **ou** si la ligne appartient à l'utilisateur courant),
tandis que les écritures restent strictement cantonnées au contexte déjà établi — voir
la migration `5799f8fae891` et `core/deps.py`.

**Second correctif, découvert en branchant le frontend contre le backend réel** :
`PATCH .../records/{id}` et `POST .../records/{id}/archive` renvoyaient une erreur 500
(`MissingGreenlet`) — et le même défaut latent touchait toute entité modifiable via
`TimestampMixin` (ex. `PATCH /organizations/{id}`). Cause : `updated_at` utilisait
`onupdate=func.now()` (calculé côté SQL) ; après le flush d'une mise à jour, SQLAlchemy
expire l'attribut, et sa relecture immédiate pendant la sérialisation Pydantic
déclenche un lazy-load implicite hors du pont async — d'où le `MissingGreenlet`.
Corrigé en remplaçant `func.now()` par un callable Python (`onupdate=utcnow` dans
`models/base.py`), calculé côté application avant le flush plutôt qu'après. Vérifié par
`tests/test_record_and_organization_updates.py` et par un test en conditions réelles
contre un serveur local (les trois routes précédemment cassées renvoient 200).

**Balayage nocturne automatique (2026-08-25)** : `app/celery_app.py` (application
Celery, programmation quotidienne à 2 h via `celery.schedules.crontab`) et
`app/tasks/alerts.py` (`run_nightly_alert_scan`, qui balaie chaque organisation
dans sa propre transaction avec son propre `SET LOCAL app.current_org_id` — les
tables scannées n'ont aucune politique de contournement pour l'éditeur,
contrairement à `subscriptions`/`payments`/`invoices`, §4.3). Démarrage en
production : `celery -A app.celery_app worker` et `celery -A app.celery_app
beat`, deux processus séparés, tous deux exigeant Redis joignable. **Limite
assumée de cet environnement de développement** : ni Redis ni Docker n'y sont
disponibles (vérifié), donc la programmation Celery Beat elle-même
(déclenchement réellement automatique chaque nuit) n'a pas pu être vérifiée en
conditions réelles ici — seule la fonction de balayage multi-organisations
elle-même (`scan_all_organizations`) l'a été, par des tests qui l'appellent
directement. `POST .../alerts/run-scan` reste utilisable en attendant (manuel,
ou piloté par un cron système externe qui n'a pas besoin de Redis).

Bug réel trouvé en écrivant ce test : `SET LOCAL` à l'intérieur d'un
`begin_nested()` (SAVEPOINT) qui se termine normalement (RELEASE, pas ROLLBACK)
**survit** au-delà de ce savepoint — seul un ROLLBACK l'annule. Sans
restauration explicite du contexte précédent en fin de chaque itération, le
contexte d'une organisation fuyait vers l'itération suivante puis, en sortie de
boucle, vers l'appelant — sans conséquence en production (la session est jetée
juste après), mais capable de fausser silencieusement tout code qui
réutiliserait la même session ensuite (exactement le cas des tests, qui l'ont
révélé).

Non fait volontairement à ce stade : filtres/recherche avancée sur les fiches (lot 3),
focalisation des tableaux de bord (lot 3, livré depuis — voir §10.9).

### 10.3 Détail du lot 2 livré

- **Dépôts, articles, variantes** (`app/models/stock.py`) : un article est une fiche
  (`Record` de nature `stock_item`) ; `ArticleConfig` porte ce qui est propre au stock
  (unité, prix, suivi de lots, consignation) sans mélanger cette configuration aux
  champs personnalisés de l'organisation. Une variante existe toujours, même pour un
  article non décliné (`is_default`), pour que mouvements et niveaux de stock
  s'accrochent toujours au même type d'objet.
- **Mouvements immuables et additifs** (§7.3, §11.3, §11.4) : `StockLevel` (quantité
  courante par variante/dépôt) est tenu à jour par un **trigger Postgres**, pas par le
  code applicatif — l'incrément est atomique même sous écritures concurrentes.
  **Vérifié en reproduisant littéralement le scénario du cahier des charges §18.3**
  (deux sorties concurrentes qui s'additionnent, jamais un écrasement).
- **Immutabilité** : `stock_movements` porte le même trigger de rejet
  UPDATE/DELETE que `audit_logs` (lot 0) — une correction s'écrit par mouvement
  inverse, jamais par modification.
- **Seuils** (§7.4) : global par variante + surcharge par dépôt, intégrés au moteur
  d'alertes existant (nouvelle source `stock_threshold`, palier hebdomadaire tant que
  la situation dure, résolution automatique dès le réapprovisionnement — §8.1, §8.3).
- **Lots et péremption** (§7.5) : activable article par article, sortie FIFO
  automatique par date de péremption (verrouillage `SELECT FOR UPDATE` pour éviter la
  double consommation sous concurrence), alertes de péremption (nouvelle source
  `lot_expiry`, mêmes paliers que les échéances).
- **Consignation** (§7.6) : compteurs vides/en circulation/montant encaissé,
  strictement les deux actions décrites par le cahier des charges (sortie de pleine,
  retour de vide) — le compteur "pleines" n'est pas dupliqué, c'est directement
  `StockLevel` (une seule source de vérité).
- **Bibliothèque** : Stock de gaz et Vêtements rejoignent Véhicule/Personnel/
  Extincteur/Contrat, chacun avec un article d'exemple déjà configuré (formats de
  bouteille, tailles) pour éviter l'effet page blanche (§5.6).

Non fait volontairement : suivi nominatif des consignes par client (explicitement hors
périmètre v1, §7.6), achat de stockage supplémentaire (lot 4), écran de saisie
mobile-first pour les mouvements (frontend, lot suivant).

**Lectures ajoutées en préparation de l'interface Stock** : le lot 2 n'exposait que les
écritures (créer un dépôt, configurer un article, saisir un mouvement, régler un seuil)
— une interface a aussi besoin de relire ce qui existe déjà. Quatre routes de lecture
ajoutées, sans nouvelle table : `GET .../records/{id}/article` (config + variantes d'un
article déjà configuré), `GET .../stock/movements` (historique paginé, filtrable par
variante/dépôt/fiche), `GET .../stock/lots` (lots restants, filtrable par échéance de
péremption — exclut les lots épuisés par défaut), `GET .../variants/{id}/thresholds`
(surcharges de seuil par dépôt).

**Correctif trouvé en écrivant le test de pagination des mouvements** : `StockMovement.created_at`
utilisait `server_default=func.now()`, qui reste figé à l'heure de **début de transaction**
pour toute sa durée en PostgreSQL — or une sortie FIFO multi-lots ou un transfert
insèrent plusieurs lignes dans le même flush/transaction (§7.5). Ces lignes recevaient
donc un `created_at` identique, rendant l'ordre "le plus récent d'abord" de l'historique
non déterministe entre elles. Corrigé par `clock_timestamp()`, qui avance à chaque
instruction contrairement à `now()` (migration `0fdf30005a2b`).

### 10.4 Détail du lot 3 livré

- **Filtres et tri** (§9) : la liste des fiches accepte des filtres d'égalité sur tout
  champ marqué filtrable (`?filters={"marque":"Toyota"}`) et un tri sur n'importe
  quelle colonne, y compris un champ personnalisé (tri sur sa représentation texte
  dans le JSONB).
- **Recherche globale** (§9) : une barre unique cherche par sous-chaîne dans les
  champs texte marqués filtrables de tous les modèles, plus le champ-titre de
  chacun. Limite assumée : recherche par `ILIKE`, pas encore d'index trigram —
  suffisant aux volumes visés (PRODUCT.md §4, hypothèse Q6), à revisiter si le
  volume réel s'avère bien supérieur.
- **Vues enregistrées** (§9) : un jeu de filtres/colonnes/tri nommé et retrouvé,
  privé à son créateur en v1 (le partage entre collègues est un raffinement
  possible sans changer la table).
- **Export** (§9) : la vue courante (filtres + colonnes) exportée en CSV, respecte
  les libellés des champs. Plafonné à 10 000 lignes par export (au-delà, un export
  en tâche de fond serait nécessaire — non construit, volume jugé suffisant).
- **Import initial** (§9, §18.1) : reprise d'un fichier CSV, correspondance des
  colonnes suggérée automatiquement (comparaison des en-têtes aux libellés/clés de
  champs), aperçu qui signale précisément quelles lignes échoueraient et pourquoi
  **avant** validation, puis import qui crée ce qui est valide et rapporte le
  reste — jamais un tout-ou-rien qui bloquerait 197 lignes correctes à cause de 3
  fautives. Limite assumée : CSV encodé en UTF-8 uniquement, dates au format
  AAAA-MM-JJ ; la reprise directe de classeurs .xlsx est un raffinement possible
  sans changer cette mécanique.

**Deux bugs réels trouvés en testant le parcours complet via l'API (pas seulement
via les tests automatisés)**, corrigés au passage : (1) un paramètre de formulaire
mêlé à un fichier téléversé (`mapping` pour l'import, `field_key` pour un document)
était traité comme paramètre de requête plutôt que champ de formulaire — FastAPI
exige `Form(...)` explicitement dès qu'un `UploadFile` est présent dans la même
route ; (2) le téléversement d'un document échouait systématiquement (erreur 500)
car la réponse tentait de valider un objet Pydantic exigeant une URL signée
directement depuis l'objet base de données, qui ne porte pas cet attribut — présent
depuis le lot 1, jamais exercé en conditions réelles jusqu'ici. Un test HTTP dédié
(`tests/test_documents.py`) couvre maintenant ce chemin.

**Tableaux de bord (§10)**, livrés à part du reste du lot 3 (nécessitaient le module
Stock du lot 2, contrairement à la recherche/aux vues/à l'export/import) :

- **Vue globale** (§10.1) : `GET .../dashboard` sans `model_id` renvoie, dans l'ordre
  imposé par le cahier des charges, les quatre indicateurs d'attention — échéances en
  retard, échéances sous 30 jours, articles sous seuil, lots proches de la péremption
  (fenêtre alignée sur le palier le plus lointain du moteur d'alertes, 30 jours) — puis
  seulement ensuite les compteurs de synthèse (nombre total de fiches, valeur du stock).
  Tous modèles confondus, cloisonné par organisation comme le reste.
- **Focalisation par modèle** (§10.2, §10.3) : `?model_id=` remplace entièrement les
  quatre indicateurs d'attention par un bloc propre à la nature du modèle — un jeu de
  compteurs et deux séries pour un graphique, jamais les mêmes chiffres pour un parc de
  véhicules et un dépôt de gaz, exactement comme les deux exemples du cahier des
  charges (§10.2) :
  - **Actif suivi** : nombre de fiches, répartition par statut, échéances en
    retard/sous 30 jours, coût des événements sur la période, échéances à venir par
    mois, coût des interventions par mois.
  - **Article de stock** : quantité totale disponible, nombre d'articles sous seuil,
    valeur du stock, entrées/sorties de la période, lots proches de la péremption,
    stock par variante, stock par dépôt, mouvements par jour.
  - Filtres additionnels : `depot_id` (stock), `site` (actif suivi — champ déjà présent
    sur toute fiche depuis le lot 0), `period` (`7d`/`30d`/`90d`/`current_year`, §10.4).
- **Indicateurs cliquables** (§10.5) : trois routes de liste partagent exactement le
  même filtrage que les compteurs qu'elles détaillent — `GET .../dashboard/deadlines`
  (`status=overdue|upcoming`), `.../dashboard/understock`, `.../dashboard/expiring-lots`
  — jamais un nombre affiché sans une liste ouvrable derrière pour savoir "lesquelles".
- **Montants soumis à autorisation** (§4.2, §10.3) : `stock_value`, `total_stock_value`,
  `event_cost_total`/`event_cost_by_month` valent `null` plutôt que d'être omis quand
  l'utilisateur n'a pas le droit de voir les montants (`Action.VIEW_AMOUNTS` **et**
  `Membership.can_view_amounts` — la colonne existait depuis le lot 0 mais n'était
  encore consultée nulle part ; les tableaux de bord sont le premier endroit qui
  l'applique réellement).
- **Tableaux de bord enregistrés et épinglés** (§10.4) : `saved_dashboards`
  (organisation + créateur, périmètre modèle/dépôt/site + période, nommé). Un seul
  épinglé à la fois par utilisateur, appliqué au niveau service plutôt que par une
  contrainte d'unicité partielle en base — épingler en désépingle un autre plutôt que
  d'échouer. Privé à son créateur, même principe que les vues enregistrées (§9).

**Correctif trouvé en écrivant les tests d'agrégation par mois** : grouper par
`to_char(colonne, 'YYYY-MM')` en appelant `func.to_char(...)` séparément pour le
`SELECT`, le `GROUP BY` et l'`ORDER BY` produit trois paramètres liés distincts pour la
même chaîne `'YYYY-MM'` — PostgreSQL ne peut alors plus prouver, au moment de préparer
la requête (avant que les paramètres ne soient liés à une valeur), que l'expression du
`SELECT` est bien celle du `GROUP BY`, et rejette la requête. Corrigé en construisant
l'expression une seule fois et en réutilisant le même objet dans les trois clauses.

Reste pour clore le lot 3 : les tableaux de bord globaux puis focalisables par
modèle (§10.2 du cahier des charges) — la pièce la plus visible du lot, qui
arrivera avec le prochain travail sur le frontend.

### 10.5 Détail du lot 4 livré

- **Catalogue** (§13) : `Offer` et `Currency` ne sont pas cloisonnées par
  organisation — un catalogue partagé, piloté par l'éditeur (création/mise à jour
  sans intervention de développement), consultable par tout utilisateur connecté
  via `/catalog/offers` et `/catalog/currencies` pour choisir une offre. Deux routes
  de lecture ajoutées après coup (`GET /editor/offers`, `GET /editor/currencies`,
  toutes les entrées y compris désactivées) : le catalogue public ne renvoie que les
  entrées actives, ce qui suffit pour une organisation qui souscrit mais empêchait
  l'éditeur de retrouver et réactiver ce qu'il venait lui-même de désactiver — bug
  trouvé en branchant l'interface éditeur contre le backend réel.
- **Cycle de vie de l'abonnement** (§12.3) : `Subscription` (une par organisation,
  créée automatiquement à l'inscription avec l'essai de 14 jours) traverse
  essai → actif → lecture seule → suspendu → archivé, entièrement dérivé de
  dates. `run_lifecycle_scan` est, comme le moteur d'alertes, idempotent par
  construction : le rejouer ne fait jamais régresser un statut déjà atteint.
- **Paiement manuel** (§12.4) : le client déclare (« J'ai payé » + référence), une
  file côté éditeur liste les déclarations, la validation prolonge l'abonnement
  **à partir de l'échéance en cours — jamais de la date de validation** — pour
  qu'aucun jour payé ne soit perdu, et émet automatiquement une facture numérotée
  en séquence (séquence Postgres, pas un `COUNT(*)` applicatif qui serait sujet à
  une course entre deux validations concurrentes). L'éditeur peut aussi enregistrer
  un paiement sans déclaration préalable (client réglé par un autre canal).
- **Espace éditeur** (§13) : liste de toutes les organisations avec statut
  d'abonnement, échéance et nombre d'utilisateurs ; ajustement manuel d'un
  abonnement (prolonger/suspendre/réactiver, motif obligatoire, tracé au journal
  d'audit de l'organisation concernée). `offer_name` était toujours renvoyé `null`
  (`list_organization_summaries` ne joignait jamais `Offer`) — corrigé, testé.

**Décision d'architecture notable — l'éditeur et le cloisonnement (§4.3) :**
`subscriptions`, `payments` et `invoices` sont les **seules** tables où une
politique RLS laisse l'éditeur voir à travers toutes les organisations
(`organization_id = organisation courante OU app.is_platform_admin = true`).
Nulle part ailleurs : aucune fiche, aucun document, aucun mouvement de stock n'a
de politique de ce type — l'éditeur y reste sans accès par défaut, exactement
comme l'exige le cahier des charges. Testé explicitement
(`test_editor_bypass_does_not_leak_into_business_tables`) : sous contexte
éditeur pur, les abonnements de toutes les organisations sont visibles, les
fiches d'aucune ne le sont.

Non fait volontairement : intégration d'un opérateur de paiement mobile
(explicitement lot ultérieur, §12.4 — le modèle `Payment` est conçu pour
l'accueillir sans réécriture), téléversement d'une capture du reçu de paiement,
annonces de l'éditeur aux organisations, statistiques d'activité du service.

**Génération de factures en PDF (2026-08-25)** : `GET
/organizations/{id}/invoices/{invoice_id}/pdf` (ADMIN de l'organisation
facturée uniquement — 404, pas 403, pour une facture d'une autre organisation :
ne pas révéler qu'elle existe). `fpdf2` plutôt que `weasyprint` : ni Pango ni
Cairo à installer sur l'environnement de déploiement pour un document aussi
simple qu'une facture à une page. Détail vérifié à l'œil (le fichier généré a
été relu, pas seulement vérifié par ses en-têtes) : en-tête Registre,
numéro/date de facture, organisation facturée, offre et période couvertes,
mode de règlement, montant. Piège rencontré : les polices "core" de fpdf2
(Helvetica) ne couvrent que le latin-1 — un tiret cadratin (« — ») dans le
texte fait échouer le rendu (`FPDFUnicodeEncodingException`) ; les caractères
accentués français restent, eux, dans cette plage et ne posent aucun problème.

### 10.6 Fondation posée en avance pour le lot 5 (hors-ligne) : identifiants côté client

Le cahier des charges est explicite (§11.4) : « le hors-ligne ne peut pas être
ajouté après coup » — trois décisions doivent être prises dès les fondations,
avant même que le lot 5 ne soit construit. Deux étaient déjà acquises depuis le
lot 0/2 (mouvements de stock additifs et immuables, §7.3 ; journal d'opérations
via le journal d'audit). La troisième — **identifiants générés côté client** —
manquait : les fiches et les mouvements de stock laissaient jusqu'ici le serveur
choisir l'identifiant, ce qui aurait bloqué toute création faite hors connexion
(l'appareil doit pouvoir nommer l'objet qu'il crée avant de savoir si et quand
il pourra joindre le serveur).

Corrigé maintenant plutôt que d'attendre le lot 5, précisément pour ne pas avoir
à revenir sur des schémas déjà utilisés en production :

- `POST .../records` accepte un `id` optionnel. Absent (client web en ligne) :
  le serveur en génère un, comportement inchangé. Fourni : une resoumission
  avec le même `id` renvoie la fiche déjà créée au lieu d'en produire une
  seconde — le cas exact d'une synchronisation interrompue juste après
  l'écriture, avant que la réponse ne revienne à l'appareil.
- Les quatre routes de mouvement de stock (`entry`, `exit`, `adjustment`,
  `transfer`) acceptent un `client_operation_id`, **distinct** de l'identifiant
  de chaque ligne : une sortie avec suivi de lots peut produire plusieurs
  mouvements (un par lot consommé en FIFO), qui partagent volontairement cette
  valeur — la détection de resoumission se fait donc côté service (recherche
  avant écriture), pas via une contrainte d'unicité en base, qui ne pourrait
  pas exprimer correctement « une opération, plusieurs lignes ».
- Vérifié à la fois en test (`tests/test_offline_idempotency.py`) et en
  conditions réelles via l'API : soumettre deux fois la même création avec le
  même identifiant ne produit jamais de doublon, ni pour une fiche ni pour un
  mouvement de stock.

### 10.7 Frontend — moteur de fiches (interface)

Détail complet dans `frontend/README.md`. Points notables :

- **Rendu de champ générique** (`components/fiches/field-renderer.tsx` en
  saisie, `field-value.tsx` en lecture) : les 14 types du moteur de fiches sont
  gérés de façon exhaustive par un seul composant, jamais un formulaire codé en
  dur par modèle — un champ personnalisé ajouté par une organisation obtient
  automatiquement le bon contrôle de saisie.
- **Constructeur de modèles** : création, et maintenant modification/
  suppression/réorganisation de champs déjà enregistrés
  (`components/fiches/existing-field-list.tsx`), branché sur les routes
  `PATCH`/`DELETE`/`PUT .../reorder` du §10.2. La clé technique et le type d'un
  champ existant restent verrouillés dans l'éditeur (`lockKey`), pour ne
  jamais laisser croire qu'ils peuvent changer sans casser les fiches déjà
  écrites — cohérent avec la même règle imposée côté backend.
- **Documents et photos** : une pièce jointe reste consultable et ouvrable
  depuis une fiche à tout moment, même longtemps après le téléversement — son
  URL signée est relue à chaque affichage (`getDocument`/`listDocuments`,
  §10.2) plutôt que mise en cache avec expiration devinée côté client.

**Correctif appliqué après la livraison initiale de cette interface par un
agent dédié** : le constructeur de modèles et l'affichage des pièces jointes
avaient été construits contre une version antérieure du backend (avant les
routes `PATCH`/`DELETE fields` et `GET documents` du §10.2) — chaque
composant le documentait honnêtement plutôt que de le masquer (bannière
« pas encore possible », pièce jointe explicitement marquée « lien expiré »
passé 5 minutes). Une fois les routes manquantes ajoutées côté backend,
l'interface a été rebranchée dessus plutôt que laissée à documenter une
limitation qui n'existait plus.

### 10.8 Frontend — module Stock (interface)

Détail complet dans `frontend/README.md`. Un article de stock reste une fiche comme
une autre — l'interface le traite ainsi plutôt que de dupliquer un second système :

- **Panneau Stock intégré à la fiche** (`components/stock/stock-panel.tsx`), affiché
  sur `models/[id]/records/[id]` uniquement quand `model.nature === "stock_item"` —
  aucun écran séparé et désynchronisé du reste de la fiche. Première configuration
  (unité, prix, suivi de lots, consignation, variantes déclinées sur jusqu'à 2
  attributs) quand l'article n'est pas encore configuré (§7.1) ; au-delà, matrice
  variante × dépôt avec seuils visibles et cellules signalées sous seuil, historique
  des mouvements paginé côté serveur, panneau des lots proches de péremption (mêmes
  codes couleur que le champ Échéance) et panneau de consignation quand pertinents.
- **Saisie de mouvement** : un dialogue à quatre onglets (entrée/sortie/ajustement/
  transfert) plutôt qu'un formulaire unique surchargé. L'ajustement — une correction
  silencieuse de la quantité enregistrée — affiche systématiquement actuel/compté/écart
  dans une confirmation avant tout envoi (§7.3 : justification obligatoire). Une sortie
  FIFO multi-lots (§7.5) affiche explicitement "sur N lots" plutôt que de laisser croire
  qu'un seul mouvement a été créé.
- **Seuils** (§7.4) : le seuil global d'une variante et ses surcharges par dépôt sont
  deux champs clairement séparés dans le même dialogue, jamais confondus — cohérent
  avec la distinction déjà faite côté backend (`ThresholdSet.depot_id`).
- **Dépôts** (`app/(app)/depots`) : liste/création/modification, accessible depuis la
  barre latérale, le menu des modèles et la palette de commandes — pas une URL morte.

Revue indépendante (agent dédié) : aucune incohérence avec les schémas backend,
aucun risque de perte de données. Un seul écart mineur corrigé — la quantité "Actuel"
affichée avant confirmation d'un ajustement pouvait provenir du cache jusqu'à 30
secondes (`staleTime` par défaut du client React Query) plutôt que d'être toujours
fraîche ; sans conséquence sur la donnée enregistrée (recalculée côté serveur dans
tous les cas), corrigé par simple prudence avant confirmation d'une correction.

### 10.9 Frontend — tableaux de bord (interface)

Détail complet dans `frontend/README.md`. Remplace la coquille de page d'accueil du
lot 0 par le vrai tableau de bord — c'est la page `/` de l'application, pas un écran
secondaire, conformément au §10.1 (« qu'est-ce qui demande mon attention
aujourd'hui »).

- **Bandeau de focalisation** (§10.2) : pastilles « Tout » + une par modèle actif.
  Changer de modèle recalcule entièrement les indicateurs plutôt que de simplement
  filtrer une liste — la vue globale (attention + synthèse) laisse place aux
  indicateurs propres à la nature du modèle (§10.3), avec les filtres dépôt/site/
  période qui n'apparaissent qu'une fois un modèle focalisé.
- **Les deux règles de conception du §10.5, appliquées structurellement** : chaque
  indicateur adossé à une route de liste (échéances en retard/à venir, sous seuil,
  péremption) est cliquable jusqu'au niveau du composant `StatTile` — impossible d'en
  afficher un sans gestionnaire de clic par erreur ; un indicateur sans route de liste
  derrière (compteurs agrégés seuls, ex. valeur du stock) reste volontairement non
  cliquable plutôt que de mener vers une liste qui ne correspondrait pas exactement
  au chiffre affiché. Une tonalité de couleur ne s'affiche jamais seule : `StatTile`
  exige systématiquement un mot à côté.
- **Périmètre dérivé, pas synchronisé par effet** : le périmètre effectif de la page
  (`explicitScope ?? tableau de bord épinglé ?? "Tout"`) suit exactement le même
  principe que `currentOrganizationId` (auth, lot 0) — un `useMemo`, jamais un
  `useEffect` qui recopierait une réponse serveur dans un état local. La requête
  principale attend explicitement que le tableau de bord épinglé soit connu avant de
  partir, pour ne jamais afficher "Tout" une fraction de seconde puis basculer.
- **Graphiques** : simples rangées de barres en CSS (libellé + piste + remplissage
  proportionnel + nombre), fidèles à la maquette du cahier des charges — aucune
  bibliothèque de graphiques ajoutée, le volume de données (buckets mensuels,
  mouvements sur au plus 90 jours) ne le justifie pas.
- **Tableaux de bord enregistrés et épinglés** (§10.4) : enregistrer le périmètre
  courant sous un nom, les retrouver, épingler l'un d'eux comme page d'accueil.

**Correctif appliqué après revue indépendante** : la liste "cliquable" des échéances
à venir calculait sa tonalité de couleur à partir de `days_overdue` seul (toujours
négatif ou nul pour cette liste par construction) — une branche du calcul n'était
donc jamais atteinte, et toute échéance à venir affichait la même tonalité
"urgent", qu'elle tombe demain ou dans 29 jours, perdant la graduation que
`computeDueDateStatus` applique partout ailleurs dans l'application. Corrigé en
réutilisant directement cette même fonction partagée plutôt qu'un calcul dupliqué
et incomplet à partir d'un champ qui ne porte pas assez d'information à lui seul.

### 10.10 Frontend — abonnement et espace éditeur (interface)

Détail complet dans `frontend/README.md`. Deux surfaces distinctes, à la mesure des
deux portes d'accès du backend (§4.3) — jamais la même coquille applicative :

- **Écran Abonnement** (`app/(app)/abonnement`), dans l'application organisationnelle
  normale : état de l'abonnement (essai/actif/lecture seule/suspendu, échéance
  visible en permanence — §12.3), déclaration d'un paiement (« J'ai payé » +
  référence, jamais la devise ni le montant validé — c'est le rôle de l'éditeur à
  la vérification), historique des paiements et des factures. Le bouton de
  déclaration et l'historique sont réservés à l'administrateur de l'organisation
  côté UI, cohérent avec `require_role(OrgRole.ADMIN)` côté backend — un membre
  non-administrateur voit un message explicite plutôt qu'un bouton manquant sans
  explication.
- **Espace éditeur** (`app/(editor)`, groupe de routes séparé, sa propre mise en
  page, aucun sélecteur d'organisation) : réservé à `User.is_platform_admin`, un
  indicateur de plateforme totalement indépendant de l'appartenance à une
  organisation — un éditeur peut n'appartenir à aucune organisation. Nouveau garde
  de route `useRequirePlatformAdmin` (`lib/auth/route-guards.ts`), même discipline
  que les gardes existants (n'agit jamais tant que le statut d'authentification est
  encore en chargement, redirige par remplacement). Quatre écrans : vue d'ensemble
  (répartition des statuts d'abonnement + déclenchement manuel du balayage de
  cycle de vie, tant qu'aucun ordonnanceur n'est branché), organisations (liste +
  ajustement manuel d'un abonnement, motif toujours visible), règlements (file des
  paiements déclarés, traitée comme une vraie file — le plus ancien en premier —
  plutôt qu'un tableau générique ; validation/rejet toujours confirmés, motif
  obligatoire vérifié côté client avant même l'appel au serveur), catalogue
  (offres/devises, avec un badge actif/désactivé maintenant que l'écran voit tout —
  voir le correctif ci-dessous).

**Correctif appliqué après revue indépendante** : l'interface éditeur du catalogue
avait été construite en supposant qu'aucune route `GET` n'existait côté éditeur
pour les offres/devises (une lacune backend documentée par l'agent qui l'a
construite) — en réalité les deux routes existaient déjà mais n'étaient simplement
jamais appelées ; seul le catalogue public (réservé aux organisations, actives
uniquement) était utilisé pour peupler l'écran de gestion, ce qui rendait
impossible de retrouver et réactiver une offre ou une devise qu'on venait de
désactiver. Corrigé côté backend (deux routes `GET /editor/offers` et
`GET /editor/currencies` ajoutées, testées) et côté frontend (l'écran de catalogue
et la file de règlements pointent maintenant vers ces routes plutôt que vers le
catalogue public).

### 10.11 Détail du lot 5 livré (backend) : fusion champ par champ, journal de conflits, téléversement repris

Socle serveur de la synchronisation hors-ligne (§11.3). Le frontend (service worker,
file d'opérations IndexedDB, indicateur de connexion) est livré séparément — voir §10.12.

**Fusion champ par champ.** `Record.field_updated_at` (JSONB, `{clé: horodatage}`)
tient à jour, pour chaque champ de `data`, l'instant où il a été écrit pour la
dernière fois. `RecordUpdate` accepte désormais `field_written_at` : pour chaque
clé de `data`, l'instant où le **client** a réellement saisi cette valeur (capturé
à la saisie, pas à l'envoi). `RecordService.update` compare, champ par champ,
l'horodatage entrant à celui déjà enregistré :

- Plus récent (ou champ jamais écrit) : la valeur s'applique, l'horodatage est mis
  à jour — comportement normal, aucun conflit.
- Plus ancien qu'une écriture déjà en place sur le même champ (l'agent hors-ligne se
  reconnecte en retard, un autre utilisateur a écrit ce champ entre-temps) : la
  valeur entrante est **rejetée** — le champ garde sa valeur actuelle — et une ligne
  `RecordFieldConflict` est créée avec les deux valeurs et les deux horodatages.

`field_written_at` absent (client web en ligne classique, cas normal aujourd'hui) :
chaque champ est horodaté à `now()`, ce qui revient exactement au comportement
d'avant ce lot (le dernier arrivé au serveur gagne). Rien ne change pour l'usage
en ligne actuel.

La réponse de `PATCH .../records/{id}` (`RecordUpdateOut`) porte en plus
`conflicted_field_keys` : les clés rejetées par **cet appel précis**, pour que le
client sache immédiatement qu'une de ses valeurs n'a pas été retenue sans avoir à
consulter le journal séparément.

**Journal de conflits.** `GET /organizations/{id}/sync/conflicts` (réservé à
l'administrateur, `require_role(OrgRole.ADMIN)` — même garde que le journal
d'audit) liste les conflits, les deux valeurs et les deux horodatages ;
`POST .../sync/conflicts/{id}/ack` les marque comme vus. Rien ne les résout
automatiquement — le cahier des charges demande un journal consultable, pas une
règle de résolution supplémentaire au-delà du dernier-écrit-l'emporte déjà appliqué.

**Idempotence de la mise à jour.** `RecordUpdate.client_operation_id`, vérifié via
une nouvelle méthode `AuditService.find_by_client_operation_id` (le journal d'audit,
déjà désigné comme le « journal d'opérations » du §11.4 — voir §10.6, reçoit une
colonne `client_operation_id`) : une resoumission après coupure réseau (écriture
appliquée côté serveur, réponse jamais reçue côté client) est un jeu sans effet,
comme pour la création de fiche et les mouvements de stock.

**Téléversement repris par morceaux** (§11.3 : « Les photos partent en
arrière-plan, compressées, et reprennent après coupure sans repartir de zéro. »).
Nouvelle table `upload_sessions`, id généré côté client (même principe que les
fiches, §11.4) : `POST .../documents/uploads` ouvre ou retrouve une session,
`PUT .../uploads/{id}/chunks/{n}` envoie un morceau (corps brut, taille bornée à
5 Mo), `GET .../uploads/{id}` renvoie les indices déjà reçus — c'est ce que le
client relit après une coupure pour savoir où reprendre plutôt que de tout
renvoyer — et `POST .../uploads/{id}/complete` assemble les morceaux et les passe
au service de documents existant (`DocumentService.upload`, inchangé). Les morceaux
sont accumulés sur disque local (`app/storage/chunked.py`), indépendamment du
backend de stockage final (local ou S3) : cette zone tampon existe même quand
`storage_backend=s3`, elle ne sert qu'à recevoir l'envoi avant assemblage.
`complete` est lui-même rejouable sans effet (resoumission après coupure entre
l'écriture et la réponse : renvoie le document déjà produit).

**Non traité dans ce lot, par choix explicite** : la synchronisation en arrière-plan
pendant que l'onglet/l'application est fermé (Background Sync API) n'est pas
construite — `frontend/src/lib/session.ts` garde le jeton d'accès uniquement en
mémoire (jamais dans `localStorage`, pour limiter l'exposition XSS), ce qui rend
impossible l'authentification d'une relecture déclenchée par un service worker
après fermeture de l'onglet sans affaiblir cette protection. La relecture de la
file d'opérations aura donc lieu pendant que l'application est ouverte et en ligne
(au retour du réseau, ou à l'ouverture), pas en tâche de fond au sens strict du
système d'exploitation — cohérent avec le comportement réel des navigateurs mobiles
visés (Safari iOS ne supporte de toute façon pas la Background Sync API).

Vérifié par `backend/tests/test_field_level_conflicts.py` (fusion, conflits réels,
non-conflits, idempotence, journal + accusé de lecture) et
`backend/tests/test_resumable_uploads.py` (reprise après coupure simulée, contenu
assemblé identique à l'original, complétion idempotente, réouverture d'une session
existante, refus d'un morceau trop volumineux).

**Bug trouvé en construisant ce lot** : `SavedDashboard` (§10.9) n'était jamais
importé dans `app/models/__init__.py` — Alembic ne « voyait » donc pas cette table
pour l'autogénération de migration. La première tentative de génération de la
migration de ce lot proposait silencieusement de **supprimer** `saved_dashboards`
(la table existe bien en base, créée par la migration du lot 3, mais était absente
des métadonnées SQLAlchemy que `--autogenerate` compare à la base réelle). Corrigé
en important le modèle avant de régénérer — la migration de ce lot ne touche plus
du tout `saved_dashboards`. Sans cette vérification, la prochaine migration
autogénérée du projet aurait réellement supprimé les tableaux de bord enregistrés
de tous les utilisateurs.

### 10.12 Détail du lot 5 livré (frontend) : PWA, file d'opérations, indicateur de connexion

Consomme le socle serveur du §10.11 sans le redessiner. Service worker écrit à la
main (`frontend/public/sw.js`) — pas de next-pwa/workbox, absents des dépendances du
projet et de compatibilité non garantie avec Turbopack (Next 16) — dont le seul rôle
est de rendre consultable hors-ligne une page déjà visitée : cache-first pour les
bundles `/_next/static/*`, réseau-puis-cache pour les pages HTML déjà ouvertes. Ne
touche jamais au backend FastAPI ni aux routes `/api/*` (proxy d'auth Next.js) : le
jeton d'accès reste uniquement en mémoire JS (`src/lib/session.ts`, choix délibéré
contre le XSS), un service worker n'a aucun moyen de le poser sur une requête.

**File d'opérations** (`frontend/src/lib/offline/db.ts`, IndexedDB via `idb`) : trois
magasins — `operations` (créations/mises à jour de fiche, mouvements de stock,
téléversements, en attente de synchronisation), `records_cache` (dernier instantané
connu de chaque fiche déjà visitée) et `upload_sessions` (fichier + progression d'un
téléversement repris). `lib/offline/sync-engine.ts` rejoue la file strictement dans
l'ordre `createdAt` (une mise à jour ne rejoue jamais avant la création dont elle
dépend), séquentiellement — succès retiré de la file, 401 tente un rafraîchissement du
jeton puis rejoue une fois, coupure réseau remet l'opération "pending" et arrête la
passe (rien perdu, rien classé en échec pour un simple aller-retour manqué), toute
autre erreur (ex. 422) classe l'opération "failed" et continue les suivantes.
`lib/offline/use-offline-sync.ts` déclenche une passe au montage, à chaque retour de
réseau et toutes les 30 s tant que la session est active — jamais en tâche de fond
onglet fermé (Background Sync API explicitement hors périmètre, voir §10.11).

**Identifiants et fusion côté formulaire** (`components/fiches/record-form.tsx`) :
l'id de fiche est désormais **toujours** généré côté client (pas seulement
hors-ligne, cahier des charges §11.4), et chaque mise à jour envoie
`field_written_at` (un horodatage par champ modifié, capturé à cette soumission
précise). Une écriture qui échoue avec `ApiError.kind === "network"` part dans la
file plutôt que d'afficher une erreur, avec un instantané local immédiatement utilisable
(navigation vers la fiche inchangée). Même principe pour les mouvements de stock
(`components/stock/movement-dialog.tsx`, `client_operation_id` désormais posé sur les
quatre types de mouvement).

**Téléversement repris** (`lib/offline/uploads.ts`) : `uploadDocumentResumable`
découpe le fichier en morceaux de 1 Mo, pousse ceux qui manquent encore côté serveur
(relu via `GET .../uploads/{id}`, source de vérité après une reprise), puis termine
l'envoi — hors-ligne, la session part en file et un aperçu local (`URL.createObjectURL`)
s'affiche immédiatement. **Limite assumée** : l'id de session diffère de l'id de
document final côté serveur, et la synchronisation en arrière-plan ne réécrit pas
cette référence dans l'état du formulaire une fois l'envoi terminé — décrit en
commentaire à l'endroit exact du code, pas seulement ici.

**Journal de conflits** (`app/(app)/organisation/conflits/page.tsx`, réservé à
l'ADMIN, même gate qu'`organisation/membres`) : liste `field_key`, valeur conservée,
valeur rejetée, les deux horodatages, filtre "non vus uniquement", marquage comme vu.
Le conflit ne porte que l'id de fiche (pas l'id de modèle) — affiché en texte brut
plutôt que de résoudre un lien qui coûterait un aller-retour par ligne.

**Indicateur de connexion** (`components/offline/offline-status-indicator.tsx`,
en-tête de l'application) : reprend mot pour mot la formulation du cahier des charges
(§11.3, §7.6) — « Hors-ligne — *N* opération(s) en attente ».

**Installabilité** : `public/manifest.webmanifest` + deux icônes SVG statiques
(`public/icons/icon.svg`, `icon-maskable.svg`) reproduisant le monogramme existant
(`components/brand/logo.tsx`) à l'échelle d'un icône d'application — pas un jeu
d'icônes PNG dessiné, hors périmètre de cette passe (le SVG seul suffit à
l'installabilité sur les navigateurs évergreen visés).

**Non fait volontairement, comme prévu par le brief** : pas d'écran de gestion des
opérations "failed" (retry/dismiss) au-delà d'un toast affiché une fois ; pas
d'éviction du cache par dépôt pour le plafond de stockage du §11.5 (seulement une
purge simple par ancienneté, 12 mois, au démarrage) ; pas de reprise pour la pièce
jointe optionnelle d'un mouvement de stock saisi hors-ligne (elle est simplement
omise du mouvement mis en file, contrairement aux champs Document/Photo d'une fiche,
qui bénéficient pleinement de la reprise par morceaux).

Vérifié par `npm run lint` et `npm run build` (TypeScript strict, toutes les routes
compilent, y compris `/organisation/conflits`) — pas de suite de tests frontend
automatisée dans ce projet à ce jour, cohérent avec le reste de `frontend/`.

**Correctifs appliqués après revue indépendante** : trois problèmes réels, tous dans
`lib/offline/sync-engine.ts` (plus un dans `record-form.tsx`), corrigés le jour même :

- **Opération bloquée "syncing" pour toujours.** Le statut passait à "syncing" en
  IndexedDB avant même que la requête réseau ne parte ; si l'onglet se fermait ou
  l'application était tuée par le système pendant cette fenêtre (scénario réaliste sur
  le terrain, réseau instable), rien ne remettait jamais cette opération à "pending" —
  elle restait exclue de toute relecture future ET invisible de l'indicateur de
  connexion (qui ne compte que les "pending"), silencieusement perdue en pratique
  bien que toujours présente en base. Corrigé par `resetStaleSyncingOperations` :
  toute opération encore "syncing" en tout début de passe ne peut venir que d'une
  passe précédente interrompue, donc remise "pending" sans risque (rejeu sans effet
  garanti par les identifiants générés côté client, §11.4).
- **Opérations "failed" rejouées et re-signalées indéfiniment.** Contredisait la
  documentation même de ce paragraphe (« classe l'opération "failed" et continue » —
  vrai pour cette passe, mais rien n'empêchait la passe suivante de la reprendre) :
  un toast d'erreur toutes les ~30 secondes pour une erreur de validation qui ne
  réussira jamais. Corrigé en excluant "failed" de la relecture — une opération
  échouée reste signalée une fois puis inerte (pas d'écran de gestion des échecs
  dans ce lot, toujours hors périmètre assumé, mais maintenant réellement silencieux
  plutôt que bruyant en boucle).
- **`field_written_at` posé sur tout le formulaire, pas seulement les champs
  modifiés.** `values.data` (l'objet complet renvoyé par React Hook Form, y compris
  les champs jamais touchés) partait en entier, chacun réhorodaté à l'instant de
  soumission — un champ non modifié, resoumis avec un horodatage "maintenant",
  pouvait silencieusement écraser sans conflit détecté la modification plus récente
  de ce même champ par quelqu'un d'autre. Corrigé : seuls les champs que
  `form.formState.dirtyFields.data` marque réellement modifiés à cette soumission
  sont envoyés (et horodatés) — le serveur, déjà conçu pour un `data` partiel, ne
  voit plus jamais un champ que l'utilisateur n'a pas touché.

### 10.13 Chasse au bug dédiée (2026-08-25) : neuf failles trouvées et corrigées

Balayage ciblé du backend (RLS, droits, rejeu/idempotence, arithmétique de stock,
moteur d'alertes, authentification/2FA), chaque candidat vérifié par un test avant
d'être considéré confirmé. Neuf corrections, de la plus grave à la plus mineure —
toutes couvertes par `backend/tests/test_security_fixes.py`, suite complète 83/83 :

1. **Prise de compte via `/auth/signup`** — `AuthService.signup_with_password`
   traitait tout `User.hashed_password IS NULL` comme une invitation en attente
   réclamable par un simple e-mail + mot de passe. Or c'est aussi l'état permanent
   de tout compte connecté uniquement via Google : connaître l'adresse e-mail d'une
   victime suffisait à obtenir des jetons valides pour son compte, 2FA jamais
   vérifiée sur ce chemin. Corrigé en supprimant ce chemin de « réclamation » —
   un compte existant, quel que soit son état, ne se réclame plus jamais que par
   son jeton d'invitation signé (`/auth/invitations/accept`, déjà construit et
   testé — voir §4.4).
2. **Jeton de réinitialisation de mot de passe rejouable** — un jeton JWT
   `password_reset` n'a par nature aucun état côté serveur, donc rien n'empêchait
   de le rejouer plusieurs fois pendant son heure de validité. Corrigé sans table
   supplémentaire : le jeton embarque désormais une empreinte du mot de passe EN
   PLACE au moment de l'émission (`security.password_fingerprint`) ; la première
   utilisation change le mot de passe, donc l'empreinte, donc toute resoumission
   ne correspond plus à rien.
3. **Code de secours 2FA consommable deux fois sous concurrence** — lecture puis
   écriture de `User.totp_backup_codes` sans verrou : deux vérifications
   concurrentes avec le même code pouvaient toutes deux le trouver « encore
   présent » et réussir. Corrigé par un verrou de ligne (`SELECT ... FOR UPDATE`,
   `UserRepository.get_for_update`) juste avant la tentative de consommation —
   même principe que le verrou déjà utilisé pour la consommation FIFO des lots de
   stock (`lock_available_lots_fifo`). Même correctif appliqué à l'acceptation
   d'invitation (`AuthService.accept_invitation`), plus mineur mais même risque de
   double soumission concurrente écrasant silencieusement l'une l'autre.
4. **Stock négatif sans fin pour un article non suivi en lots** — `record_exit`
   vérifiait la suffisance du stock pour la branche « suivi en lots », jamais
   pour la branche par défaut (plus fréquente). Corrigé par la même vérification
   verrouillée (`StockRepository.get_stock_level_for_update`, même grain que le
   verrou des lots) avant d'autoriser la sortie.
5. **`UploadSessionService.complete` pas réellement rejouable sous concurrence**
   — contredisait sa propre documentation (§10.11) : deux appels concurrents
   pouvaient tous deux assembler et téléverser, le second échouant sur les
   morceaux déjà nettoyés par le premier plutôt que de recevoir le document déjà
   produit. Corrigé par un verrou de ligne sur la session avant toute décision.
6. **Actions de consignation sans idempotence** — contrairement aux quatre routes
   de mouvement, `ConsignmentActionCreate` ne portait aucun `client_operation_id` :
   une resoumission réseau doublait la quantité en circulation et la caution
   perçue. Corrigé en ajoutant ce champ et une vérification via le journal
   d'audit (`AuditService.find_by_client_operation_id`) — `ConsignmentLevel` est
   mutée en place, pas un journal append-only comme `StockMovement`, donc c'est
   le journal d'audit qui sert de garde ici plutôt qu'une recherche de ligne déjà
   écrite.
7. **N'importe quel membre pouvait acquitter/reporter l'alerte de n'importe qui**
   — `acknowledge_alert`/`postpone_alert` ne vérifiaient aucun rôle ni aucune
   propriété, contrairement à toute autre action mutante du produit. Corrigé :
   le destinataire d'une alerte personnelle (`Alert.recipient_user_id`) garde le
   droit de l'acquitter quel que soit son rôle — c'est le sens même d'une alerte
   personnelle — mais toute autre alerte exige désormais `CONFIGURE_ALERTS`
   (ADMIN/MANAGER).
8. **N'importe quel membre pouvait téléverser un document sur n'importe quelle
   fiche** — aucune des routes de `documents.py` (envoi direct ou par morceaux)
   ne vérifiait de rôle. Corrigé : même droit que la création/modification de
   fiche (`CREATE_EDIT_RECORD`) — un document est une modification de fiche
   comme une autre (§5.2), pas un droit à part.
9. **Réutilisation d'un `id` client pour deux fiches différentes, en silence** —
   `RecordService.create` renvoyait la fiche déjà créée sans jamais comparer
   contre les nouvelles données envoyées ; un bug client réutilisant un UUID pour
   deux créations logiquement différentes perdait la seconde sans aucun signal.
   Corrigé : `data` normalisé est comparé à la fiche existante, et un désaccord
   échoue bruyamment plutôt que de disparaître.

**Étendue de la vérification** : chaque candidat de la liste ci-dessus a d'abord
été démontré par un test jetable exécuté contre la vraie base Postgres locale,
supprimé une fois confirmé (aucune pollution du dépôt) — cohérent avec le principe
du produit : un échec est toujours un échec explicite, jamais un succès simulé,
et un correctif de sécurité n'est retenu que démontré, pas supposé. Les deux
correctifs de concurrence (3 et 5) reposent sur `SELECT ... FOR UPDATE`, un
verrou de ligne Postgres standard déjà éprouvé ailleurs dans ce code
(`lock_available_lots_fifo`) — l'architecture de test de ce projet (une
transaction par test, jamais commitée) ne permet pas d'exercer une vraie
concurrence entre deux connexions dans la suite automatisée ; la preuve reste
donc le test jetable exécuté puis supprimé, pas un test permanent.

### 10.14 Chasse au bug dédiée (frontend, 2026-08-25) : cinq problèmes trouvés et corrigés

Même exercice que le §10.13, côté frontend cette fois — chaque candidat vérifié en
lisant le code réel plutôt que supposé. Cinq corrections :

1. **`ConsignmentPanel` n'envoyait jamais de `client_operation_id`** —
   contrairement aux quatre formulaires de mouvement (`movement-dialog.tsx`), qui
   en génèrent un à chaque soumission. Rouvrait exactement le bug corrigé côté
   serveur le jour même (§10.13, point 6) : une resoumission réseau après une
   action de consignation doublait la quantité en circulation et la caution
   perçue, sans aucune protection puisque le serveur ne peut détecter une
   resoumission qu'il ne reçoit jamais. Corrigé : `ConsignmentActionCreate`
   porte désormais le champ, généré à chaque appel comme pour les mouvements.
2. **Perte silencieuse et définitive d'une opération hors-ligne** —
   `lib/offline/sync-engine.ts` : quand le rafraîchissement du jeton d'accès
   échouait après un 401 (cookie de rafraîchissement lui-même expiré —
   réaliste après une longue coupure), l'opération en cours était classée
   "failed" au lieu de "pending", alors que le problème est celui de la
   session entière, pas de cette opération précise. Combiné à un autre
   correctif du même jour (exclure "failed" de toute relecture automatique,
   pour arrêter le spam de notifications sur une opération invalide), cela
   aurait perdu pour de bon une fiche créée ou modifiée hors-ligne dès que la
   synchronisation tombait sur une session expirée — précisément le scénario
   que toute la fonctionnalité doit couvrir. Corrigé : cette opération reste
   "pending", comme les opérations suivantes jamais tentées, pour la prochaine
   passe une fois reconnecté.
3. **Le tableau de bord gardait le filtre de l'organisation précédente après un
   changement d'organisation** — `explicitScope` (modèle/dépôt/site focalisés)
   est un état local qui ne se réinitialisait jamais au changement
   d'organisation (la page ne remonte pas). Un `model_definition_id`/`depot_id`
   de l'organisation A survivait à la bascule vers B, sans correspondance côté
   B : ni le tableau de bord épinglé de B ni la vue "Tout" ne reprenaient la
   main tant que l'utilisateur ne touchait pas un filtre à la main. Corrigé en
   séparant la page en une coquille fine (`AppHomePage`) qui force un
   remontage complet via `key={currentOrganizationId}` — même principe déjà
   utilisé ailleurs dans ce même fichier (`key={siteFieldVersion}`) et dans
   `models/[modelId]/settings/page.tsx` (`key={model.id}`), pas un nouvel
   effet de resynchronisation.
4. **Le gabarit d'affichage d'une devise éditeur était ignoré presque
   partout** — le catalogue de devises de la plateforme n'est pas validé ISO
   4217 (l'éditeur peut créer n'importe quel code à trois lettres avec son
   propre gabarit, ex. `"{amount} FCFA"` — voir §10.10). Seul l'écran
   Abonnement résolvait la vraie devise et respectait son gabarit
   (`formatWithCurrencyFormat`) ; tous les autres affichages de montant
   (rendu générique du type de champ Montant, vue Stock d'un article, panneau
   de consignation, trois des quatre vues de tableau de bord) appelaient
   `formatAmount(valeur, code)`, une simple déduction `Intl.NumberFormat` —
   silencieuse mais fausse pour tout code non-ISO (le code brut s'affichait en
   pseudo-symbole au lieu du gabarit configuré). Corrigé par un nouveau hook
   partagé (`lib/use-currency-format.ts`) qui résout la vraie devise via
   `GET /catalog/currencies` (déjà ouvert à tout utilisateur connecté, une
   seule requête partagée par tout l'appli via le cache React Query) avant
   d'appliquer `formatWithCurrencyFormat` ; `formatAmount` — désormais sans
   appelant correct possible — a été retiré plutôt que laissé comme piège pour
   un futur appel.
5. **Les pages de création/réglages de modèle n'avaient aucun garde-fou côté
   client** — contrairement à `organisation/membres`, `organisation/conflits`
   et `abonnement`, qui affichent tous un message explicite avant de rendre le
   moindre formulaire réservé à l'ADMIN, `/models/new` et
   `/models/[modelId]/settings` rendaient le formulaire complet à n'importe
   quel rôle — la seule protection réelle restait le 403 serveur
   (`Action.MANAGE_MODELS`, déjà correct), découvert seulement au clic sur
   "Enregistrer". Corrigé par le même garde que les autres écrans réservés, et
   le lien "Nouveau modèle" de la navigation masqué pour les non-administrateurs.

Vérifié par `npm run lint` et `npm run build` après chaque correctif.

## 11. Manuel utilisateur

Tenu à jour en parallèle du développement dans
[`docs/MANUEL_UTILISATION.md`](./docs/MANUEL_UTILISATION.md) — une section par
fonction livrée, jamais une section pour une fonction qui n'existe pas encore.
