# KOREV Image-to-3D worker

This service isolates GPU-heavy single-image reconstruction from the KOREV domain API. It exposes a stable job contract while TripoSR and InstantMesh remain replaceable providers.

## Providers

- `triposr`: fast path, GLB or OBJ, optional texture baking. Upstream code and pretrained model are MIT licensed.
- `instantmesh`: quality path, OBJ output, optional texture map. Upstream code is Apache-2.0; model and transitive model-card terms must still be reviewed before production deployment.

The upstream repositories are deliberately not copied into the KOREV source tree. Pin audited revisions under `vendor/`:

```bash
git clone https://github.com/VAST-AI-Research/TripoSR.git vendor/TripoSR
git -C vendor/TripoSR checkout 107cefdc244c39106fa830359024f6a2f1c78871

git clone https://github.com/TencentARC/InstantMesh.git vendor/InstantMesh
git -C vendor/InstantMesh checkout 08822c52fdc399b93ea00e4fa9e596344ed52ccc
```

Install each provider's CUDA/PyTorch dependencies in a dedicated GPU image or runtime. The lightweight worker image contains only the orchestration API; it must not silently download models in production. Mount model caches and provider code read-only.

## Artifact contract

The worker accepts only internal content-addressed URIs such as:

```text
artifact://d2f6...<64 lowercase hex characters>
```

The corresponding file must already exist in `/data/artifacts/<sha256>`. Arbitrary network URLs and host paths are rejected.

## Run

```bash
docker compose --profile gpu up --build image-to-3d
```

Create a job:

```bash
curl -X POST http://localhost:8010/v1/image-to-3d/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "00000000-0000-0000-0000-000000000001",
    "source_uri": "artifact://<sha256>",
    "source_sha256": "<sha256>",
    "actor_id": "amine",
    "options": {"provider": "triposr", "output_format": "glb"}
  }'
```

Poll `GET /v1/image-to-3d/jobs/{job_id}` until the status is `succeeded` or `failed`.

## Production gaps

The current worker is an integration foundation, not a production scheduler. Before production use, replace the in-memory job registry with PostgreSQL/Redis, add authenticated service-to-service calls, enforce GPU quotas, pin model weights by hash, scan generated artifacts, and normalize meshes before they enter a scene revision.
