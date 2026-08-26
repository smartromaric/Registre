#!/bin/sh
# Point d'entrée unique des trois rôles du backend : API, worker Celery, Beat.
#
# Un seul fichier plutôt que trois images : c'est le même code, les mêmes
# dépendances et la même configuration — seule la commande finale change.
set -eu

role="${1:-api}"

case "$role" in
  api)
    # Les migrations tournent ICI et nulle part ailleurs.
    #
    # Le worker et Beat démarrent en parallèle de l'API : les faire migrer aussi
    # ferait tourner `alembic upgrade` trois fois en même temps sur la même base.
    # Alembic pose bien un verrou, mais deux des trois attendraient pour rien, et
    # au premier démarrage le worker se connecterait à une base encore vide.
    echo "[registre] migrations…"
    alembic upgrade head

    echo "[registre] API sur le port 8000"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
    ;;

  worker)
    # `--concurrency=2` : la machine est modeste et le balayage est court. Au-delà,
    # les workers se disputent les mêmes lignes sans rien accélérer.
    exec celery -A app.celery_app worker --loglevel=info --concurrency=2
    ;;

  beat)
    exec celery -A app.celery_app beat --loglevel=info
    ;;

  *)
    # Tout autre argument est exécuté tel quel : pratique pour `docker compose run`
    # (une session psql, un shell Python, une migration à la main).
    exec "$@"
    ;;
esac
