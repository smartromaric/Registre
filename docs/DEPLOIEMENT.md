# Déploiement sur Render

Mode d'emploi pour mettre Registre en ligne. À lire en entier avant de
commencer : la section « Ce que l'offre gratuite ne peut pas faire » décide de
ce qui est réaliste ou non pour un vrai client.

---

## 1. Ce que l'offre gratuite ne peut pas faire

Ces limites viennent de Render, pas de l'application. Les connaître d'avance
évite de découvrir en production ce qui manque.

| Limite | Conséquence réelle | Contournement |
| --- | --- | --- |
| **La base PostgreSQL gratuite expire au bout de 30 jours** | Toutes les données sont supprimées à l'échéance. | Passer la base en payant (~7 $/mois) dès qu'il y a de vraies données, ou sauvegarder et recréer tous les mois. |
| **Le système de fichiers est éphémère** | Tout document ou photo téléversé **disparaît** à chaque redéploiement ou redémarrage. | Obligatoire : un stockage objet compatible S3 (§3). C'est déjà prévu dans `render.yaml`. |
| **Le service s'endort après 15 min d'inactivité** | Première visite après une pause : ~50 s d'attente. Et surtout, aucune tâche planifiée interne ne tourne pendant le sommeil. | Un planificateur externe réveille le service et déclenche le balayage (§5). |
| **Pas de Redis gratuit durable** | Celery Beat, prévu pour le balayage nocturne, ne peut pas tourner. | Même solution qu'au-dessus : déclencheur HTTP externe (§5). |

> **En résumé** : parfait pour montrer l'application à un client. Pour un
> usage réel avec de vraies données, il faut au minimum passer la base en
> payant — sans quoi tout est perdu au bout de 30 jours.

---

## 2. Base de données et premier déploiement

