import {
  Activity,
  Box,
  Braces,
  CircleDot,
  FileBox,
  GitCompare,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  ChangeEvent,
  lazy,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiError, createClient } from "./api";
import type { PhysicsParameters } from "./PhysicsLab";
import type { PatchProposal, Project, SceneObject, SourceRecord, Transform } from "./types";

const SpatialScene = lazy(() => import("./SpatialScene"));

type ApiState = "checking" | "online" | "offline";

function PanelTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="panel-title">{icon}<span>{children}</span></div>;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

export default function App() {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
  const api = useMemo(() => createClient(apiUrl), [apiUrl]);
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [selected, setSelected] = useState<SceneObject | null>(null);
  const [pendingPatch, setPendingPatch] = useState<PatchProposal | null>(null);
  const [draftTransform, setDraftTransform] = useState<Transform | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Connect the API, create a project, then import a source.");
  const [error, setError] = useState("");
  const [time, setTime] = useState(0.38);
  const [physicsMode, setPhysicsMode] = useState(true);
  const [physics, setPhysics] = useState<PhysicsParameters>({
    waveSpeed: 2.4,
    damping: 1.1,
    impulse: 0.75,
    paused: false,
    resetVersion: 0,
  });
  const [telemetry, setTelemetry] = useState({ energy: 0, steps: 0, fps: 0 });

  const showError = useCallback((cause: unknown) => {
    setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Unexpected error");
  }, []);

  const refreshProject = useCallback(async (projectId: string) => {
    const [nextProject, nextSources] = await Promise.all([
      api.getProject(projectId),
      api.listSources(projectId),
    ]);
    setProject(nextProject);
    setSources(nextSources);
    setProjects((current) => current.map((item) => item.id === nextProject.id ? nextProject : item));
    if (selected) {
      setSelected(nextProject.current_scene.objects.find((item) => item.id === selected.id) ?? null);
    }
  }, [api, selected]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await api.health();
        const items = await api.listProjects();
        if (!active) return;
        setApiState("online");
        setProjects(items);
        if (items[0]) {
          const [restoredProject, restoredSources] = await Promise.all([
            api.getProject(items[0].id),
            api.listSources(items[0].id),
          ]);
          if (!active) return;
          setProject(restoredProject);
          setSources(restoredSources);
          setMessage("Project restored from durable local storage.");
        }
      } catch (cause) {
        if (!active) return;
        setApiState("offline");
        showError(cause);
      }
    }
    void load();
    return () => { active = false; };
  }, [api, showError]);

  useEffect(() => {
    setDraftTransform(selected ? structuredClone(selected.transform) : null);
    setPendingPatch(null);
  }, [selected]);

  async function createProject() {
    const name = window.prompt("Nom du projet KOREV Labs 3D", "Projet de recherche");
    if (!name?.trim()) return;
    setBusy(true); setError("");
    try {
      const created = await api.createProject(name.trim());
      setProjects((current) => [...current, created]);
      setProject(created); setSources([]); setSelected(null);
      setMessage(`Project “${created.name}” created and persisted.`);
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }

  async function selectProject(projectId: string) {
    setBusy(true); setError("");
    try {
      await refreshProject(projectId);
      setSelected(null); setPendingPatch(null);
      setMessage("Project loaded.");
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!project || files.length === 0) return;
    setBusy(true); setError("");
    try {
      for (const file of files) {
        const source = await api.uploadSource(project.id, file);
        setMessage(`${source.filename} analyzed. Spatialization in progress…`);
        await api.spatializeSource(project.id, source.id);
      }
      await refreshProject(project.id);
      setMessage(`${files.length} source${files.length > 1 ? "s" : ""} imported, analyzed and spatialized.`);
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }

  async function spatializeAll() {
    if (!project || sources.length === 0) return;
    setBusy(true); setError("");
    try {
      for (const source of sources) await api.spatializeSource(project.id, source.id);
      await refreshProject(project.id);
      setMessage("All sources were rebuilt into a new scene revision.");
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }

  async function previewTransform() {
    if (!project || !selected || !draftTransform) return;
    setBusy(true); setError("");
    try {
      const patch = await api.previewTransform(project, selected.id, draftTransform);
      setPendingPatch(patch);
      setMessage("Revision-bound patch ready for human approval.");
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }

  async function applyPatch() {
    if (!project || !pendingPatch) return;
    setBusy(true); setError("");
    try {
      const updated = await api.applyPatch(project.id, pendingPatch);
      setProject(updated);
      setProjects((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected(updated.current_scene.objects.find((item) => item.id === selected?.id) ?? null);
      setPendingPatch(null);
      setMessage(`Patch applied. Scene revision is now ${updated.current_scene.revision}.`);
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }

  function updatePosition(axis: number, value: string) {
    if (!draftTransform) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const position = [...draftTransform.position] as [number, number, number];
    position[axis] = numeric;
    setDraftTransform({ ...draftTransform, position });
    setPendingPatch(null);
  }

  const objects = project?.current_scene.objects ?? [];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">K</span><div><strong>KOREV LABS 3D</strong><small>Spatial knowledge engineering</small></div></div>
        <div className="status-row">
          <select value={project?.id ?? ""} onChange={(event) => void selectProject(event.target.value)} disabled={busy || projects.length === 0}>
            <option value="">No project</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="ghost" onClick={() => void createProject()} disabled={busy || apiState !== "online"}><Plus size={15} /> New project</button>
          <button className={physicsMode ? "mode active" : "mode"} onClick={() => setPhysicsMode((value) => !value)}><Activity size={15} /> Physics Lab</button>
          <span className={`api-state ${apiState}`}>{apiState === "online" ? "API connected" : apiState}</span>
          <span className="maturity"><ShieldCheck size={14} /> {project?.maturity ?? "conceptual"}</span>
          <button onClick={() => void spatializeAll()} disabled={busy || !project || sources.length === 0}>{busy ? <Loader2 className="spin" size={15} /> : <Braces size={15} />} Spatialize all</button>
        </div>
      </header>

      <aside className="left-panel">
        <PanelTitle icon={<Box size={16} />}>Scene graph</PanelTitle>
        <div className="tree">
          {objects.length === 0 && <div className="empty-card">The scene is empty. Import a source to build it.</div>}
          {objects.map((object) => (
            <button key={object.id} className={`tree-row ${selected?.id === object.id ? "selected" : ""}`} onClick={() => setSelected(object)}>
              <CircleDot size={13} /><span>{object.label}</span><small>{object.kind}</small>
            </button>
          ))}
        </div>
        <PanelTitle icon={<FileBox size={16} />}>Sources</PanelTitle>
        <label className={`upload ${!project || busy ? "disabled" : ""}`}><Upload size={15} /> Import PDF, Python, OBJ or GLB<input type="file" accept=".pdf,.py,.obj,.glb" multiple disabled={!project || busy} onChange={(event) => void uploadFiles(event)} /></label>
        <div className="source-list">
          {sources.map((source) => <button key={source.id} onClick={() => setMessage(JSON.stringify(source.analysis, null, 2))}><strong>{source.filename}</strong><span>{source.kind.toUpperCase()} · {formatBytes(source.size_bytes)}</span><em>{source.status}</em></button>)}
        </div>
      </aside>

      <section className="viewport">
        <Suspense fallback={<div className="viewport-loading"><Loader2 className="spin" />Loading 3D engine…</div>}>
          <SpatialScene
            objects={objects}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            assetUrl={(sourceId) => project ? api.assetUrl(project.id, sourceId) : ""}
            time={time}
            physicsMode={physicsMode}
            physicsParameters={physics}
            onTelemetry={(energy, steps, fps) => setTelemetry({ energy, steps, fps })}
          />
        </Suspense>
        <div className="viewport-label"><span>Revision {project?.current_scene.revision ?? 0}</span><span>{physicsMode ? "52 × 34 field" : `${objects.length} objects`}</span><span>{physicsMode ? "120 Hz solver" : "Source-driven"}</span></div>
        {physicsMode && <div className="physics-hint">Click the membrane to inject a physical impulse</div>}
        {apiState === "offline" && <div className="offline-overlay"><strong>API unavailable</strong><span>Start the FastAPI service on {apiUrl}.</span></div>}
      </section>

      <aside className="right-panel">
        {physicsMode ? <>
          <PanelTitle icon={<Activity size={16} />}>Physics laboratory</PanelTitle>
          <h2>Damped membrane</h2>
          <dl><div><dt>Solver</dt><dd>finite difference</dd></div><div><dt>Grid</dt><dd>52 × 34</dd></div><div><dt>Frequency</dt><dd>120 Hz fixed</dd></div><div><dt>Render</dt><dd>{telemetry.fps.toFixed(0)} fps</dd></div><div><dt>Steps</dt><dd>{telemetry.steps}</dd></div><div><dt>Energy</dt><dd className="gold">{telemetry.energy.toFixed(4)}</dd></div></dl>
          <div className="physics-controls">
            <label><span>Wave speed <b>{physics.waveSpeed.toFixed(1)}</b></span><input type="range" min="0.4" max="4.5" step="0.1" value={physics.waveSpeed} onChange={(event) => setPhysics((value) => ({ ...value, waveSpeed: Number(event.target.value) }))} /></label>
            <label><span>Damping <b>{physics.damping.toFixed(2)}</b></span><input type="range" min="0" max="4" step="0.05" value={physics.damping} onChange={(event) => setPhysics((value) => ({ ...value, damping: Number(event.target.value) }))} /></label>
            <label><span>Impulse <b>{physics.impulse.toFixed(2)}</b></span><input type="range" min="0.1" max="2" step="0.05" value={physics.impulse} onChange={(event) => setPhysics((value) => ({ ...value, impulse: Number(event.target.value) }))} /></label>
          </div>
          <div className="physics-actions"><button onClick={() => setPhysics((value) => ({ ...value, paused: !value.paused }))}>{physics.paused ? <Play size={14} /> : <Pause size={14} />}{physics.paused ? "Resume" : "Pause"}</button><button onClick={() => setPhysics((value) => ({ ...value, resetVersion: value.resetVersion + 1 }))}><RotateCcw size={14} />Reset</button></div>
          <div className="provenance"><strong>Physical scope</strong><p>Stable two-dimensional wave equation, fixed boundaries, viscous damping and Gaussian impulses. This is a computational model, not a calibrated material law.</p></div>
        </> : <>
        <PanelTitle icon={<CircleDot size={16} />}>Inspector</PanelTitle>
        {selected ? <>
          <h2>{selected.label}</h2>
          <dl><div><dt>Type</dt><dd>{selected.kind}</dd></div><div><dt>Origin</dt><dd>{selected.inferred ? "Inferred" : "Extracted"}</dd></div><div><dt>Sources</dt><dd>{selected.source_refs.length}</dd></div></dl>
          <div className="coordinates"><label>X<input type="number" step="0.1" value={draftTransform?.position[0] ?? 0} onChange={(event) => updatePosition(0, event.target.value)} /></label><label>Y<input type="number" step="0.1" value={draftTransform?.position[1] ?? 0} onChange={(event) => updatePosition(1, event.target.value)} /></label><label>Z<input type="number" step="0.1" value={draftTransform?.position[2] ?? 0} onChange={(event) => updatePosition(2, event.target.value)} /></label></div>
          <div className="provenance"><strong>Provenance</strong>{selected.source_refs.length ? selected.source_refs.map((ref) => <p key={`${ref.source_sha256}-${ref.locator}`}>{ref.locator} · {ref.method} · {(ref.confidence * 100).toFixed(0)}%</p>) : <p>No source attached.</p>}</div>
          <PanelTitle icon={<GitCompare size={16} />}>Controlled edit</PanelTitle>
          <div className="patch-card"><span>{pendingPatch ? "Patch previewed" : "Preview required"}</span><p>{pendingPatch ? `Bound to revision ${pendingPatch.request.base_revision}.` : "Coordinates are never written before an explicit preview and approval."}</p><button onClick={() => void (pendingPatch ? applyPatch() : previewTransform())} disabled={busy}>{pendingPatch ? "Approve and apply" : "Preview transform patch"}</button></div>
        </> : <div className="empty-card">Select an object in the scene or scene graph to inspect its provenance and edit it.</div>}
        </>}
        {(error || message) && <pre className={error ? "event error" : "event"}>{error || message}</pre>}
      </aside>

      <footer className="timeline">{physicsMode ? <><span>Physics field</span><div className="live-indicator"><i />{physics.paused ? "Paused" : "Live"}</div><span>{telemetry.steps} steps</span></> : <><span>0</span><input aria-label="Spatial timeline" type="range" min="0" max="1" step="0.001" value={time} onChange={(event) => setTime(Number(event.target.value))} /><span>1.0 s</span></>}</footer>
    </main>
  );
}
