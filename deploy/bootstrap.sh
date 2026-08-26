#!/usr/bin/env bash
# Prépare le serveur et lance la pile. À exécuter SUR LE VPS, une seule fois.
#
#   curl -fsSL <dépôt>/deploy/bootstrap.sh | bash
# ou, depuis un dépôt déjà cloné :
#   cd Registre/deploy && ./bootstrap.sh
#
# Idempotent : relancé, il ne recrée pas les secrets déjà présents et ne
# réinstalle pas ce qui est là. C'est ce qui permet de le rejouer sans crainte
# après une erreur en cours de route.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/smartromaric/Registre.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/registre}"

log() { printf '\n\033[1;36m[registre]\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31m[registre] %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] && die "À lancer avec un utilisateur ordinaire (sudo est utilisé au besoin), pas en root."

# --- Docker ------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
	log "Installation de Docker…"
	curl -fsSL https://get.docker.com | sudo sh
	sudo usermod -aG docker "$USER"
	NEEDS_RELOGIN=1
else
	log "Docker déjà présent : $(docker --version)"
fi

docker compose version >/dev/null 2>&1 || die "Le greffon 'docker compose' est absent. Installez docker-compose-plugin."

# --- La machine est-elle libre ? ---------------------------------------------
# Un serveur web deja en place tient 80/443 : Caddy echouerait a demarrer, et
# s'il y parvenait il couperait le site en service. Mieux vaut s'arreter ici.
if sudo ss -lntp 2>/dev/null | grep -qE ':(80|443)\s'; then
	echo
	echo "  Un service ecoute deja sur 80 ou 443 :"
	sudo ss -lntp | grep -E ':(80|443)\s' | sed 's/^/      /'
	echo
	die "Ce script suppose une machine libre. Pour cohabiter avec un serveur web existant, suivez docs/DEPLOIEMENT_VPS.md, section « Cohabiter avec un nginx deja en place »."
fi

# --- Pare-feu ----------------------------------------------------------------
# Seuls SSH, HTTP et HTTPS. Postgres et Redis ne sont joignables que depuis le
# réseau interne de la pile : les exposer serait le trou de sécurité classique
# d'un premier déploiement.
if command -v ufw >/dev/null 2>&1; then
	log "Pare-feu : SSH, HTTP, HTTPS uniquement"
	sudo ufw allow OpenSSH >/dev/null
	sudo ufw allow 80/tcp >/dev/null
	sudo ufw allow 443/tcp >/dev/null
	sudo ufw --force enable >/dev/null
	sudo ufw status numbered | sed 's/^/    /'
fi

# --- Code source -------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
	log "Mise à jour du dépôt dans $INSTALL_DIR"
	git -C "$INSTALL_DIR" pull --ff-only
else
	log "Clonage dans $INSTALL_DIR"
	git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR/deploy"

# --- Secrets -----------------------------------------------------------------
if [ -f .env ]; then
	log ".env existe déjà — secrets conservés."
else
	log "Génération des secrets"
	cp .env.example .env
	# `openssl rand` et non un mot inventé : ces valeurs protègent les sessions
	# et les liens de téléchargement de toutes les organisations.
	for key in POSTGRES_PASSWORD REGISTRE_APP_PASSWORD JWT_SECRET FILE_SIGNING_SECRET SESSION_SECRET CRON_SECRET; do
		value="$(openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40)"
		# Le séparateur | évite d'avoir à échapper les / d'un base64.
		sed -i "s|^${key}=.*|${key}=${value}|" .env
	done
	chmod 600 .env
	log "Secrets écrits dans $(pwd)/.env (lisible par vous seul)"
fi

# --- Vérification des domaines ----------------------------------------------
# Un nom qui ne résout pas vers cette machine fait échouer Let's Encrypt, et
# Caddy réessaiera en boucle sans que la cause soit visible dans les logs de
# l'application. Autant le dire tout de suite.
set -a; . ./.env; set +a
PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || echo '')"
log "IP publique de ce serveur : ${PUBLIC_IP:-inconnue}"
for domain in "$SITE_DOMAIN" "$APP_DOMAIN" "$API_DOMAIN"; do
	resolved="$(getent hosts "$domain" | awk '{print $1}' | head -1 || true)"
	if [ -z "$resolved" ]; then
		printf '    %-40s ne résout pas — Let%ss Encrypt échouera\n' "$domain" "'"
	elif [ -n "$PUBLIC_IP" ] && [ "$resolved" != "$PUBLIC_IP" ]; then
		printf '    %-40s résout vers %s (attendu %s)\n' "$domain" "$resolved" "$PUBLIC_IP"
	else
		printf '    %-40s OK (%s)\n' "$domain" "$resolved"
	fi
done

# --- Lancement ---------------------------------------------------------------
log "Construction et démarrage (plusieurs minutes au premier lancement)…"
# `--profile standalone` demarre Caddy. Sur une machine qui fait deja tourner
# un serveur web, utiliser plutot la surcouche uat/ (voir docs/DEPLOIEMENT_VPS.md).
docker compose -f docker-compose.prod.yml --env-file .env --profile standalone up -d --build

log "État des services"
docker compose -f docker-compose.prod.yml --profile standalone ps

cat <<EOF

  Vitrine      https://${SITE_DOMAIN}
  Application  https://${APP_DOMAIN}
  API          https://${API_DOMAIN}/openapi.json

  Les certificats prennent de quelques secondes à deux minutes à s'obtenir.
  Suivre :   docker compose -f docker-compose.prod.yml logs -f caddy

EOF

if [ "${NEEDS_RELOGIN:-0}" = "1" ]; then
	printf '\033[1;33m  Reconnectez-vous en SSH pour utiliser docker sans sudo.\033[0m\n\n'
fi
