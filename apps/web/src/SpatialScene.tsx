import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, ThreeEvent, useLoader } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { Box3, Color, Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import PhysicsLab, { PhysicsParameters } from "./PhysicsLab";
import type { SomatotopicToken } from "./physics";
import type { SceneObject } from "./types";

type SceneProps = {
  objects: SceneObject[];
  selectedId: string | null;
  onSelect: (object: SceneObject) => void;
  assetUrl: (sourceId: string) => string;
  time: number;
  physicsMode: boolean;
  physicsParameters: PhysicsParameters;
  onTelemetry: (
    energy: number,
    harvestedJoules: number,
    awake: boolean,
    token: SomatotopicToken | null,
    steps: number,
    fps: number,
  ) => void;
};

function normalizedClone(source: Group): Group {
  const clone = source.clone(true);
  const box = new Box3().setFromObject(clone);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1e-6);
  clone.position.sub(center);
  clone.scale.setScalar(3.5 / largest);
  return clone;
}

function GlbAsset({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => normalizedClone(gltf.scene), [gltf.scene]);
  return <primitive object={scene} />;
}

function ObjAsset({ url }: { url: string }) {
  const loaded = useLoader(OBJLoader, url);
  const scene = useMemo(() => normalizedClone(loaded), [loaded]);
  return <primitive object={scene} />;
}

function Primitive({ object, selected, onSelect, assetUrl, time }: {
  object: SceneObject;
  selected: boolean;
  onSelect: (object: SceneObject) => void;
  assetUrl: (sourceId: string) => string;
  time: number;
}) {
  const stopAndSelect = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(object);
  };
  const position = object.transform.position;
  const rotation = object.transform.rotation_rad;
  const scale = object.transform.scale;
  const sourceKind = String(object.properties.source_kind ?? "");
  const sourceId = String(object.properties.source_id ?? "");

  if (object.kind === "mesh" && sourceId && (sourceKind === "glb" || sourceKind === "obj")) {
    const url = assetUrl(sourceId);
    return (
      <group position={position} rotation={rotation} scale={scale} onClick={stopAndSelect}>
        <Suspense fallback={<mesh><boxGeometry /><meshStandardMaterial color="#665725" wireframe /></mesh>}>
          {sourceKind === "glb" ? <GlbAsset url={url} /> : <ObjAsset url={url} />}
        </Suspense>
        {selected && <mesh scale={4}><boxGeometry /><meshBasicMaterial color="#f2c94c" wireframe transparent opacity={0.45} /></mesh>}
      </group>
    );
  }

  const pulse = 0.85 + Math.sin(time * Math.PI * 2 + position[0]) * 0.15;
  const color = selected ? "#f2c94c" : object.kind === "algorithm" ? "#63a7b8" : object.kind === "section" ? "#a18e5a" : object.inferred ? "#766b4a" : "#718083";

  return (
    <mesh position={position} rotation={rotation} scale={object.kind === "field" ? scale.map((value) => value * pulse) as [number, number, number] : scale} onClick={stopAndSelect}>
      {object.kind === "algorithm" ? <octahedronGeometry args={[0.3, 0]} /> : object.kind === "section" ? <boxGeometry args={[0.42, 0.22, 0.16]} /> : object.kind === "document" ? <boxGeometry args={[1.4, 1.8, 0.18]} /> : <sphereGeometry args={[0.28, 24, 24]} />}
      <meshStandardMaterial color={color} emissive={selected ? "#8f6700" : "#000000"} emissiveIntensity={selected ? 0.75 : 0} roughness={0.48} />
    </mesh>
  );
}

function InstancedNodes({ objects, selectedId, onSelect, kind }: {
  objects: SceneObject[];
  selectedId: string | null;
  onSelect: (object: SceneObject) => void;
  kind: "algorithm" | "section";
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const color = new Color();
    objects.forEach((object, index) => {
      position.fromArray(object.transform.position);
      rotation.setFromEuler(new Euler(...object.transform.rotation_rad));
      scale.fromArray(object.transform.scale);
      matrix.compose(position, rotation, scale);
      mesh.current?.setMatrixAt(index, matrix);
      color.set(object.id === selectedId ? "#f2c94c" : kind === "algorithm" ? "#63a7b8" : "#a18e5a");
      mesh.current?.setColorAt(index, color);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [kind, objects, selectedId]);

  if (objects.length === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, objects.length]} onClick={(event) => {
      event.stopPropagation();
      if (event.instanceId !== undefined) onSelect(objects[event.instanceId]);
    }}>
      {kind === "algorithm" ? <octahedronGeometry args={[0.3, 0]} /> : <boxGeometry args={[0.42, 0.22, 0.16]} />}
      <meshStandardMaterial vertexColors roughness={0.48} />
    </instancedMesh>
  );
}

export default function SpatialScene({ objects, selectedId, onSelect, assetUrl, time, physicsMode, physicsParameters, onTelemetry }: SceneProps) {
  const algorithmObjects = objects.filter((object) => object.kind === "algorithm");
  const sectionObjects = objects.filter((object) => object.kind === "section");
  const individualObjects = objects.filter((object) => object.kind !== "algorithm" && object.kind !== "section");
  return (
    <Canvas camera={{ position: [6.5, 5.3, 7.5], fov: 43 }} dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: "high-performance" }} performance={{ min: 0.5 }}>
      <color attach="background" args={["#0b0d0e"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 8, 5]} intensity={2.1} />
      <directionalLight position={[-4, 2, -3]} color="#4f7982" intensity={0.7} />
      {physicsMode ? <PhysicsLab parameters={physicsParameters} onTelemetry={onTelemetry} /> : <>
        <InstancedNodes objects={algorithmObjects} selectedId={selectedId} onSelect={onSelect} kind="algorithm" />
        <InstancedNodes objects={sectionObjects} selectedId={selectedId} onSelect={onSelect} kind="section" />
        {individualObjects.map((object) => <Primitive key={object.id} object={object} selected={selectedId === object.id} onSelect={onSelect} assetUrl={assetUrl} time={time} />)}
      </>}
      <Grid args={[24, 24]} cellColor="#252a2c" sectionColor="#3c4244" fadeDistance={24} />
      <OrbitControls makeDefault dampingFactor={0.08} enableDamping />
    </Canvas>
  );
}
