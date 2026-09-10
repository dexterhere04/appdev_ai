from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
import db
import lifecycle
import metrics

from routers.health import router as health_router
from routers.auth import router as auth_router
from routers.projects import router as projects_router
from routers.files import router as files_router
from routers.build import router as build_router
from routers.preview import router as preview_router
from routers.dev import router as dev_router
from routers.ai import router as ai_router
from routers.metrics import router as metrics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    lifecycle.start_gc_loop()
    yield
    await lifecycle.stop_gc_loop()


metrics.setup_logging()

app = FastAPI(lifespan=lifespan)
app.add_middleware(metrics.AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=config.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(files_router)
app.include_router(build_router)
app.include_router(preview_router)
app.include_router(dev_router)
app.include_router(ai_router)
app.include_router(metrics_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=5000)  # nosec B104 - container binding
