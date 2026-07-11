# KOREV Labs 3D

KOREV Labs 3D is a spatial engineering workbench that turns heterogeneous research material into an interactive, traceable 3D model. It is designed to run independently and to expose a narrow, policy-controlled interface to CAEL.

The product is not an automatic "PDF to digital twin" converter. It explicitly distinguishes:

- **conceptual** scenes: explanatory representations inferred from sources;
- **parametric** scenes: dimensioned and editable models;
- **calibrated** scenes: simulations tied to measurements or known ground truth.

Every visible object must retain its provenance, confidence level and assumptions.

## Repository status

This first chantier delivers:

- the global and detailed architecture;
- the CAEL trust boundary and typed patch contract;
- an initial React/Three.js spatial workbench;
- a FastAPI domain API with optimistic revision control;
- hostile tests for unsupported operations and stale revisions;
- CI and local container orchestration;
- an auditable delivery roadmap.

No confidential KOREV research document, patent material or proprietary algorithm is stored in this public repository.

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

For the complete design, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

