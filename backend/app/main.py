from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Registre API",
    description="Plateforme de gestion multi-organisations — fiches, stock, échéances, abonnements.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Sans cette ligne, le navigateur cache `Content-Disposition` au script même
    # quand le serveur l'envoie : l'export CSV serait téléchargé sous un nom
    # générique au lieu de celui du modèle. `allow_headers` ne couvre que les
    # en-têtes de la REQUÊTE ; les en-têtes de réponse lisibles se déclarent ici.
    expose_headers=["Content-Disposition"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok"}
