from enum import StrEnum
from typing import Annotated
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, StringConstraints


class ProviderName(StrEnum):
    TRIPOSR = "triposr"
    INSTANTMESH = "instantmesh"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ImageTo3DOptions(BaseModel):
    provider: ProviderName = ProviderName.TRIPOSR
    output_format: str = Field(default="glb", pattern=r"^(glb|obj)$")
    remove_background: bool = True
    bake_texture: bool = True
    texture_resolution: int = Field(default=2048, ge=512, le=4096)
    mesh_resolution: int = Field(default=256, ge=64, le=512)


class ImageTo3DJobCreate(BaseModel):
    project_id: UUID
    source_uri: Annotated[str, StringConstraints(pattern=r"^artifact://[a-f0-9]{64}$")]
    source_sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    actor_id: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")]
    options: ImageTo3DOptions = Field(default_factory=ImageTo3DOptions)


class ImageTo3DArtifact(BaseModel):
    uri: str
    media_type: str
    sha256: str
    provider: ProviderName
    provider_version: str


class ImageTo3DJob(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    status: JobStatus = JobStatus.QUEUED
    request: ImageTo3DJobCreate
    artifact: ImageTo3DArtifact | None = None
    error: str | None = None
