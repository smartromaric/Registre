# API FastAPI — image de production.
#
# `python:3.12-slim` et non `alpine` : les roues précompilées de `asyncpg`,
# `psycopg[binary]`, `bcrypt` et `pillow` n'existent pas pour musl. Sur Alpine,
# pip les recompile — plusieurs minutes de build, et il faut traîner toute la
# chaîne de compilation dans l'image finale.

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Les dépendances d'abord, le code ensuite : tant que `pyproject.toml` ne change
# pas, Docker réutilise la couche d'installation. Un changement de code seul
# reconstruit alors en quelques secondes au lieu de plusieurs minutes.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install --prefix=/install .

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# `curl` sert au healthcheck de compose ; rien d'autre n'est ajouté.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Un utilisateur non privilégié : un conteneur qui tourne en root partage cet
# uid avec l'hôte dès qu'un volume est monté.
RUN useradd --create-home --uid 10001 registre

WORKDIR /app

COPY --from=builder /install /usr/local
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY docker-entrypoint.sh /usr/local/bin/registre-entrypoint
RUN chmod +x /usr/local/bin/registre-entrypoint

# Stockage des fichiers : un volume est monté ici (voir docker-compose.prod.yml).
RUN mkdir -p /var/registre/storage && chown -R registre:registre /var/registre

USER registre

EXPOSE 8000

ENTRYPOINT ["registre-entrypoint"]
CMD ["api"]
