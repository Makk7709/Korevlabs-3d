from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path
from threading import RLock
from uuid import UUID

from .ingestion import spatialize_source
from .models import (
    AuditEvent,
    PatchApplyRequest,
    PatchOperation,
    PatchPreviewRequest,
    PatchProposal,
    Project,
    ProjectCreate,
    SceneObject,
    SourceRecord,
    Transform,
)


class DomainError(Exception):
    pass


class NotFound(DomainError):
    pass


class RevisionConflict(DomainError):
    pass


class InvalidPatch(DomainError):
    pass


class ProjectStore:
    """Small durable repository preserving V0 invariants before PostgreSQL migration."""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        self.data_dir = Path(data_dir or os.getenv("KOREV_DATA_DIR", ".data"))
        self.sources_dir = self.data_dir / "sources"
        self.state_path = self.data_dir / "state.json"
        self.projects: dict[UUID, Project] = {}
        self.sources: dict[UUID, SourceRecord] = {}
        self.patches: dict[UUID, PatchProposal] = {}
        self.idempotency: dict[tuple[UUID, str], UUID] = {}
        self.audit: list[AuditEvent] = []
        self._lock = RLock()
        self.sources_dir.mkdir(parents=True, exist_ok=True)
        self._load()

    def _load(self) -> None:
        if not self.state_path.exists():
            return
        try:
            payload = json.loads(self.state_path.read_text(encoding="utf-8"))
            self.projects = {
                item.id: item
                for raw in payload.get("projects", [])
                if (item := Project.model_validate(raw))
            }
            self.sources = {
                item.id: item
                for raw in payload.get("sources", [])
                if (item := SourceRecord.model_validate(raw))
            }
            self.patches = {
                item.id: item
                for raw in payload.get("patches", [])
                if (item := PatchProposal.model_validate(raw))
            }
            self.audit = [AuditEvent.model_validate(raw) for raw in payload.get("audit", [])]
            self.idempotency = {
                (patch.project_id, patch.request.idempotency_key): patch.id
                for patch in self.patches.values()
            }
        except (OSError, ValueError, TypeError) as exc:
            raise RuntimeError(
                "KOREV data state is unreadable; refusing destructive recovery"
            ) from exc

    def _persist(self) -> None:
        payload = {
            "projects": [item.model_dump(mode="json") for item in self.projects.values()],
            "sources": [item.model_dump(mode="json") for item in self.sources.values()],
            "patches": [item.model_dump(mode="json") for item in self.patches.values()],
            "audit": [item.model_dump(mode="json") for item in self.audit],
        }
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, self.state_path)

    def reset(self) -> None:
        """Test helper; not exposed by the HTTP API."""
        with self._lock:
            self.projects.clear()
            self.sources.clear()
            self.patches.clear()
            self.idempotency.clear()
            self.audit.clear()
            for path in self.sources_dir.iterdir():
                if path.is_file():
                    path.unlink()
            self._persist()

    def list_projects(self) -> list[Project]:
        return [deepcopy(project) for project in self.projects.values()]

    def create_project(self, data: ProjectCreate) -> Project:
        project = Project(name=data.name, maturity=data.maturity)
        with self._lock:
            self.projects[project.id] = project
            self._persist()
        return deepcopy(project)

    def get_project(self, project_id: UUID) -> Project:
        project = self.projects.get(project_id)
        if project is None:
            raise NotFound("project not found")
        return deepcopy(project)

    def add_source(self, record: SourceRecord, staged_path: Path) -> SourceRecord:
        with self._lock:
            if record.project_id not in self.projects:
                raise NotFound("project not found")
            destination = self.source_path(record)
            destination.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staged_path, destination)
            self.sources[record.id] = record
            self._persist()
        return deepcopy(record)

    def list_sources(self, project_id: UUID) -> list[SourceRecord]:
        if project_id not in self.projects:
            raise NotFound("project not found")
        return [
            deepcopy(source) for source in self.sources.values() if source.project_id == project_id
        ]

    def get_source(self, project_id: UUID, source_id: UUID) -> SourceRecord:
        source = self.sources.get(source_id)
        if source is None or source.project_id != project_id:
            raise NotFound("source not found")
        return deepcopy(source)

    def source_path(self, source: SourceRecord) -> Path:
        return self.sources_dir / f"{source.id}.{source.kind.value}"

    def spatialize(self, project_id: UUID, source_id: UUID, actor_id: str) -> Project:
        with self._lock:
            project = self.projects.get(project_id)
            source = self.sources.get(source_id)
            if project is None or source is None or source.project_id != project_id:
                raise NotFound("project or source not found")
            source_key = str(source.id)
            retained = [
                item
                for item in project.current_scene.objects
                if item.properties.get("source_id") != source_key
                and not str(item.properties.get("parent_id", "")).startswith(
                    f"source:{source.id.hex[:12]}"
                )
            ]
            before = project.current_scene.revision
            project.current_scene.objects = retained + spatialize_source(source)
            project.current_scene.revision += 1
            source.status = "spatialized"
            self.audit.append(
                AuditEvent(
                    action="source.spatialized",
                    actor_id=actor_id,
                    project_id=project_id,
                    revision_before=before,
                    revision_after=project.current_scene.revision,
                )
            )
            self._persist()
            return deepcopy(project)

    def preview_patch(self, project_id: UUID, request: PatchPreviewRequest) -> PatchProposal:
        with self._lock:
            project = self.projects.get(project_id)
            if project is None:
                raise NotFound("project not found")
            if request.base_revision != project.current_scene.revision:
                raise RevisionConflict("patch base revision is stale")

            key = (project_id, request.idempotency_key)
            existing_id = self.idempotency.get(key)
            if existing_id is not None:
                existing = self.patches[existing_id]
                if existing.request != request:
                    raise InvalidPatch("idempotency key reused with a different payload")
                return deepcopy(existing)

            self._validate_operations(project, request.operations)
            proposal = PatchProposal(project_id=project_id, request=request)
            self.patches[proposal.id] = proposal
            self.idempotency[key] = proposal.id
            self._persist()
            return deepcopy(proposal)

    def apply_patch(self, project_id: UUID, patch_id: UUID, request: PatchApplyRequest) -> Project:
        with self._lock:
            project = self.projects.get(project_id)
            proposal = self.patches.get(patch_id)
            if project is None or proposal is None or proposal.project_id != project_id:
                raise NotFound("project or patch not found")
            if proposal.status != "previewed":
                raise InvalidPatch("patch is not pending")
            if request.expected_base_revision != proposal.request.base_revision:
                raise RevisionConflict("approval does not target the proposed base revision")
            if project.current_scene.revision != proposal.request.base_revision:
                raise RevisionConflict("scene changed after patch preview")

            before = project.current_scene.revision
            self._validate_operations(project, proposal.request.operations)
            for operation in proposal.request.operations:
                self._apply_operation(project, operation)
            project.current_scene.revision += 1
            proposal.status = "applied"
            proposal.resulting_revision = project.current_scene.revision
            self.audit.append(
                AuditEvent(
                    action="patch.applied",
                    actor_id=request.approved_by,
                    project_id=project_id,
                    revision_before=before,
                    revision_after=project.current_scene.revision,
                )
            )
            self._persist()
            return deepcopy(project)

    @staticmethod
    def _validate_operations(project: Project, operations: list[PatchOperation]) -> None:
        ids = {obj.id for obj in project.current_scene.objects}
        for operation in operations:
            if operation.op == "add_object":
                if not isinstance(operation.value, SceneObject):
                    raise InvalidPatch("add_object requires a SceneObject value")
                if operation.object_id != operation.value.id or operation.object_id in ids:
                    raise InvalidPatch("new object id is inconsistent or already exists")
                ids.add(operation.object_id)
            elif operation.object_id not in ids:
                raise InvalidPatch("target object does not exist")
            if operation.op == "set_property" and not operation.property_name:
                raise InvalidPatch("set_property requires property_name")
            if operation.op == "set_transform" and not isinstance(operation.value, Transform):
                raise InvalidPatch("set_transform requires a Transform value")

    @staticmethod
    def _apply_operation(project: Project, operation: PatchOperation) -> None:
        objects = project.current_scene.objects
        if operation.op == "add_object":
            assert isinstance(operation.value, SceneObject)
            objects.append(operation.value)
            return
        index = next(i for i, obj in enumerate(objects) if obj.id == operation.object_id)
        if operation.op == "remove_object":
            objects.pop(index)
        elif operation.op == "set_transform":
            assert isinstance(operation.value, Transform)
            objects[index].transform = operation.value
        elif operation.op == "set_property":
            objects[index].properties[operation.property_name or ""] = operation.value


store = ProjectStore()
