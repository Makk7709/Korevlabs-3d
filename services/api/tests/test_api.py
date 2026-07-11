from fastapi.testclient import TestClient

from app.main import app
from app.store import store

client = TestClient(app)


def setup_function() -> None:
    store.reset()


def create_project() -> dict:
    response = client.post("/v1/projects", json={"name": "Demo"})
    assert response.status_code == 201
    return response.json()


def add_object_payload(base_revision: int = 1, key: str = "request-0001") -> dict:
    return {
        "base_revision": base_revision,
        "title": "Add a demonstrator",
        "rationale": "Create a traceable conceptual object",
        "actor_id": "cael",
        "idempotency_key": key,
        "operations": [
            {
                "op": "add_object",
                "object_id": "demo-object",
                "value": {
                    "id": "demo-object",
                    "kind": "mesh",
                    "label": "Demonstrator",
                    "inferred": True,
                    "source_refs": [],
                },
            }
        ],
    }


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_patch_requires_preview_then_applies_with_revision_lock() -> None:
    project = create_project()
    preview = client.post(
        f"/v1/projects/{project['id']}/patches/preview", json=add_object_payload()
    )
    assert preview.status_code == 201

    applied = client.post(
        f"/v1/projects/{project['id']}/patches/{preview.json()['id']}/apply",
        json={"expected_base_revision": 1, "approved_by": "amine"},
    )
    assert applied.status_code == 200
    assert applied.json()["current_scene"]["revision"] == 2
    assert applied.json()["current_scene"]["objects"][0]["id"] == "demo-object"
    assert store.audit[-1].revision_after == 2


def test_stale_patch_is_rejected() -> None:
    project = create_project()
    response = client.post(
        f"/v1/projects/{project['id']}/patches/preview",
        json=add_object_payload(base_revision=99),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "revision_conflict"


def test_unknown_operation_is_rejected_by_contract() -> None:
    project = create_project()
    payload = add_object_payload()
    payload["operations"][0]["op"] = "execute_python"
    response = client.post(f"/v1/projects/{project['id']}/patches/preview", json=payload)
    assert response.status_code == 422


def test_idempotency_key_cannot_hide_a_different_payload() -> None:
    project = create_project()
    url = f"/v1/projects/{project['id']}/patches/preview"
    first = client.post(url, json=add_object_payload())
    assert first.status_code == 201

    changed = add_object_payload()
    changed["title"] = "Different request"
    second = client.post(url, json=changed)
    assert second.status_code == 422
    assert second.json()["code"] == "invalid_patch"


def test_missing_target_object_is_rejected() -> None:
    project = create_project()
    payload = add_object_payload()
    payload["operations"] = [
        {"op": "set_property", "object_id": "missing", "property_name": "color", "value": "red"}
    ]
    response = client.post(f"/v1/projects/{project['id']}/patches/preview", json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_patch"


def test_non_finite_transform_is_rejected() -> None:
    project = create_project()
    preview = client.post(
        f"/v1/projects/{project['id']}/patches/preview", json=add_object_payload()
    )
    applied = client.post(
        f"/v1/projects/{project['id']}/patches/{preview.json()['id']}/apply",
        json={"expected_base_revision": 1, "approved_by": "amine"},
    )
    assert applied.status_code == 200

    payload = {
        "base_revision": 2,
        "title": "Invalid transform",
        "rationale": "Hostile numeric input",
        "actor_id": "cael",
        "idempotency_key": "request-transform-1",
        "operations": [
            {
                "op": "set_transform",
                "object_id": "demo-object",
                "value": {"position": ["NaN", 0, 0]},
            }
        ],
    }
    response = client.post(f"/v1/projects/{project['id']}/patches/preview", json=payload)
    assert response.status_code == 422
