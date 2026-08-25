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
| 5 | Mode hors-ligne (PWA, file d'opérations, synchronisation) | ⬜ |
| 6 | Notifications WhatsApp | ⬜ (hors périmètre v1, architecture prête) |

Le frontend avance en parallèle, sur ses propres jalons (fondations d'abord, puis un
écran par lot backend livré) :

| Frontend | Contenu | Statut |
| --- | --- | --- |
| Fondations | Next.js + design system clair/sombre + auth (Google et e-mail) + onboarding + coquille applicative | ✅ |
| Fiches | Constructeur de modèles, formulaires dynamiques, liste/détail de fiche, bibliothèque de modèles | ✅ |
| Stock | Dépôts, articles/variantes, saisie de mouvements, seuils | ✅ |
| Tableaux de bord | Vue globale puis focalisable par modèle (§10.2) | ⬜ |
| Abonnements/éditeur | Écrans de facturation, espace éditeur | ⬜ |

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

Non fait volontairement à ce stade (arrive avec les lots suivants) : réinitialisation de
mot de passe par e-mail, 2FA, flux d'acceptation d'invitation par e-mail — la mécanique
d'invitation existe déjà côté données, l'envoi de l'e-mail arrivera avec le moteur de
notifications du lot 1 plutôt que d'être dupliqué ici.

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

Non fait volontairement à ce stade : filtres/recherche avancée sur les fiches (lot 3),
focalisation des tableaux de bord (lot 3), Celery Beat pour le balayage automatique
nocturne (le moteur est prêt et idempotent ; le déclenchement quotidien automatique
attend un environnement avec Redis provisionné — en attendant, `POST
.../alerts/run-scan` permet un déclenchement manuel ou par cron externe).

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
  via `/catalog/offers` et `/catalog/currencies` pour choisir une offre.
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
  d'audit de l'organisation concernée).

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

Non fait volontairement : génération de factures en PDF (les données de facture
sont exposées via l'API ; le rendu PDF est un raffinement possible sans changer
le modèle), intégration d'un opérateur de paiement mobile (explicitement lot
ultérieur, §12.4 — le modèle `Payment` est conçu pour l'accueillir sans
réécriture), téléversement d'une capture du reçu de paiement, annonces de
l'éditeur aux organisations, statistiques d'activité du service.

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

## 11. Manuel utilisateur

Tenu à jour en parallèle du développement dans
[`docs/MANUEL_UTILISATION.md`](./docs/MANUEL_UTILISATION.md) — une section par
fonction livrée, jamais une section pour une fonction qui n'existe pas encore.
