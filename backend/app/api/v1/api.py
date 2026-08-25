from fastapi import APIRouter

from app.api.v1.routers import (
    alerts,
    audit,
    auth,
    catalog,
    documents,
    editor,
    files,
    members,
    model_definitions,
    organizations,
    records,
    saved_views,
    search,
    stock,
    subscriptions,
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
api_router.include_router(stock.router)
api_router.include_router(saved_views.router)
api_router.include_router(search.router)
api_router.include_router(catalog.router)
api_router.include_router(subscriptions.router)
api_router.include_router(editor.router)
api_router.include_router(files.router)
