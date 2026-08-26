#!/bin/bash
# Crée le rôle applicatif RESTREINT, à la toute première initialisation de la base.
#
# C'est la pièce qui manquait à un hébergement managé d'entrée de gamme, et la
# raison pour laquelle un VPS vaut mieux ici : deux rôles distincts.
#
#   - le rôle propriétaire (POSTGRES_USER) crée les tables, via Alembic ;
#   - `registre_app` s'y connecte au runtime SANS en être propriétaire.
#
# Les politiques RLS s'appliquent alors à lui de plein droit. Depuis la migration
# `a007fa36a9d1` elles s'appliquent aussi au propriétaire (`FORCE ROW LEVEL
# SECURITY`), mais garder deux rôles reste la bonne défense en profondeur : le
# compte qui tourne en permanence ne peut ni créer, ni modifier, ni supprimer une
# table, et ne peut donc pas non plus retirer le `FORCE` lui-même.
#
# `ALTER DEFAULT PRIVILEGES` est le point subtil : les tables n'existent pas
# encore quand ce script tourne (les migrations viennent après). On déclare donc
# les droits À L'AVANCE, pour toute table que le propriétaire créera ensuite.
# Sans cela, il faudrait re-jouer un GRANT après chaque migration créant une
# table — et l'oublier une fois suffit à mettre l'application à genoux.

set -euo pipefail

if [ -z "${REGISTRE_APP_PASSWORD:-}" ]; then
	echo "REGISTRE_APP_PASSWORD est obligatoire (voir deploy/.env)" >&2
	exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE ROLE registre_app LOGIN PASSWORD '${REGISTRE_APP_PASSWORD}';

	GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO registre_app;
	GRANT USAGE ON SCHEMA public TO registre_app;

	ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
		GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO registre_app;
	ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
		GRANT USAGE, SELECT ON SEQUENCES TO registre_app;

	CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL

echo "[registre] rôle applicatif restreint 'registre_app' créé"
