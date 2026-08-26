from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration centrale. Toute valeur vient de l'environnement (.env en dev)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    api_prefix: str = "/api/v1"
    # Base publique de CE backend (schéma + hôte), distincte de `frontend_base_url` :
    # sert à qualifier les liens signés du stockage local (voir app/storage/local.py).
    # Un chemin relatif (`/api/v1/files/...`) se résout dans le navigateur contre
    # l'origine de la PAGE qui l'affiche — jamais celle de l'API, qui tourne sur un
    # port différent en développement (et souvent un sous-domaine différent en
    # production). Le backend S3 n'a pas ce problème : `generate_presigned_url`
    # renvoie déjà une URL complète.
    api_public_url: str = "http://localhost:8000"

    # Connexion applicative : rôle restreint, soumis aux politiques RLS (voir app/core/database.py)
    database_url: str = "postgresql+asyncpg://registre_app:registre_app_dev_pw@localhost:5432/registre"
    # Connexion migrations : rôle propriétaire des tables (Alembic uniquement, jamais utilisée au runtime)
    database_url_migrations: str = "postgresql+psycopg://postgres:postgres@localhost:5432/registre"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    refresh_token_expire_days: int = 30

    file_signing_secret: str = "change-me-file-signing-secret"
    signed_url_expire_seconds: int = 300

    google_client_id: str | None = None
    google_client_secret: str | None = None

    redis_url: str = "redis://localhost:6379/0"

    # Secret partagé du déclencheur externe du balayage nocturne (voir
    # api/v1/routers/internal.py). Celery Beat suppose un processus qui tourne
    # en permanence ET un Redis : sur un hébergement gratuit, le service
    # s'endort et aucun des deux n'est garanti. Un appel HTTP quotidien par un
    # planificateur externe réveille le service et déclenche le balayage.
    # Absent = la route refuse tout appel (échec fermé, jamais ouvert).
    cron_secret: str | None = None

    storage_backend: str = "local"  # "local" | "s3"
    storage_local_path: str = "./var/storage"
    s3_endpoint_url: str | None = None
    s3_bucket: str = "registre"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str = "us-east-1"

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "notifications@registre.app"
    smtp_use_tls: bool = True

    cors_origins: list[str] = ["http://localhost:3000"]
    # Base des liens envoyés par e-mail (invitation, réinitialisation de mot de passe) —
    # distinct de cors_origins par intention, même si la valeur coïncide en dev.
    frontend_base_url: str = "http://localhost:3000"

    trial_period_days: int = 14
    read_only_grace_days: int = 30
    retention_months: int = 12

    # --- Normalisation des URL de base de données ----------------------------
    #
    # Les hébergeurs (Render, Heroku, Railway…) fournissent une URL au format
    # `postgres://` ou `postgresql://`, sans pilote. SQLAlchemy, lui, en déduit
    # le pilote depuis le schéma : `postgresql://` choisit psycopg2, qui n'est
    # pas installé — et surtout le moteur applicatif est *asynchrone* et exige
    # asyncpg. Le message d'erreur, lui, parle de module introuvable et ne dit
    # rien de l'URL.
    #
    # La documentation demandait donc de recopier l'URL à la main en
    # `postgresql+asyncpg://` d'un côté et `postgresql+psycopg://` de l'autre.
    # Une manipulation manuelle, invisible, à faire deux fois, au moment précis
    # où l'on découvre la plateforme : c'est le premier déploiement qui échoue.
    # On la fait ici, une fois pour toutes.

    @field_validator("database_url", mode="after")
    @classmethod
    def _force_async_driver(cls, value: str) -> str:
        return _with_driver(value, "asyncpg")

    @field_validator("database_url_migrations", mode="after")
    @classmethod
    def _force_sync_driver(cls, value: str) -> str:
        return _with_driver(value, "psycopg")


def _with_driver(url: str, driver: str) -> str:
    """Impose le pilote SQLAlchemy sur une URL PostgreSQL, sans toucher au reste.

    Une URL qui nomme déjà *un* pilote est laissée telle quelle : c'est un choix
    explicite de l'exploitant, et l'écraser serait plus surprenant qu'utile.
    Une URL qui n'est pas PostgreSQL (SQLite en test, par exemple) n'est pas
    concernée.
    """
    scheme, separator, rest = url.partition("://")
    if not separator:
        return url
    base, _, existing_driver = scheme.partition("+")
    if base not in ("postgres", "postgresql"):
        return url
    if existing_driver:
        return url
    return f"postgresql+{driver}://{rest}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
