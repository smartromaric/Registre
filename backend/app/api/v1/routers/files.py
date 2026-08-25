from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.storage.local import verify_local_file_signature

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{file_path:path}")
async def serve_signed_file(file_path: str, exp: int = Query(...), sig: str = Query(...)) -> FileResponse:
    """Sert un fichier stocké localement via un lien signé à courte durée de vie
    (cahier des charges §14.1). N'existe que pour le backend de stockage `local` —
    en production (`s3`), les liens signés pointent directement vers le stockage objet.
    """
    settings = get_settings()
    if settings.storage_backend != "local":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Non applicable à ce backend de stockage.")
    if not verify_local_file_signature(file_path, exp, sig):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Lien expiré ou invalide.")

    from pathlib import Path

    full_path = (Path(settings.storage_local_path) / file_path).resolve()
    root = Path(settings.storage_local_path).resolve()
    if root not in full_path.parents or not full_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fichier introuvable.")
    return FileResponse(full_path)
