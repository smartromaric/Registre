# Application Next.js — image de production.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` et non `npm install` : installe exactement le verrou, et échoue si le
# verrou et le manifeste divergent — ce qu'on veut d'un build de production.
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ATTENTION : ces valeurs sont figées DANS LE BUNDLE au moment du build.
#
# Tout ce qui est préfixé `NEXT_PUBLIC_` finit dans le JavaScript envoyé au
# navigateur : ce ne sont pas des variables d'exécution. Les changer impose de
# reconstruire l'image, pas seulement de redémarrer le conteneur. C'est la
# raison pour laquelle elles sont des `ARG` ici et non des `environment:` dans
# compose — l'inverse donnerait une application qui appelle `undefined/api/v1`.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "NEXT_PUBLIC_API_URL est obligatoire au build" && exit 1)
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN addgroup -g 10001 registre && adduser -u 10001 -G registre -D registre

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER registre
EXPOSE 3000

CMD ["npm", "run", "start"]
