from functools import lru_cache

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
