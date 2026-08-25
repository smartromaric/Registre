from functools import lru_cache

from app.core.config import get_settings
from app.storage.base import StorageBackend
from app.storage.local import LocalFilesystemStorage
from app.storage.s3 import S3Storage

__all__ = ["StorageBackend", "get_storage_backend"]


@lru_cache
def get_storage_backend() -> StorageBackend:
    settings = get_settings()
    if settings.storage_backend == "s3":
        return S3Storage()
    return LocalFilesystemStorage()
