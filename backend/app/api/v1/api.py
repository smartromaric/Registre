from fastapi import APIRouter

from app.api.v1.routers import (
    alerts,
    audit,
    auth,
    documents,
    files,
    members,
    model_definitions,
    organizations,
    records,
    templates,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(members.router)
api_router.include_router(audit.router)
api_router.include_router(model_definitions.router)
api_router.include_router(templates.router)
api_router.include_router(records.router)
api_router.include_router(documents.router)
api_router.include_router(alerts.router)
api_router.include_router(files.router)
