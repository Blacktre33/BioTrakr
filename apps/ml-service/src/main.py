from fastapi import FastAPI

from .api.router import api_router
from .core.config import get_settings
from .core.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(title=settings.api_title, version=settings.api_version)
app.include_router(api_router)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"service": settings.api_title, "version": settings.api_version}