1. Pousser le dépôt sur GitHub (déjà fait).
2. Sur [render.com](https://render.com) → **New** → **Blueprint**, sélectionner
   le dépôt. Render lit `render.yaml` à la racine et propose les deux services
   et la base.
3. Laisser Render créer la base **avant** de renseigner les variables : c'est
   elle qui fournit l'URL de connexion.

### Les deux URL de base de données

**Rien à faire : elles sont câblées automatiquement** par `render.yaml`, depuis
la base déclarée dans le même fichier.

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion applicative, soumise aux politiques RLS |
| `DATABASE_URL_MIGRATIONS` | Alembic uniquement, jamais utilisée au runtime |

Render fournit une URL `postgresql://…` sans pilote, là où SQLAlchemy en déduit
psycopg2 — absent du projet — et où le moteur applicatif exige asyncpg. Cette
version de la documentation demandait de réécrire le préfixe à la main, deux
fois, depuis l'onglet *Connect*. C'était la manipulation la plus oubliée d'un
premier déploiement, et son message d'erreur ne parle jamais de l'URL.
`Settings` normalise désormais le préfixe lui-même (`app/core/config.py`) : une
URL qui nomme déjà un pilote est respectée, les autres reçoivent le bon.

### Un seul rôle Postgres, et ce que cela impliquait

L'offre gratuite de Render ne fournit **qu'un utilisateur**. Ce compte crée les
tables (Alembic) et fait tourner l'application : il en est donc propriétaire.

Or en PostgreSQL, `ENABLE ROW LEVEL SECURITY` **ne s'applique pas au
propriétaire de la table**. Une version précédente de ce document affirmait que
« les politiques RLS restent actives » dans cette configuration : c'était faux.
Elles devenaient entièrement inertes, sans erreur ni avertissement, et le
cloisonnement multi-organisation ne tenait plus que par les filtres écrits dans
le code applicatif.

Mesuré sur la base de développement, sans contexte d'organisation posé :

```
rôle applicatif restreint   ->  records: 0    memberships: 0
rôle propriétaire ordinaire ->  records: 46   memberships: 42   <- tout est visible
```

La migration `a007fa36a9d1` ajoute `FORCE ROW LEVEL SECURITY` sur les 25 tables
concernées : le propriétaire est désormais soumis aux mêmes politiques que tout
le monde, et l'isolation tient quel que soit le nombre de rôles offerts par
l'hébergeur. Un test (`tests/test_rls_is_forced.py`) échoue si une table ajoutée
plus tard oublie ce `FORCE`.

> Conséquence à connaître : Alembic tourne sous le propriétaire. Une migration
> future qui modifierait des **données** sur ces tables devra poser
> `app.current_org_id`, sous peine de ne toucher aucune ligne — silencieusement.
> Aucune migration existante n'est concernée, toutes sont structurelles.

---

## 3. Stockage des fichiers — obligatoire

Sans cela, **les documents et photos téléversés seront perdus** à chaque
redéploiement. `render.yaml` force donc `STORAGE_BACKEND=s3`.

Deux offres gratuites qui conviennent :

- **Cloudflare R2** — 10 Go gratuits, pas de frais de sortie. Recommandé.
- **Backblaze B2** — 10 Go gratuits.

Après avoir créé un bucket (nom suggéré : `registre`), renseigner sur le
service `registre-api` :

| Variable | Exemple (R2) |
| --- | --- |
| `S3_ENDPOINT_URL` | `https://<compte>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | `registre` |
| `S3_ACCESS_KEY` | clé d'accès du jeton R2 |
| `S3_SECRET_KEY` | clé secrète du jeton R2 |
| `S3_REGION` | `auto` |

---

## 4. URL publiques et CORS

Les deux services reçoivent une URL `*.onrender.com`. Il faut les déclarer de
part et d'autre, sinon le navigateur bloque les appels.

Sur **`registre-api`** :

| Variable | Valeur |
| --- | --- |
| `API_PUBLIC_URL` | `https://registre-api.onrender.com` |
| `FRONTEND_BASE_URL` | `https://registre-web.onrender.com` |
| `CORS_ORIGINS` | `["https://registre-web.onrender.com"]` |

Sur **`registre-web`** :

| Variable | Valeur |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://registre-api.onrender.com` |

> `API_PUBLIC_URL` n'est pas décoratif : il qualifie les liens signés des
> fichiers. Mal renseigné, les documents renvoient 404 — c'est exactement le
> bug corrigé au §10.15 de `PRODUCT.md`.

---

## 5. Balayage nocturne des échéances

**Sans cette étape, aucune alerte ne sera jamais émise** : le moteur ne tourne
que lorsqu'on le déclenche, et le service dort la nuit.

`render.yaml` génère un `CRON_SECRET`. Le récupérer dans l'onglet *Environment*
de `registre-api`, puis créer une tâche sur un planificateur externe gratuit
([cron-job.org](https://cron-job.org) convient) :

- **URL** : `https://registre-api.onrender.com/api/v1/internal/nightly-scan`
- **Méthode** : `POST`
- **En-tête** : `X-Cron-Secret: <la valeur générée>`
- **Fréquence** : une fois par jour, à une heure creuse (02 h 00)

La réponse indique le nombre d'alertes créées par organisation — de quoi
vérifier que la tâche fait réellement son travail plutôt que de renvoyer un
200 muet. Le moteur est idempotent : un appel en double le même jour ne crée
aucun doublon.

---

## 6. Connexion Google (facultatif)

Tant que ce n'est pas configuré, le bouton affiche un état « non configuré »
honnête et la connexion par mot de passe reste pleinement utilisable.

Pour l'activer, ajouter l'origine de production dans la console Google Cloud
(**Origines JavaScript autorisées** → `https://registre-web.onrender.com`),
puis renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` côté API et
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` côté web.

---

## 7. Envoi d'e-mails (facultatif)

Sans SMTP, les invitations et réinitialisations de mot de passe ne partent pas
par e-mail — l'application le dit clairement et propose le lien d'invitation à
transmettre à la main. Pour activer l'envoi, renseigner `SMTP_HOST`,
`SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`.

---

## 8. Après le premier déploiement

1. Ouvrir `https://registre-web.onrender.com` et créer le premier compte —
   il devient administrateur de son organisation.
2. Vérifier qu'un document se téléverse **et se réaffiche** (valide le §3).
3. Déclencher la tâche cron une fois à la main et vérifier la réponse
   (valide le §5).
4. Pour l'espace éditeur (§4.3), passer un compte en administrateur de
   plateforme — il n'existe aucune route pour cela, c'est délibéré : à faire
   en base, `UPDATE users SET is_platform_admin = true WHERE email = '…';`.

---

## 9. Avant un vrai usage client

- [ ] Base PostgreSQL en offre payante (sinon perte totale à 30 jours)
- [ ] Sauvegardes de la base vérifiées, pas seulement activées
- [ ] `JWT_SECRET`, `FILE_SIGNING_SECRET`, `SESSION_SECRET`, `CRON_SECRET`
      générés et jamais partagés
- [ ] Rôle PostgreSQL applicatif restreint rétabli (§2)
- [ ] Nom de domaine propre plutôt que `*.onrender.com`
- [ ] Purge des données de test (voir les organisations de démonstration)
