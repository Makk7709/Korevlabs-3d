# KOREV Labs 3D

KOREV Labs 3D is a spatial engineering workbench that turns heterogeneous research material into an interactive, traceable 3D model. It is designed to run independently and to expose a narrow, policy-controlled interface to CAEL.

The product is not an automatic "PDF to digital twin" converter. It explicitly distinguishes:

- **conceptual** scenes: explanatory representations inferred from sources;
- **parametric** scenes: dimensioned and editable models;
- **calibrated** scenes: simulations tied to measurements or known ground truth.

Every visible object must retain its provenance, confidence level and assumptions.

## Repository status

The current product vertical delivers:

- the global and detailed architecture;
- the CAEL trust boundary and typed patch contract;
- an interactive React/Three.js spatial workbench driven by API data;
- durable local projects and automatic restoration after restart;
- bounded PDF, Python, OBJ and binary GLB imports;
- deterministic analysis and spatialization with source provenance;
- rendering of uploaded OBJ/GLB assets;
- an interactive damped-membrane physics laboratory running at a fixed 120 Hz;
- click-driven impulses, wave-speed/damping controls and live energy telemetry;
- instanced source nodes and sensors to reduce 3D draw calls;
- object selection, inspection and timeline interaction;
- preview and human approval of transform patches;
- a FastAPI domain API with optimistic revision control;
- hostile tests for unsupported operations and stale revisions;
- CI and local container orchestration;
- an auditable delivery roadmap.

No confidential KOREV research document, patent material, extracted scene or proprietary algorithm is stored in this public repository. Runtime data lives under `.data/` locally or in the private Docker volume.

## Quick start

### API

```bash
cd services/api
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload --port 8000
```

### Web application

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:5173`. The API documentation is available at `http://localhost:8000/docs`.

Or start both services with persistent local data:

```bash
docker compose up --build
```

## Product workflow

1. Create a project from the top bar.
2. Import a PDF, `.py`, `.obj` or self-contained `.glb` source.
3. The API validates, hashes, analyzes and spatializes it into a new scene revision.
4. Select objects from the viewport or scene graph to inspect provenance.
5. Edit coordinates, preview the revision-bound patch, then approve it.
6. Restart the application: projects, sources and scene revisions are restored.

Uploads are limited to 25 MiB. This version is deliberately blocked outside `development` and `test`: authentication and rootless worker isolation remain prerequisites for production.

For the complete design, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PHYSICS.md](docs/PHYSICS.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) and [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
