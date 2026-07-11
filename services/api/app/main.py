from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic_settings import BaseSettings, SettingsConfigDict

from .models import PatchApplyRequest, PatchPreviewRequest, PatchProposal, Project, ProjectCreate
from .store import DomainError, NotFound, RevisionConflict, store


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KOREV_")

    env: str = "development"
    allowed_origins: str = "http://localhost:5173"


settings = Settings()
if settings.env not in {"development", "test"}:
    raise RuntimeError(
        "The V0 API has no production authentication yet; production startup is refused."
    )

app = FastAPI(title="KOREV Labs 3D API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.allowed_origins.split(",")],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "Idempotency-Key"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
    status = 404 if isinstance(exc, NotFound) else 409 if isinstance(exc, RevisionConflict) else 422
    code = (
        "not_found" if status == 404 else "revision_conflict" if status == 409 else "invalid_patch"
    )
    return JSONResponse(status_code=status, content={"code": code, "detail": str(exc)})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "korevlabs-3d-api"}


@app.post("/v1/projects", response_model=Project, status_code=201)
def create_project(payload: ProjectCreate) -> Project:
    return store.create_project(payload)


@app.get("/v1/projects/{project_id}", response_model=Project)
def get_project(project_id: UUID) -> Project:
    return store.get_project(project_id)


@app.post(
    "/v1/projects/{project_id}/patches/preview",
    response_model=PatchProposal,
    status_code=201,
)
def preview_patch(project_id: UUID, payload: PatchPreviewRequest) -> PatchProposal:
    return store.preview_patch(project_id, payload)


@app.post("/v1/projects/{project_id}/patches/{patch_id}/apply", response_model=Project)
def apply_patch(project_id: UUID, patch_id: UUID, payload: PatchApplyRequest) -> Project:
    return store.apply_patch(project_id, patch_id, payload)
