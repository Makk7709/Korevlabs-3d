export type Maturity = "conceptual" | "parametric" | "calibrated";

export type SourceReference = {
  source_sha256: string;
  locator: string;
  method: string;
  confidence: number;
};

export type Transform = {
  position: [number, number, number];
  rotation_rad: [number, number, number];
  scale: [number, number, number];
};

export type SceneObject = {
  id: string;
  kind: "group" | "mesh" | "sensor" | "annotation" | "field" | "algorithm" | "document" | "section";
  label: string;
  transform: Transform;
  properties: Record<string, unknown>;
  source_refs: SourceReference[];
  inferred: boolean;
};

export type Project = {
  id: string;
  name: string;
  maturity: Maturity;
  current_scene: {
    revision: number;
    maturity: Maturity;
    objects: SceneObject[];
    created_at: string;
  };
  created_at: string;
};

export type SourceRecord = {
  id: string;
  project_id: string;
  filename: string;
  kind: "pdf" | "python" | "obj" | "glb";
  media_type: string;
  sha256: string;
  size_bytes: number;
  status: "analyzed" | "spatialized" | "failed";
  analysis: Record<string, unknown>;
  created_at: string;
};

export type PatchProposal = {
  id: string;
  project_id: string;
  status: "previewed" | "applied" | "rejected";
  request: {
    base_revision: number;
    title: string;
    rationale: string;
    operations: Array<Record<string, unknown>>;
  };
};

