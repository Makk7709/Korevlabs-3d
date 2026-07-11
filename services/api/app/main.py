import hashlib
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Annotated
from uuid import UUID

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic_settings import BaseSettings, SettingsConfigDict

from .ingestion import SourceRejected, analyze_source, detect_kind
from .models import (
    PatchApplyRequest,
    PatchPreviewRequest,
    PatchProposal,
    Project,
    ProjectCreate,
    SourceRecord,
)
from .store import DomainError, NotFound, RevisionConflict, store

MAX_SOURCE_BYTES = 25 * 1024 * 1024


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


@app.exception_handler(SourceRejected)
async def source_rejected_handler(_request: Request, exc: SourceRejected) -> JSONResponse:
    return JSONResponse(status_code=422, content={"code": "source_rejected", "detail": str(exc)})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "korevlabs-3d-api"}


@app.post("/v1/projects", response_model=Project, status_code=201)
def create_project(payload: ProjectCreate) -> Project:
    return store.create_project(payload)


@app.get("/v1/projects", response_model=list[Project])
def list_projects() -> list[Project]:
    return store.list_projects()


@app.get("/v1/projects/{project_id}", response_model=Project)
def get_project(project_id: UUID) -> Project:
    return store.get_project(project_id)


@app.get("/v1/projects/{project_id}/sources", response_model=list[SourceRecord])
def list_sources(project_id: UUID) -> list[SourceRecord]:
    return store.list_sources(project_id)


@app.post("/v1/projects/{project_id}/sources", response_model=SourceRecord, status_code=201)
async def upload_source(
    project_id: UUID,
    file: Annotated[UploadFile, File()],
) -> SourceRecord:
    store.get_project(project_id)
    filename = Path(file.filename or "").name
    if not filename:
        raise SourceRejected("source filename is required")

    digest = hashlib.sha256()
    size = 0
    head = b""
    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(dir=store.data_dir, prefix="upload-", delete=False) as temporary:
            temporary_path = Path(temporary.name)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_SOURCE_BYTES:
                    raise SourceRejected("source exceeds the 25 MiB limit")
                if len(head) < 4096:
                    head += chunk[: 4096 - len(head)]
                digest.update(chunk)
                temporary.write(chunk)
        if size == 0:
            raise SourceRejected("source is empty")
        kind = detect_kind(filename, head)
        analysis = analyze_source(temporary_path, kind)
        record = SourceRecord(
            project_id=project_id,
            filename=filename,
            kind=kind,
            media_type=file.content_type or "application/octet-stream",
            sha256=digest.hexdigest(),
            size_bytes=size,
            analysis=analysis,
        )
        return store.add_source(record, temporary_path)
    except Exception:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
        raise
    finally:
        await file.close()


@app.post("/v1/projects/{project_id}/sources/{source_id}/spatialize", response_model=Project)
def spatialize_source(
    project_id: UUID,
    source_id: UUID,
    actor_id: Annotated[str, Form()] = "human",
) -> Project:
    return store.spatialize(project_id, source_id, actor_id)


@app.get("/v1/projects/{project_id}/sources/{source_id}/content")
def source_content(project_id: UUID, source_id: UUID) -> FileResponse:
    source = store.get_source(project_id, source_id)
    if source.kind.value not in {"obj", "glb"}:
        raise SourceRejected("raw content is exposed only for renderable mesh sources")
    return FileResponse(
        path=store.source_path(source),
        media_type="model/gltf-binary" if source.kind.value == "glb" else "text/plain",
        filename=source.filename,
        content_disposition_type="inline",
    )


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
