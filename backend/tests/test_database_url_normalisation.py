"""Normalisation des URL de base de données fournies par l'hébergeur.

Render, Heroku et consorts exposent une URL `postgres://` ou `postgresql://`,
sans pilote. SQLAlchemy en déduit alors psycopg2, absent du projet, et le moteur
applicatif — asynchrone — exige de toute façon asyncpg. L'erreur qui en résulte
parle de module introuvable et ne mentionne jamais l'URL : c'est le premier
déploiement qui échoue, sur une manipulation manuelle oubliée.
"""

import pytest

from app.core.config import _with_driver


@pytest.mark.parametrize(
    ("given", "driver", "expected"),
    [
        # Le format exact que Render fournit.
        (
            "postgresql://u:p@dpg-abc.oregon-postgres.render.com/registre",
            "asyncpg",
            "postgresql+asyncpg://u:p@dpg-abc.oregon-postgres.render.com/registre",
        ),
        # Heroku utilise encore l'ancien schéma `postgres://`.
        ("postgres://u:p@host:5432/db", "asyncpg", "postgresql+asyncpg://u:p@host:5432/db"),
        ("postgres://u:p@host:5432/db", "psycopg", "postgresql+psycopg://u:p@host:5432/db"),
    ],
)
def test_a_driverless_url_gets_the_right_driver(given: str, driver: str, expected: str):
    assert _with_driver(given, driver) == expected


def test_an_explicit_driver_is_never_overridden():
    """Un pilote déjà nommé est un choix de l'exploitant : on n'y touche pas."""
    url = "postgresql+psycopg://u:p@host/db"
    assert _with_driver(url, "asyncpg") == url


def test_query_string_and_credentials_survive():
    """Le certificat SSL exigé par certains hébergeurs voyage dans la query :
    la perdre rendrait la connexion impossible, sans rapport apparent."""
    url = "postgresql://u:p%40ssw0rd@host:5432/db?sslmode=require&application_name=registre"
    assert _with_driver(url, "asyncpg") == (
        "postgresql+asyncpg://u:p%40ssw0rd@host:5432/db?sslmode=require&application_name=registre"
    )


def test_a_non_postgres_url_is_left_alone():
    url = "sqlite+aiosqlite:///./test.db"
    assert _with_driver(url, "asyncpg") == url


def test_a_malformed_value_is_returned_untouched():
    """Mieux vaut laisser SQLAlchemy produire son erreur habituelle que d'en
    fabriquer une autre à partir d'une chaîne qu'on n'a pas comprise."""
    assert _with_driver("pas-une-url", "asyncpg") == "pas-une-url"


def test_settings_apply_the_normalisation(monkeypatch):
    """Le validateur est bien câblé sur les deux champs, pas seulement défini."""
    from app.core.config import Settings

    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host/db")
    monkeypatch.setenv("DATABASE_URL_MIGRATIONS", "postgres://u:p@host/db")
    settings = Settings(_env_file=None)

    assert settings.database_url.startswith("postgresql+asyncpg://")
    assert settings.database_url_migrations.startswith("postgresql+psycopg://")
