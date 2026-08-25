"""Zone tampon locale pour les téléversements repris par morceaux (§11.3).

Distincte de app/storage/{local,s3}.py à dessein : c'est un espace de travail
transitoire (les morceaux d'un envoi en cours), jamais le stockage final d'un
document — celui-ci reste géré par app/storage une fois la session assemblée.
Existe sur disque local même quand storage_backend=s3, pour la même raison que
n'importe quel service qui accumule un envoi HTTP par morceaux : il faut un
endroit où les poser en attendant le dernier.
"""

import shutil
import uuid
from pathlib import Path

from app.core.config import get_settings


def _session_dir(session_id: uuid.UUID) -> Path:
    settings = get_settings()
    root = Path(settings.storage_local_path) / "_upload_sessions" / str(session_id)
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_chunk(session_id: uuid.UUID, chunk_index: int, data: bytes) -> None:
    (_session_dir(session_id) / f"{chunk_index:06d}.part").write_bytes(data)


def read_assembled(session_id: uuid.UUID, chunk_indices: list[int]) -> bytes:
    """Concatène les morceaux dans l'ordre — l'appelant doit avoir vérifié au
    préalable que `chunk_indices` couvre bien 0..n-1 sans trou."""
    directory = _session_dir(session_id)
    buffer = bytearray()
    for index in sorted(chunk_indices):
        buffer.extend((directory / f"{index:06d}.part").read_bytes())
    return bytes(buffer)


def cleanup(session_id: uuid.UUID) -> None:
    shutil.rmtree(_session_dir(session_id), ignore_errors=True)
