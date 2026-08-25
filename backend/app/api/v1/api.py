from fastapi import APIRouter

from app.api.v1.routers import audit, auth, files, members, organizations

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(members.router)
api_router.include_router(audit.router)
api_router.include_router(files.router)
