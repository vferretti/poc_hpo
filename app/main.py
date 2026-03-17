"""HPO Tree Browser – FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import BABELON_PATH, BASE_DIR, HP_OBO_PATH
from app.loaders.babelon import load_french
from app.loaders.obo import load_obo
from app.models import HPOData
from app.routes import hpo as hpo_routes

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    obo = Path(HP_OBO_PATH)
    if not obo.exists():
        logger.critical("HPO OBO file not found at %s – cannot start", obo)
        raise SystemExit(1)

    data = HPOData()
    load_obo(data, str(obo))
    load_french(data, BABELON_PATH)
    hpo_routes.set_data(data)

    logger.info("Startup complete – %d PA terms ready", data.total_count)
    yield


app = FastAPI(
    title="HPO Tree Browser",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
)

app.include_router(hpo_routes.router)

# ---------------------------------------------------------------------------
# Static files / SPA
# ---------------------------------------------------------------------------

_static_dir = BASE_DIR / "static"
_react_dist = _static_dir / "dist"

if _react_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(_react_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        return FileResponse(str(_react_dist / "index.html"))
else:
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

    @app.get("/")
    async def landing():
        return FileResponse(str(_static_dir / "landing.html"))

    @app.get("/browser")
    async def browser():
        return FileResponse(str(_static_dir / "index.html"))
