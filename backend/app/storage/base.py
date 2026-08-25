from abc import ABC, abstractmethod


class StorageBackend(ABC):
    """Documents et photos ne sont jamais servis publiquement : toujours par lien
    signé à durée de vie courte (cahier des charges §14.1). Les deux implémentations
    (local pour le dev, S3 pour la production) respectent ce même contrat.
    """

    @abstractmethod
    async def save(self, key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    def signed_url(self, key: str, expires_in: int | None = None) -> str: ...
