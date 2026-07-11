import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Box, Braces, CircleDot, GitCompare, Play, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type ApiState = "checking" | "online" | "offline";

function Demonstrator() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 3.4, 28, 18]} />
        <meshStandardMaterial color="#24292b" wireframe roughness={0.65} />
      </mesh>
      {Array.from({ length: 24 }, (_, index) => {
        const x = (index % 6) * 0.85 - 2.15;
        const z = Math.floor(index / 6) * 0.78 - 1.16;
        const active = index === 8 || index === 14 || index === 15;
        return (
          <mesh key={index} position={[x, 0.34, z]}>
            <sphereGeometry args={[active ? 0.13 : 0.08, 20, 20]} />
            <meshStandardMaterial
              color={active ? "#f2c94c" : "#6e7678"}
              emissive={active ? "#9b6c00" : "#000000"}
              emissiveIntensity={active ? 1.5 : 0}
            />
          </mesh>
        );
      })}
      <mesh position={[0.35, 0.37, 0.15]}>
        <ringGeometry args={[0.32, 0.37, 48]} />
        <meshBasicMaterial color="#f2c94c" />
      </mesh>
    </group>
  );
}

function PanelTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel-title">
      {icon}
      <span>{children}</span>
    </div>
  );
}

export default function App() {
  const [apiState, setApiState] = useState<ApiState>("checking");
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((response) => setApiState(response.ok ? "online" : "offline"))
      .catch(() => setApiState("offline"));
    return () => controller.abort();
  }, [apiUrl]);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">K</span>
          <div><strong>KOREV LABS 3D</strong><small>Spatial research workbench</small></div>
        </div>
        <div className="status-row">
          <span className={`api-state ${apiState}`}>{apiState === "online" ? "API connected" : apiState}</span>
          <span className="maturity"><ShieldCheck size={14} /> Conceptual</span>
          <button><Play size={15} /> Run experiment</button>
        </div>
      </header>

      <aside className="left-panel">
        <PanelTitle icon={<Box size={16} />}>Scene graph</PanelTitle>
        <div className="tree">
          <div className="tree-row selected"><CircleDot size={14} /> Distributed surface</div>
          <div className="tree-child">Sensor network <span>24</span></div>
          <div className="tree-child">Impact estimate</div>
          <div className="tree-child">Propagation field</div>
        </div>
        <PanelTitle icon={<Braces size={16} />}>Sources</PanelTitle>
        <div className="empty-card">Drop a PDF, algorithm, dataset or mesh into the secured ingestion pipeline.</div>
      </aside>

      <section className="viewport">
        <Canvas camera={{ position: [5.7, 4.5, 6.5], fov: 42 }}>
          <color attach="background" args={["#0b0d0e"]} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 7, 4]} intensity={2.2} />
          <Demonstrator />
          <Grid args={[18, 18]} cellColor="#252a2c" sectionColor="#3c4244" fadeDistance={18} />
          <OrbitControls makeDefault />
        </Canvas>
        <div className="viewport-label"><span>Scene revision 1</span><span>24 objects</span><span>mm</span></div>
      </section>

      <aside className="right-panel">
        <PanelTitle icon={<CircleDot size={16} />}>Inspector</PanelTitle>
        <h2>Impact estimate</h2>
        <dl>
          <div><dt>Position</dt><dd>0.35, 0.15 mm</dd></div>
          <div><dt>Confidence</dt><dd className="gold">0.82</dd></div>
          <div><dt>Origin</dt><dd>Calculated</dd></div>
          <div><dt>Model</dt><dd>demo-localizer@0.1</dd></div>
        </dl>
        <div className="provenance">
          <strong>Provenance</strong>
          <p>This object is a conceptual demonstrator. No calibrated source is attached.</p>
        </div>
        <PanelTitle icon={<GitCompare size={16} />}>CAEL proposal</PanelTitle>
        <div className="patch-card">
          <span>Preview required</span>
          <p>Every CAEL mutation will appear here as a typed, revision-bound patch.</p>
          <button disabled>Review patch</button>
        </div>
      </aside>

      <footer className="timeline">
        <span>0 ms</span><div className="track"><div className="progress" /></div><span>16 ms</span>
      </footer>
    </main>
  );
}

