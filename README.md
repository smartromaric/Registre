# Registre

Plateforme de gestion en ligne, par abonnement, dans laquelle chaque entreprise
déclare elle-même ce qu'elle suit — véhicules, stocks, documents, personnel —
et se fait prévenir avant qu'une échéance ne tombe ou qu'un stock ne s'épuise.

> Nom de travail provisoire (cahier des charges §17.2, Q1).

Le cahier des charges fonctionnel complet est dans
[`cahier-des-charges-registre.html`](./cahier-des-charges-registre.html).
La fiche produit et les décisions d'architecture sont dans [`PRODUCT.md`](./PRODUCT.md).
Le manuel utilisateur, tenu à jour au fil du développement, est dans
[`docs/MANUEL_UTILISATION.md`](./docs/MANUEL_UTILISATION.md).

## Stack

- **Backend** — Python 3.13, FastAPI, SQLAlchemy 2 (async), PostgreSQL (RLS pour le
  cloisonnement multi-entreprises), Celery + Redis pour les tâches planifiées.
- **Frontend** — Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui,
  Framer Motion, TanStack Query/Table.

Détails complets, schémas et justifications dans [`PRODUCT.md`](./PRODUCT.md).

## Démarrage rapide

```bash
# Services d'infrastructure (Postgres, Redis, MinIO)
docker compose up -d

# Backend
cd backend
cp .env.example .env
uv sync   # ou: pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Détails complets dans `backend/README.md` et `frontend/README.md`.

## Structure du dépôt

```
backend/     API FastAPI, moteur de fiches, alertes, stock, abonnements
frontend/    Application Next.js
docs/        Manuel utilisateur, notes d'architecture complémentaires
```

## État d'avancement

Voir la section « Feuille de route et état d'avancement » de `PRODUCT.md` —
tenue à jour à chaque lot livré.
