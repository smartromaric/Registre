import boto3

from app.core.config import get_settings
from app.storage.base import StorageBackend


class S3Storage(StorageBackend):
    """Stockage objet compatible S3 (MinIO en dev, S3/compatible en production).
    Liens signés générés nativement par le SDK — courte durée de vie (§14.1).
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._bucket = settings.s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )

    async def save(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    async def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def signed_url(self, key: str, expires_in: int | None = None) -> str:
        settings = get_settings()
        ttl = expires_in or settings.signed_url_expire_seconds
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=ttl,
        )
