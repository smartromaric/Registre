# Site vitrine — export statique servi par Caddy.
#
# Le site n'a aucun serveur applicatif : `next.config.ts` produit des fichiers
# plats dans `out/`. L'image finale ne contient donc ni Node, ni les
# dépendances — seulement Caddy et le HTML.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Figée dans le bundle au build, comme pour l'application : c'est l'adresse vers
# laquelle pointent tous les appels à l'action de la page.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN test -n "$NEXT_PUBLIC_APP_URL" || (echo "NEXT_PUBLIC_APP_URL est obligatoire au build" && exit 1)
RUN npm run build

FROM caddy:2-alpine AS runner
COPY --from=builder /app/out /srv
COPY Caddyfile.static /etc/caddy/Caddyfile
EXPOSE 80
