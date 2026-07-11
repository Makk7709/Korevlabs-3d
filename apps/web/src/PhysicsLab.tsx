import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, Vector3 } from "three";
import type { BoundaryMode, SomatotopicToken } from "./physics";
import {
  applyTextileImpact,
  createTextile,
  inferImpactProfile,
  renderDisplacement,
  resetTextile,
  TEXTILE_MATERIALS,
} from "./textileModel";
import type { TextileMaterialKey } from "./textileModel";
import { buildTextileToken, stepTextile, textileMechanicalEnergy, totalTextileHarvestedEnergy } from "./textileSolver";

export type PhysicsParameters = {
  waveSpeedX: number; waveSpeedY: number; damping: number; impactEnergyJoules: number;
  conversionEfficiency: number; wakeThresholdJoules: number; detectionThreshold: number;
  boundary: BoundaryMode; sensitivityGain: number; slowMotion: number; paused: boolean; resetVersion: number;
  materialKey?: TextileMaterialKey;
};

type Props = { parameters: PhysicsParameters; onTelemetry: (energy: number, harvested: number, awake: boolean, token: SomatotopicToken | null, steps: number, fps: number) => void };
const C = 52, R = 34, DW = 8, DD = 5, WM = 0.8, DM = 0.5, DT = 1e-5, MAX = 256;
const SENSORS = Array.from({ length: 48 }, (_, i): [number, number] => [Math.round(((i % 8) + .5) / 8 * (C - 1)), Math.round((Math.floor(i / 8) + .5) / 6 * (R - 1))]);

function makeGeometry(): BufferGeometry {
  const positions = new Float32Array(C * R * 3), colors = new Float32Array(C * R * 3), indices: number[] = [];
  for (let y = 0; y < R; y += 1) for (let x = 0; x < C; x += 1) {
    const i = y * C + x;
    positions[i * 3] = x / (C - 1) * DW - DW / 2;
    positions[i * 3 + 2] = y / (R - 1) * DD - DD / 2;
    colors.set([0.12, 0.16, 0.17], i * 3);
    if (x < C - 1 && y < R - 1) indices.push(i, i + C, i + 1, i + 1, i + C, i + C + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("color", new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export default function PhysicsLab({ parameters: q, onTelemetry }: Props) {
  const material = TEXTILE_MATERIALS[q.materialKey ?? "aramid"];
  const state = useMemo(() => createTextile(C, R, WM, DM, material), []);
  const geometry = useMemo(makeGeometry, []);
  const sensors = useRef<InstancedMesh>(null), accumulator = useRef(0), steps = useRef(0), frame = useRef(0), fps = useRef(60);
  const matrix = useMemo(() => new Matrix4(), []), point = useMemo(() => new Vector3(), []), color = useMemo(() => new Color(), []);

  const fire = (column: number, row: number) => {
    resetTextile(state, material);
    applyTextileImpact(state, material, inferImpactProfile(q.impactEnergyJoules), column, row, q.waveSpeedX, q.waveSpeedY, q.detectionThreshold / Math.max(q.sensitivityGain, 1e-6));
    accumulator.current = 0; steps.current = 0;
  };

  useEffect(() => { fire(C * .52, R * .48); }, [q.resetVersion, q.impactEnergyJoules, material.key]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_root, delta) => {
    fps.current = fps.current * .9 + Math.min(240, 1 / Math.max(delta, 1e-4)) * .1;
    if (!q.paused) {
      accumulator.current += Math.min(delta, .05) * Math.max(.01, q.slowMotion);
      let count = 0;
      while (accumulator.current >= DT && count < MAX) {
        stepTextile(state, { material, boundary: q.boundary, dt: DT, dampingScale: Math.max(.05, q.damping / 9), conversionEfficiency: q.conversionEfficiency, wakeThresholdJoules: q.wakeThresholdJoules, detectionStrain: q.detectionThreshold });
        accumulator.current -= DT; steps.current += 1; count += 1;
      }
      if (count === MAX) accumulator.current = 0;
    }

    const pa = geometry.getAttribute("position") as BufferAttribute, ca = geometry.getAttribute("color") as BufferAttribute;
    const positions = pa.array as Float32Array, colors = ca.array as Float32Array;
    for (let i = 0; i < state.displacement.length; i += 1) {
      const display = renderDisplacement(state.displacement[i], 10);
      const damage = state.damage[i], strain = Math.min(1, state.peakNodeStrain[i] / Math.max(material.failureStrain, 1e-6));
      positions[i * 3 + 1] = display;
      color.setRGB(.1 + .85 * Math.max(strain, damage), .18 + .45 * strain * (1 - damage), .2 - .16 * damage);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    pa.needsUpdate = true; ca.needsUpdate = true; frame.current += 1;
    if (frame.current % 3 === 0) geometry.computeVertexNormals();

    if (sensors.current) {
      SENSORS.forEach(([x, y], i) => {
        const index = y * C + x, display = renderDisplacement(state.displacement[index], 10), arrived = Number.isFinite(state.arrivalTimeSeconds[index]);
        point.set(x / (C - 1) * DW - DW / 2, display + .035, y / (R - 1) * DD - DD / 2);
        matrix.makeTranslation(point.x, point.y, point.z); sensors.current?.setMatrixAt(i, matrix);
        color.setRGB(arrived ? .95 : .2, arrived ? .72 : .24, state.damage[index] > .5 ? .05 : .22); sensors.current?.setColorAt(i, color);
      });
      sensors.current.instanceMatrix.needsUpdate = true; if (sensors.current.instanceColor) sensors.current.instanceColor.needsUpdate = true;
    }

    if (frame.current % 12 === 0) onTelemetry(
      textileMechanicalEnergy(state), totalTextileHarvestedEnergy(state), state.awake,
      buildTextileToken(state, SENSORS, { signalSpeedX: q.waveSpeedX, signalSpeedY: q.waveSpeedY }),
      steps.current, fps.current,
    );
  });

  const inject = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    fire((event.point.x + DW / 2) / DW * (C - 1), (event.point.z + DD / 2) / DD * (R - 1));
  };

  return <group><mesh geometry={geometry} onPointerDown={inject}><meshStandardMaterial vertexColors side={DoubleSide} roughness={.68} metalness={.04} /></mesh><instancedMesh ref={sensors} args={[undefined, undefined, 48]}><sphereGeometry args={[.055, 10, 8]} /><meshStandardMaterial vertexColors roughness={.32} metalness={.2} /></instancedMesh></group>;
}
