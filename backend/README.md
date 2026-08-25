# Registre — backend

API FastAPI. Voir [`../PRODUCT.md`](../PRODUCT.md) pour l'architecture complète.

## Prérequis

- Python 3.12+
- PostgreSQL 16+ (local ou via `docker compose up -d` à la racine du dépôt)
- Redis (pour Celery — optionnel tant que le lot 1 n'introduit pas de tâches planifiées)

## Installation

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -e ".[dev]"
cp .env.example .env            # puis adapter
```

### Base de données locale (sans Docker)

Si PostgreSQL tourne déjà en local, créer la base et un rôle applicatif **restreint**
(c'est ce rôle qui est réellement soumis aux politiques RLS — jamais le
superutilisateur, qui les contourne toujours) :

```sql
CREATE DATABASE registre;
CREATE ROLE registre_app LOGIN PASSWORD 'registre_app_dev_pw';
GRANT CONNECT ON DATABASE registre TO registre_app;
\c registre
GRANT USAGE ON SCHEMA public TO registre_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO registre_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO registre_app;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

`DATABASE_URL_MIGRATIONS` (dans `.env`) doit pointer vers un rôle **propriétaire**
des tables (ex. `postgres`) : c'est lui qui exécute les migrations. `DATABASE_URL`
pointe vers `registre_app` : c'est lui que l'application utilise au runtime, et
c'est justement parce qu'il n'est pas propriétaire des tables que les politiques
RLS s'appliquent à lui sans exception.

## Migrations

```bash
alembic upgrade head
alembic revision --autogenerate -m "description du changement"
```

## Lancer l'API

```bash
uvicorn app.main:app --reload
```

Documentation interactive : http://localhost:8000/docs

## Tests

```bash
pytest
```

Les tests tournent contre une vraie base PostgreSQL locale (celle de `.env`),
dans une transaction annulée à la fin de chaque test — aucune donnée ne persiste
entre deux exécutions. Voir `tests/test_tenant_isolation.py` pour la preuve que
le cloisonnement multi-organisation est appliqué par la base elle-même (RLS),
pas seulement par le code applicatif (cahier des charges §14.1, §16.1).
