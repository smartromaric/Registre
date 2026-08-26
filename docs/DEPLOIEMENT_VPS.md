# Déploiement sur un serveur dédié (VPS)

Pile complète sur une seule machine : PostgreSQL, Redis, l'API, l'application,
le site vitrine, le planificateur nocturne et une façade HTTPS. Tout est décrit
dans `deploy/docker-compose.prod.yml`.

Pour l'hébergement gratuit chez Render, voir plutôt [DEPLOIEMENT.md](./DEPLOIEMENT.md).

---

## 1. Pourquoi un VPS vaut mieux ici

Trois choses qu'une offre gratuite en conteneur ne permet pas, et qui comptent
pour ce produit :

| | Offre gratuite (Render) | VPS |
| --- | --- | --- |
| Disponibilité | s'endort après 15 min, ~50 s au réveil | permanente |
| Base de données | supprimée après 30 jours | permanente |
| Fichiers téléversés | perdus à chaque redéploiement | volume persistant |
| Rôles PostgreSQL | **un seul** | deux, comme prévu au §14.1 |
| Balayage nocturne | planificateur externe à brancher | Celery Beat, comme prévu au §8.2 |

Le point sur les rôles n'est pas cosmétique. L'application se connecte avec un
rôle **restreint** qui n'est pas propriétaire des tables : c'est ce qui donne
tout leur effet aux politiques d'isolation. Avec un seul rôle, ce compte crée
les tables *et* fait tourner l'application — voir
[DEPLOIEMENT.md](./DEPLOIEMENT.md#un-seul-rôle-postgres-et-ce-que-cela-impliquait)
pour ce que cela impliquait avant la migration `a007fa36a9d1`.

---

## 2. Le point à comprendre avant de commencer : il faut un nom de domaine

**Une adresse IP nue ne suffit pas.** Le cookie de session est posé avec
l'attribut `Secure` en production (`frontend/src/lib/session.ts`), et un
navigateur **refuse** un tel cookie servi en clair. Sur `http://<ip>`, la
session ne survivrait à aucun rechargement : l'utilisateur retomberait sur
l'écran de connexion à chaque fois.

Il faut donc du HTTPS. Or Let's Encrypt ne délivre pas de certificat pour une
adresse IP : il lui faut un nom.

**Solution sans rien acheter : `sslip.io`.** Tout nom de la forme
`<préfixe>.<ip-avec-tirets>.sslip.io` résout vers cette IP, sans inscription ni
configuration. Pour `194.29.101.141` :

```
194-29-101-141.sslip.io            → vitrine
app.194-29-101-141.sslip.io        → application
api.194-29-101-141.sslip.io        → API
```

Let's Encrypt sait valider ces noms, et Caddy obtient puis renouvelle les
certificats tout seul. Le jour où un vrai domaine est acheté, seules **trois
lignes de `deploy/.env`** changent.

---

## 3. Installation

Sur le serveur, en tant qu'utilisateur ordinaire (pas root) :

```bash
git clone https://github.com/smartromaric/Registre.git ~/registre
cd ~/registre/deploy
./bootstrap.sh
```

Le script installe Docker si besoin, ferme le pare-feu sur tout sauf SSH/HTTP/
HTTPS, **génère les secrets** avec `openssl rand`, vérifie que les trois noms
résolvent bien vers cette machine, puis construit et démarre la pile.

Il est **idempotent** : relancé après une erreur, il conserve les secrets déjà
générés et ne réinstalle rien inutilement.

Compter 5 à 10 minutes au premier lancement (construction des images), puis
quelques secondes à deux minutes pour l'obtention des certificats.

```bash
docker compose -f docker-compose.prod.yml logs -f caddy   # suivre les certificats
docker compose -f docker-compose.prod.yml ps              # état des services
```

---

## 4. Ce que le script ne fait pas

**Connexion Google.** Laisser `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` vides
tant que les URL de production ne sont pas déclarées dans la console Google
Cloud — l'écran affiche alors un état « non configuré » honnête, et la connexion
par mot de passe reste utilisable. Une fois les identifiants obtenus :

- origine JavaScript autorisée : `https://app.<domaine>`
- URI de redirection autorisé : `https://app.<domaine>/login`

Puis `docker compose -f docker-compose.prod.yml up -d --build web` — le
rebuild est nécessaire, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` étant figée dans le
bundle envoyé au navigateur.

**Envoi d'e-mails.** Sans `SMTP_*`, les invitations et les réinitialisations de
mot de passe ne partent pas. L'application le signale plutôt que de faire croire
à un envoi réussi.

**Sauvegardes.** Rien n'est sauvegardé automatiquement. Deux volumes portent
tout ce qui ne se reconstruit pas :

```bash
# Base de données
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U registre_owner registre | gzip > registre-$(date +%F).sql.gz

# Documents et photos
docker run --rm -v registre_storage:/data -v "$PWD":/sortie alpine \
  tar czf /sortie/storage-$(date +%F).tar.gz -C /data .
```

À placer dans une tâche `cron` et à copier **hors du serveur**.

---

## 5. Mettre à jour

```bash
cd ~/registre && git pull
cd deploy && docker compose -f docker-compose.prod.yml up -d --build
```

Les migrations tournent au démarrage du service `api`, et là seulement — le
worker et Beat attendent qu'il soit sain avant de démarrer.

---

## 6. Vérifications après déploiement

- [ ] `https://<site>` affiche la vitrine, animation comprise
- [ ] `https://app.<domaine>` permet de créer un compte
- [ ] **Rafraîchir la page une fois connecté** — rester connecté prouve que le
      cookie `Secure` est bien accepté, donc que TLS fonctionne
- [ ] Créer un modèle, une fiche avec une échéance proche, puis déclencher le
      balayage : `docker compose -f docker-compose.prod.yml exec beat \
      celery -A app.celery_app call app.tasks.alerts.run_nightly_alert_scan`
- [ ] Téléverser une photo, redémarrer la pile, vérifier qu'elle s'affiche
      encore (le volume persiste)
- [ ] Exporter un modèle en CSV — le nom du fichier doit porter ses accents

---

## 7. Sécurité — ce qui reste à faire à la main

- **Changer le mot de passe SSH** et passer à une clé publique
  (`ssh-copy-id`), puis désactiver l'authentification par mot de passe :
  `PasswordAuthentication no` dans `/etc/ssh/sshd_config`.
- **`fail2ban`** (`sudo apt install fail2ban`) : la machine est exposée, les
  tentatives automatisées sur le port 22 commencent dans l'heure.
- **Mises à jour automatiques** : `sudo apt install unattended-upgrades`.
- `deploy/.env` contient tous les secrets. Il est en `chmod 600` et ignoré par
  git — ne jamais le committer, ne jamais le copier en clair.
