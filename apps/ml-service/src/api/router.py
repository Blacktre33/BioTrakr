from fastapi import APIRouter

from .routes import health, inference, training

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(inference.router)
api_router.include_router(training.router)
