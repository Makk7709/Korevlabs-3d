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
import type { SomatotopicToken } from "./physics";
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
    waveSpeedX: 42,
    waveSpeedY: 28,
    damping: 9,
    impactEnergyJoules: 0.02,
    conversionEfficiency: 0.18,
    wakeThresholdJoules: 0.001,
    detectionThreshold: 0.0015,
    boundary: "reflective",
    sensitivityGain: 1,
    paused: false,
    resetVersion: 0,
  });
  const [telemetry, setTelemetry] = useState({
    energy: 0,
    harvestedJoules: 0,
    awake: false,
    token: null as SomatotopicToken | null,
    steps: 0,
    fps: 0,
  });

  const showError = useCallback((cause: unknown) => {
    setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Unexpected error");
  }, []);

  const refreshProject = useCallback(async (projectId: string) => {
    const [nextProject, nextSources] = await Promise.all([api.getProject(projectId), api.listSources(projectId)]);
    setProject(nextProject);
    setSources(nextSources);
    setProjects((current) => current.map((item) => item.id === nextProject.id ? nextProject : item));
    if (selected) setSelected(nextProject.current_scene.objects.find((item) => item.id === selected.id) ?? null);
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
          const [restoredProject, restoredSources] = await Promise.all([api.getProject(items[0].id), api.listSources(items[0].id)]);
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
      setSelected(null); setPendingPatch(null); setMessage("Project loaded.");
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
      setPendingPatch(patch); setMessage("Revision-bound patch ready for human approval.");
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
      setPendingPatch(null); setMessage(`Patch applied. Scene revision is now ${updated.current_scene.revision}.`);
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
            <option value="">No project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="ghost" onClick={() => void createProject()} disabled={busy || apiState !== "online"}><Plus size={15} /> New project</button>
          <button className={physicsMode ? "mode active" : "mode"} onClick={() => setPhysicsMode((value) => !value)}><Activity size={15} /> Somatosensory Lab</button>
          <span className={`api-state ${apiState}`}>{apiState === "online" ? "API connected" : apiState}</span>
          <span className="maturity"><ShieldCheck size={14} /> conceptual</span>
          <button onClick={() => void spatializeAll()} disabled={busy || !project || sources.length === 0}>{busy ? <Loader2 className="spin" size={15} /> : <Braces size={15} />} Spatialize all</button>
        </div>
      </header>

      <aside className="left-panel">
        <PanelTitle icon={<Box size={16} />}>Scene graph</PanelTitle>
        <div className="tree">{objects.length === 0 && <div className="empty-card">The scene is empty. Import a source to build it.</div>}{objects.map((object) => <button key={object.id} className={`tree-row ${selected?.id === object.id ? "selected" : ""}`} onClick={() => setSelected(object)}><CircleDot size={13} /><span>{object.label}</span><small>{object.kind}</small></button>)}</div>
        <PanelTitle icon={<FileBox size={16} />}>Sources</PanelTitle>
        <label className={`upload ${!project || busy ? "disabled" : ""}`}><Upload size={15} /> Import PDF, Python, OBJ or GLB<input type="file" accept=".pdf,.py,.obj,.glb" multiple disabled={!project || busy} onChange={(event) => void uploadFiles(event)} /></label>
        <div className="source-list">{sources.map((source) => <button key={source.id} onClick={() => setMessage(JSON.stringify(source.analysis, null, 2))}><strong>{source.filename}</strong><span>{source.kind.toUpperCase()} · {formatBytes(source.size_bytes)}</span><em>{source.status}</em></button>)}</div>
      </aside>

      <section className="viewport">
        <Suspense fallback={<div className="viewport-loading"><Loader2 className="spin" />Loading 3D engine…</div>}>
          <SpatialScene objects={objects} selectedId={selected?.id ?? null} onSelect={setSelected} assetUrl={(sourceId) => project ? api.assetUrl(project.id, sourceId) : ""} time={time} physicsMode={physicsMode} physicsParameters={physics} onTelemetry={(energy, harvestedJoules, awake, token, steps, fps) => setTelemetry({ energy, harvestedJoules, awake, token, steps, fps })} />
        </Suspense>
        <div className="viewport-label"><span>Revision {project?.current_scene.revision ?? 0}</span><span>{physicsMode ? "48 receptors" : `${objects.length} objects`}</span><span>{physicsMode ? "1 kHz causal solver" : "Source-driven"}</span></div>
        {physicsMode && <div className="physics-hint">Click the substrate to inject an energy-bounded physical event</div>}
        {apiState === "offline" && <div className="offline-overlay"><strong>API unavailable</strong><span>Start the FastAPI service on {apiUrl}.</span></div>}
      </section>

      <aside className="right-panel">
        {physicsMode ? <>
          <PanelTitle icon={<Activity size={16} />}>Causal somatosensory system</PanelTitle>
          <h2>Energy → perception</h2>
          <dl>
            <div><dt>State</dt><dd className={telemetry.awake ? "gold" : ""}>{telemetry.awake ? "AWAKE" : "DORMANT"}</dd></div>
            <div><dt>Mechanical energy</dt><dd>{telemetry.energy.toExponential(2)}</dd></div>
            <div><dt>Harvested</dt><dd className="gold">{(telemetry.harvestedJoules * 1000).toFixed(3)} mJ</dd></div>
            <div><dt>Wake threshold</dt><dd>{(physics.wakeThresholdJoules * 1000).toFixed(2)} mJ</dd></div>
            <div><dt>Localized</dt><dd>{telemetry.token ? `${(telemetry.token.bodyCoordinates[0] * 100).toFixed(0)}%, ${(telemetry.token.bodyCoordinates[1] * 100).toFixed(0)}%` : "pending"}</dd></div>
            <div><dt>Confidence</dt><dd>{telemetry.token ? telemetry.token.confidence.toFixed(2) : "—"}</dd></div>
            <div><dt>Solver</dt><dd>1 kHz</dd></div>
          </dl>
          <div className="physics-controls">
            <label><span>Wave X <b>{physics.waveSpeedX.toFixed(0)} m/s</b></span><input type="range" min="5" max="100" step="1" value={physics.waveSpeedX} onChange={(event) => setPhysics((value) => ({ ...value, waveSpeedX: Number(event.target.value) }))} /></label>
            <label><span>Wave Y <b>{physics.waveSpeedY.toFixed(0)} m/s</b></span><input type="range" min="5" max="100" step="1" value={physics.waveSpeedY} onChange={(event) => setPhysics((value) => ({ ...value, waveSpeedY: Number(event.target.value) }))} /></label>
            <label><span>Impact energy <b>{(physics.impactEnergyJoules * 1000).toFixed(1)} mJ</b></span><input type="range" min="0.001" max="0.1" step="0.001" value={physics.impactEnergyJoules} onChange={(event) => setPhysics((value) => ({ ...value, impactEnergyJoules: Number(event.target.value) }))} /></label>
            <label><span>Conversion <b>{(physics.conversionEfficiency * 100).toFixed(0)}%</b></span><input type="range" min="0.01" max="0.5" step="0.01" value={physics.conversionEfficiency} onChange={(event) => setPhysics((value) => ({ ...value, conversionEfficiency: Number(event.target.value) }))} /></label>
            <label><span>Efferent sensitivity <b>{physics.sensitivityGain.toFixed(2)}×</b></span><input type="range" min="0.25" max="4" step="0.05" value={physics.sensitivityGain} onChange={(event) => setPhysics((value) => ({ ...value, sensitivityGain: Number(event.target.value) }))} /></label>
            <label><span>Boundary</span><select value={physics.boundary} onChange={(event) => setPhysics((value) => ({ ...value, boundary: event.target.value as PhysicsParameters["boundary"] }))}><option value="fixed">fixed</option><option value="reflective">reflective</option><option value="absorbing">absorbing</option></select></label>
          </div>
          <div className="physics-actions"><button onClick={() => setPhysics((value) => ({ ...value, paused: !value.paused }))}>{physics.paused ? <Play size={14} /> : <Pause size={14} />}{physics.paused ? "Resume" : "Pause"}</button><button onClick={() => setPhysics((value) => ({ ...value, resetVersion: value.resetVersion + 1 }))}><RotateCcw size={14} />Reset</button></div>
          <div className="provenance"><strong>Patent scope implemented</strong><p>Energy-bounded impact, anisotropic propagation, distributed receptors, TDOA-style localization, autonomous wake threshold, somatotopic token and efferent sensitivity modulation. This remains a conceptual simulator until calibrated against a physical prototype.</p></div>
        </> : <>
          <PanelTitle icon={<CircleDot size={16} />}>Inspector</PanelTitle>
          {selected ? <><h2>{selected.label}</h2><dl><div><dt>Type</dt><dd>{selected.kind}</dd></div><div><dt>Origin</dt><dd>{selected.inferred ? "Inferred" : "Extracted"}</dd></div><div><dt>Sources</dt><dd>{selected.source_refs.length}</dd></div></dl><div className="coordinates"><label>X<input type="number" step="0.1" value={draftTransform?.position[0] ?? 0} onChange={(event) => updatePosition(0, event.target.value)} /></label><label>Y<input type="number" step="0.1" value={draftTransform?.position[1] ?? 0} onChange={(event) => updatePosition(1, event.target.value)} /></label><label>Z<input type="number" step="0.1" value={draftTransform?.position[2] ?? 0} onChange={(event) => updatePosition(2, event.target.value)} /></label></div><div className="provenance"><strong>Provenance</strong>{selected.source_refs.length ? selected.source_refs.map((ref) => <p key={`${ref.source_sha256}-${ref.locator}`}>{ref.locator} · {ref.method} · {(ref.confidence * 100).toFixed(0)}%</p>) : <p>No source attached.</p>}</div><PanelTitle icon={<GitCompare size={16} />}>Controlled edit</PanelTitle><div className="patch-card"><span>{pendingPatch ? "Patch previewed" : "Preview required"}</span><p>{pendingPatch ? `Bound to revision ${pendingPatch.request.base_revision}.` : "Coordinates are never written before an explicit preview and approval."}</p><button onClick={() => void (pendingPatch ? applyPatch() : previewTransform())} disabled={busy}>{pendingPatch ? "Approve and apply" : "Preview transform patch"}</button></div></> : <div className="empty-card">Select an object in the scene or scene graph to inspect its provenance and edit it.</div>}
        </>}
        {(error || message) && <pre className={error ? "event error" : "event"}>{error || message}</pre>}
      </aside>

      <footer className="timeline">{physicsMode ? <><span>Causal chain</span><div className="live-indicator"><i />{physics.paused ? "Paused" : telemetry.awake ? "Awake" : "Dormant"}</div><span>{telemetry.steps} steps</span></> : <><span>0</span><input aria-label="Spatial timeline" type="range" min="0" max="1" step="0.001" value={time} onChange={(event) => setTime(Number(event.target.value))} /><span>1.0 s</span></>}</footer>
    </main>
  );
}
