from __future__ import annotations

import asyncio
import hashlib
import shutil
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, HTTPException
from pydantic_settings import BaseSettings, SettingsConfigDict

from .models import ImageTo3DArtifact, ImageTo3DJob, ImageTo3DJobCreate, JobStatus
from .providers import ProviderError, build_providers


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KOREV_IMAGE3D_")

    artifact_root: Path = Path("/data/artifacts")
    work_root: Path = Path("/data/work")
    triposr_path: Path = Path("/opt/providers/TripoSR")
    instantmesh_path: Path = Path("/opt/providers/InstantMesh")
    max_concurrent_jobs: int = 1


settings = Settings()
settings.artifact_root.mkdir(parents=True, exist_ok=True)
settings.work_root.mkdir(parents=True, exist_ok=True)
providers = build_providers(settings.triposr_path, settings.instantmesh_path)
jobs: dict[UUID, ImageTo3DJob] = {}
semaphore = asyncio.Semaphore(settings.max_concurrent_jobs)
app = FastAPI(title="KOREV Image-to-3D Worker", version="0.1.0")


def _resolve_source(uri: str, expected_sha256: str) -> Path:
    digest = uri.removeprefix("artifact://")
    if digest != expected_sha256:
        raise HTTPException(status_code=422, detail="source URI and SHA-256 disagree")
    path = settings.artifact_root / digest
    if not path.is_file():
        raise HTTPException(status_code=404, detail="source artifact not found")
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected_sha256:
        raise HTTPException(status_code=409, detail="source artifact integrity check failed")
    return path


async def _execute(job_id: UUID, source: Path) -> None:
    job = jobs[job_id]
    job.status = JobStatus.RUNNING
    output_dir = settings.work_root / str(job_id)
    try:
        async with semaphore:
            provider = providers[job.request.options.provider]
            result = await provider.generate(source, output_dir, job.request.options)
        payload = result.path.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        destination = settings.artifact_root / digest
        if not destination.exists():
            shutil.copyfile(result.path, destination)
        job.artifact = ImageTo3DArtifact(
            uri=f"artifact://{digest}",
            media_type=result.media_type,
            sha256=digest,
            provider=result.provider,
            provider_version=result.provider_version,
        )
        job.status = JobStatus.SUCCEEDED
    except (ProviderError, OSError) as exc:
        job.status = JobStatus.FAILED
        job.error = str(exc)[:4000]
    finally:
        shutil.rmtree(output_dir, ignore_errors=True)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "korevlabs-image-to-3d"}


@app.post("/v1/image-to-3d/jobs", response_model=ImageTo3DJob, status_code=202)
async def create_job(payload: ImageTo3DJobCreate) -> ImageTo3DJob:
    source = _resolve_source(payload.source_uri, payload.source_sha256)
    job = ImageTo3DJob(request=payload)
    jobs[job.id] = job
    asyncio.create_task(_execute(job.id, source))
    return job


@app.get("/v1/image-to-3d/jobs/{job_id}", response_model=ImageTo3DJob)
def get_job(job_id: UUID) -> ImageTo3DJob:
    try:
        return jobs[job_id]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
