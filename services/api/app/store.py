from __future__ import annotations

from copy import deepcopy
from threading import RLock
from uuid import UUID

from .models import (
    AuditEvent,
    PatchApplyRequest,
    PatchOperation,
    PatchPreviewRequest,
    PatchProposal,
    Project,
    ProjectCreate,
    SceneObject,
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


class InMemoryStore:
    """V0 repository proving domain invariants; replaced by PostgreSQL in chantier 1."""

    def __init__(self) -> None:
        self.projects: dict[UUID, Project] = {}
        self.patches: dict[UUID, PatchProposal] = {}
        self.idempotency: dict[tuple[UUID, str], UUID] = {}
        self.audit: list[AuditEvent] = []
        self._lock = RLock()

    def reset(self) -> None:
        with self._lock:
            self.projects.clear()
            self.patches.clear()
            self.idempotency.clear()
            self.audit.clear()

    def create_project(self, data: ProjectCreate) -> Project:
        project = Project(name=data.name, maturity=data.maturity)
        with self._lock:
            self.projects[project.id] = project
        return deepcopy(project)

    def get_project(self, project_id: UUID) -> Project:
        project = self.projects.get(project_id)
        if project is None:
            raise NotFound("project not found")
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
            else:
                if operation.object_id not in ids:
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
            objects[index].transform = operation.value  # type: ignore[assignment]
        elif operation.op == "set_property":
            objects[index].properties[operation.property_name or ""] = operation.value


store = InMemoryStore()
