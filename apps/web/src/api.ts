import type { PatchProposal, Project, SourceRecord, Transform } from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(String(payload.detail ?? "API request failed"), response.status);
  }
  return response.json() as Promise<T>;
}

export function createClient(baseUrl: string) {
  const jsonHeaders = { "Content-Type": "application/json" };
  return {
    health: () => request<{ status: string }>(`${baseUrl}/health`),
    listProjects: () => request<Project[]>(`${baseUrl}/v1/projects`),
    createProject: (name: string) =>
      request<Project>(`${baseUrl}/v1/projects`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ name, maturity: "conceptual" }),
      }),
    getProject: (projectId: string) =>
      request<Project>(`${baseUrl}/v1/projects/${projectId}`),
    listSources: (projectId: string) =>
      request<SourceRecord[]>(`${baseUrl}/v1/projects/${projectId}/sources`),
    uploadSource: (projectId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<SourceRecord>(`${baseUrl}/v1/projects/${projectId}/sources`, {
        method: "POST",
        body: form,
      });
    },
    spatializeSource: (projectId: string, sourceId: string) => {
      const form = new FormData();
      form.append("actor_id", "human");
      return request<Project>(
        `${baseUrl}/v1/projects/${projectId}/sources/${sourceId}/spatialize`,
        { method: "POST", body: form },
      );
    },
    previewTransform: (
      project: Project,
      objectId: string,
      transform: Transform,
    ) => request<PatchProposal>(`${baseUrl}/v1/projects/${project.id}/patches/preview`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        base_revision: project.current_scene.revision,
        title: `Move ${objectId}`,
        rationale: "Human-reviewed spatial edit from KOREV Labs 3D",
        actor_id: "cael",
        idempotency_key: crypto.randomUUID(),
        operations: [{ op: "set_transform", object_id: objectId, value: transform }],
      }),
    }),
    applyPatch: (projectId: string, patch: PatchProposal) =>
      request<Project>(`${baseUrl}/v1/projects/${projectId}/patches/${patch.id}/apply`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          expected_base_revision: patch.request.base_revision,
          approved_by: "human",
        }),
      }),
    assetUrl: (projectId: string, sourceId: string) =>
      `${baseUrl}/v1/projects/${projectId}/sources/${sourceId}/content`,
  };
}

