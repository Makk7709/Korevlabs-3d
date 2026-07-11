from pathlib import Path

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app
from app.store import ProjectStore, store

client = TestClient(app)


def setup_function() -> None:
    store.reset()


def project_id() -> str:
    response = client.post("/v1/projects", json={"name": "Spatial project"})
    assert response.status_code == 201
    return response.json()["id"]


def test_projects_are_listed_and_unknown_project_is_404() -> None:
    identifier = project_id()
    listed = client.get("/v1/projects")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == identifier
    assert client.get("/v1/projects/00000000-0000-0000-0000-000000000099").status_code == 404


def test_upload_python_then_spatialize_and_restore() -> None:
    identifier = project_id()
    uploaded = client.post(
        f"/v1/projects/{identifier}/sources",
        files={
            "file": (
                "model.py",
                b"class Model:\n    pass\ndef infer():\n    return 1\n",
                "text/x-python",
            )
        },
    )
    assert uploaded.status_code == 201
    source = uploaded.json()
    assert source["analysis"]["classes"][0]["name"] == "Model"

    spatialized = client.post(
        f"/v1/projects/{identifier}/sources/{source['id']}/spatialize",
        data={"actor_id": "amine"},
    )
    assert spatialized.status_code == 200
    assert spatialized.json()["current_scene"]["revision"] == 2
    assert len(spatialized.json()["current_scene"]["objects"]) == 3

    listed = client.get(f"/v1/projects/{identifier}/sources")
    assert listed.json()[0]["status"] == "spatialized"
    blocked = client.get(f"/v1/projects/{identifier}/sources/{source['id']}/content")
    assert blocked.status_code == 422


def test_obj_content_is_renderable_and_respatialization_is_idempotent() -> None:
    identifier = project_id()
    body = b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
    uploaded = client.post(
        f"/v1/projects/{identifier}/sources",
        files={"file": ("triangle.obj", body, "text/plain")},
    )
    source = uploaded.json()
    first = client.post(
        f"/v1/projects/{identifier}/sources/{source['id']}/spatialize",
        data={"actor_id": "human"},
    )
    second = client.post(
        f"/v1/projects/{identifier}/sources/{source['id']}/spatialize",
        data={"actor_id": "human"},
    )
    assert len(first.json()["current_scene"]["objects"]) == 1
    assert len(second.json()["current_scene"]["objects"]) == 1

    content = client.get(f"/v1/projects/{identifier}/sources/{source['id']}/content")
    assert content.status_code == 200
    assert content.content == body


def test_upload_rejects_mismatch_unknown_format_empty_and_oversize(monkeypatch) -> None:
    identifier = project_id()
    mismatch = client.post(
        f"/v1/projects/{identifier}/sources",
        files={"file": ("fake.pdf", b"not pdf", "application/pdf")},
    )
    assert mismatch.status_code == 422

    unknown = client.post(
        f"/v1/projects/{identifier}/sources",
        files={"file": ("archive.zip", b"PK123", "application/zip")},
    )
    assert unknown.status_code == 422

    empty = client.post(
        f"/v1/projects/{identifier}/sources",
        files={"file": ("empty.py", b"", "text/x-python")},
    )
    assert empty.status_code == 422

    monkeypatch.setattr(main_module, "MAX_SOURCE_BYTES", 4)
    oversized = client.post(
        f"/v1/projects/{identifier}/sources",
        files={"file": ("large.py", b"12345", "text/x-python")},
    )
    assert oversized.status_code == 422


def test_store_state_survives_a_new_instance(tmp_path: Path) -> None:
    first = ProjectStore(tmp_path)
    created = first.create_project(main_module.ProjectCreate(name="Durable"))
    second = ProjectStore(tmp_path)
    assert second.get_project(created.id).name == "Durable"
