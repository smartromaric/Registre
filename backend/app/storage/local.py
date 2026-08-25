import base64
import hashlib
import hmac
import time
from pathlib import Path
from urllib.parse import quote

from app.core.config import get_settings
from app.storage.base import StorageBackend


def _sign(key: str, expires_at: int, secret: str) -> str:
    message = f"{key}:{expires_at}".encode()
    digest = hmac.new(secret.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def verify_local_file_signature(key: str, expires_at: int, signature: str) -> bool:
    settings = get_settings()
    if time.time() > expires_at:
        return False
    expected = _sign(key, expires_at, settings.file_signing_secret)
    return hmac.compare_digest(expected, signature)


class LocalFilesystemStorage(StorageBackend):
    """Utilisée en développement quand aucun stockage S3/MinIO n'est configuré.
    Les liens "signés" sont de vrais liens à durée de vie courte, validés par HMAC
    dans `app/api/v1/routers/files.py` — pas un simple chemin public déguisé.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.root = Path(settings.storage_local_path)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path_for(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents and path != self.root.resolve():
            raise ValueError("Chemin de fichier invalide")
        return path

    async def save(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def delete(self, key: str) -> None:
        path = self._path_for(key)
        path.unlink(missing_ok=True)

    def signed_url(self, key: str, expires_in: int | None = None) -> str:
        settings = get_settings()
        ttl = expires_in or settings.signed_url_expire_seconds
        expires_at = int(time.time()) + ttl
        signature = _sign(key, expires_at, settings.file_signing_secret)
        return f"/api/v1/files/{quote(key)}?exp={expires_at}&sig={signature}"
