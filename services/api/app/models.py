from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from math import isfinite
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Identifier = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")]


class MaturityLevel(StrEnum):
    CONCEPTUAL = "conceptual"
    PARAMETRIC = "parametric"
    CALIBRATED = "calibrated"


class SourceKind(StrEnum):
    PDF = "pdf"
    PYTHON = "python"
    OBJ = "obj"
    GLB = "glb"


class ProjectCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    maturity: MaturityLevel = MaturityLevel.CONCEPTUAL


class SourceReference(BaseModel):
    source_sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    locator: Annotated[str, StringConstraints(min_length=1, max_length=240)]
    method: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    confidence: float = Field(ge=0, le=1)


class Transform(BaseModel):
    position: tuple[float, float, float] = (0.0, 0.0, 0.0)
    rotation_rad: tuple[float, float, float] = (0.0, 0.0, 0.0)
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0)

    @field_validator("position", "rotation_rad", "scale")
    @classmethod
    def finite_values(cls, value: tuple[float, float, float]) -> tuple[float, float, float]:
        if any(not isfinite(item) or not (-1e12 < item < 1e12) for item in value):
            raise ValueError("transform values must be finite and bounded")
        return value


class SceneObject(BaseModel):
    id: Identifier
    kind: Literal[
        "group",
        "mesh",
        "sensor",
        "annotation",
        "field",
        "algorithm",
        "document",
        "section",
    ]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    transform: Transform = Field(default_factory=Transform)
    properties: dict[str, Any] = Field(default_factory=dict)
    source_refs: list[SourceReference] = Field(default_factory=list, max_length=50)
    inferred: bool = True


class PatchOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: Literal["add_object", "remove_object", "set_transform", "set_property"]
    object_id: Identifier
    value: SceneObject | Transform | str | int | float | bool | None = None
    property_name: Identifier | None = None


class PatchPreviewRequest(BaseModel):
    base_revision: int = Field(ge=1)
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    rationale: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]
    actor_id: Identifier
    idempotency_key: Annotated[str, StringConstraints(min_length=8, max_length=128)]
    operations: list[PatchOperation] = Field(min_length=1, max_length=100)


class PatchApplyRequest(BaseModel):
    expected_base_revision: int = Field(ge=1)
    approved_by: Identifier


class SceneRevision(BaseModel):
    revision: int = 1
    maturity: MaturityLevel = MaturityLevel.CONCEPTUAL
    objects: list[SceneObject] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Project(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    maturity: MaturityLevel
    current_scene: SceneRevision = Field(default_factory=SceneRevision)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SourceRecord(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    filename: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)]
    kind: SourceKind
    media_type: str
    sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    size_bytes: int = Field(ge=1)
    status: Literal["analyzed", "spatialized", "failed"] = "analyzed"
    analysis: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PatchProposal(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    request: PatchPreviewRequest
    status: Literal["previewed", "applied", "rejected"] = "previewed"
    resulting_revision: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AuditEvent(BaseModel):
    action: str
    actor_id: str
    project_id: UUID
    revision_before: int
    revision_after: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
