#!/usr/bin/env bash
# Installe Registre sur uat.upjunoo.com, EN COHABITATION avec le nginx déjà en
# place. À exécuter sur le serveur.
#
#   cd ~/registre/deploy/uat && ./bootstrap-uat.sh
#
# Ne touche jamais à la configuration nginx existante : il ajoute un vhost pour
# `uat.upjunoo.com` et rien d'autre. upjunoo.com et about.upjunoo.com continuent
# de fonctionner pendant et après.
#
# Idempotent : relancé, il conserve les secrets déjà générés.

set -euo pipefail

DOMAIN="${DOMAIN:-uat.upjunoo.com}"
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"

log()  { printf '\n\033[1;36m[registre]\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m  %s\033[0m\n' "$1"; }
die()  { printf '\n\033[1;31m[registre] %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] && die "À lancer avec un utilisateur ordinaire, pas en root."

# --- Prérequis ---------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker est absent. Installez-le : curl -fsSL https://get.docker.com | sudo sh"
docker compose version >/dev/null 2>&1 || die "Le greffon 'docker compose' est absent."
command -v nginx >/dev/null 2>&1 || die "nginx est absent — ce script suppose qu'il est déjà en façade."

# --- Le nom pointe-t-il bien ici ? -------------------------------------------
# certbot échouerait sinon, et son message n'est pas toujours limpide.
PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || echo '')"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
log "IP publique : ${PUBLIC_IP:-inconnue} — $DOMAIN résout vers : ${RESOLVED:-rien}"
[ -n "$RESOLVED" ] || die "$DOMAIN ne résout pas. Ajoutez l'enregistrement DNS avant de continuer."
if [ -n "$PUBLIC_IP" ] && [ "$RESOLVED" != "$PUBLIC_IP" ]; then
	warn "$DOMAIN pointe vers $RESOLVED et non vers cette machine — certbot échouera."
fi

# --- Secrets -----------------------------------------------------------------
cd "$DEPLOY_DIR"
if [ -f .env ]; then
	log ".env existe déjà — secrets conservés."
else
	log "Génération des secrets"
	cp uat/.env.uat.example .env
	for key in POSTGRES_PASSWORD REGISTRE_APP_PASSWORD JWT_SECRET FILE_SIGNING_SECRET SESSION_SECRET CRON_SECRET; do
		value="$(openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40)"
		sed -i "s|^${key}=.*|${key}=${value}|" .env
	done
	chmod 600 .env
	log "Secrets écrits dans $DEPLOY_DIR/.env"
fi

# --- La pile -----------------------------------------------------------------
# Caddy ne démarre pas : il est sous le profil `standalone`, non demandé ici.
log "Construction et démarrage (plusieurs minutes au premier lancement)…"
docker compose -f docker-compose.prod.yml -f uat/docker-compose.uat.yml --env-file .env up -d --build

log "Attente de l'API…"
for _ in $(seq 1 60); do
	if curl -fsS --max-time 3 http://127.0.0.1:4001/health >/dev/null 2>&1; then
		log "API en ligne sur 127.0.0.1:4001"
		break
	fi
	sleep 3
done
curl -fsS --max-time 3 http://127.0.0.1:4001/health >/dev/null 2>&1 \
	|| warn "L'API ne répond pas encore. Voir : docker compose -f docker-compose.prod.yml -f uat/docker-compose.uat.yml logs api"

# --- Vhost nginx -------------------------------------------------------------
VHOST_SRC="$DEPLOY_DIR/uat/nginx-uat.upjunoo.com.conf"
VHOST_DST="/etc/nginx/sites-available/$DOMAIN"

if [ -f "$VHOST_DST" ]; then
	log "Le vhost $DOMAIN existe déjà — laissé tel quel (certbot l'a peut-être modifié)."
else
	log "Installation du vhost nginx"
	sudo cp "$VHOST_SRC" "$VHOST_DST"
	sudo ln -sf "$VHOST_DST" "/etc/nginx/sites-enabled/$DOMAIN"
fi

# `nginx -t` AVANT de recharger : une configuration invalide rechargée couperait
# upjunoo.com, qui est en production sur cette même machine.
sudo nginx -t || die "Configuration nginx invalide — RIEN n'a été rechargé, les sites existants sont intacts."
sudo systemctl reload nginx
log "nginx rechargé"

# --- Certificat --------------------------------------------------------------
if sudo test -d "/etc/letsencrypt/live/$DOMAIN"; then
	log "Certificat déjà présent pour $DOMAIN"
else
	if command -v certbot >/dev/null 2>&1; then
		log "Obtention du certificat Let's Encrypt"
		sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
			--redirect -m "${ACME_EMAIL:-arcoteksdev@gmail.com}" \
			|| warn "certbot a échoué — le site reste accessible en HTTP, mais la session ne tiendra pas (cookie Secure)."
	else
		warn "certbot est absent : sudo apt install certbot python3-certbot-nginx, puis sudo certbot --nginx -d $DOMAIN"
	fi
fi

cat <<EOF

  Application  https://$DOMAIN
  Vitrine      https://$DOMAIN/vitrine
  API          https://$DOMAIN/backend/openapi.json

  Vérification qui compte : connectez-vous, PUIS RECHARGEZ LA PAGE.
  Rester connecté prouve que le cookie « Secure » est accepté, donc que TLS
  fonctionne de bout en bout.

  Journaux :
    docker compose -f docker-compose.prod.yml -f uat/docker-compose.uat.yml logs -f api

EOF
