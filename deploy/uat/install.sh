#!/usr/bin/env bash
# Installation en UNE commande, à lancer sur le serveur :
#
#   curl -fsSL https://raw.githubusercontent.com/smartromaric/Registre/main/deploy/uat/install.sh | bash
#
# Récupère le dépôt puis passe la main à `bootstrap-uat.sh`. Ce détour n'est pas
# décoratif : lancé par `curl | bash`, un script n'a pas de fichier sur disque —
# `$0` vaut « bash » — et ne peut donc pas trouver les fichiers voisins dont il a
# besoin (compose, vhost nginx, modèle de .env). On clone d'abord, on exécute
# depuis le disque ensuite.
#
# Idempotent : relancé, il met le dépôt à jour et conserve les secrets déjà
# générés.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/smartromaric/Registre.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/registre}"
BRANCH="${BRANCH:-main}"

log()  { printf '\n\033[1;36m[registre]\033[0m %s\n' "$1"; }
die()  { printf '\n\033[1;31m[registre] %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] && die "À lancer avec un utilisateur ordinaire (sudo est utilisé au besoin), pas en root."
command -v git >/dev/null 2>&1 || die "git est absent : sudo apt install -y git"

if [ -d "$INSTALL_DIR/.git" ]; then
	log "Mise à jour du dépôt dans $INSTALL_DIR"
	git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH"
	# `reset --hard` et non `pull` : le serveur ne doit jamais avoir de
	# modifications locales à fusionner. Ce qui compte est ici sous git ;
	# `deploy/.env`, lui, n'est pas suivi et survit donc à cette remise à plat.
	git -C "$INSTALL_DIR" reset --hard --quiet "origin/$BRANCH"
else
	log "Clonage dans $INSTALL_DIR"
	git clone --quiet --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

log "Version déployée : $(git -C "$INSTALL_DIR" log --oneline -1)"

cd "$INSTALL_DIR/deploy/uat"
chmod +x bootstrap-uat.sh
exec ./bootstrap-uat.sh
