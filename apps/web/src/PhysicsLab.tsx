import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, Vector3 } from "three";
import { applyNormalizedEnergyImpulse, visualDisplacement } from "./impact";
import { buildSomatotopicToken, createMembrane, membraneEnergy, resetMembrane, stepMembrane, totalHarvestedEnergy } from "./physics";
import type { BoundaryMode, SomatotopicToken } from "./physics";

export type PhysicsParameters = {
  waveSpeedX: number; waveSpeedY: number; damping: number; impactEnergyJoules: number;
  conversionEfficiency: number; wakeThresholdJoules: number; detectionThreshold: number;
  boundary: BoundaryMode; sensitivityGain: number; slowMotion: number; paused: boolean; resetVersion: number;
};

type Props = { parameters: PhysicsParameters; onTelemetry: (energy: number, harvested: number, awake: boolean, token: SomatotopicToken | null, steps: number, fps: number) => void };
const C = 52, R = 34, DW = 8, DD = 5, WM = 0.8, DM = 0.5, DT = 1 / 1000, MAX = 48;
const SENSORS = Array.from({ length: 48 }, (_, i): [number, number] => [Math.round(((i % 8) + .5) / 8 * (C - 1)), Math.round((Math.floor(i / 8) + .5) / 6 * (R - 1))]);

function geometry(): BufferGeometry {
  const p = new Float32Array(C * R * 3), colors = new Float32Array(C * R * 3), idx: number[] = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const i = y * C + x;
    p[i * 3] = x / (C - 1) * DW - DW / 2; p[i * 3 + 2] = y / (R - 1) * DD - DD / 2;
    colors.set([.12, .16, .17], i * 3);
    if (x < C - 1 && y < R - 1) idx.push(i, i + C, i + 1, i + 1, i + C, i + C + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(p, 3).setUsage(DynamicDrawUsage));
  g.setAttribute("color", new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

export default function PhysicsLab({ parameters: q, onTelemetry }: Props) {
  const state = useMemo(() => createMembrane(C, R), []), g = useMemo(geometry, []);
  const sensors = useRef<InstancedMesh>(null), acc = useRef(0), steps = useRef(0), frame = useRef(0), fps = useRef(60);
  const matrix = useMemo(() => new Matrix4(), []), pos = useMemo(() => new Vector3(), []), color = useMemo(() => new Color(), []);
  const fire = (x: number, y: number) => { resetMembrane(state); applyNormalizedEnergyImpulse(state, x, y, q.impactEnergyJoules, 2.3); acc.current = 0; steps.current = 0; };

  useEffect(() => { fire(C * .52, R * .48); }, [q.resetVersion, q.impactEnergyJoules]);
  useEffect(() => () => g.dispose(), [g]);

  useFrame((_root, delta) => {
    fps.current = fps.current * .9 + Math.min(240, 1 / Math.max(delta, 1e-4)) * .1;
    if (!q.paused) {
      acc.current += Math.min(delta, .05) * Math.max(.01, q.slowMotion);
      let n = 0;
      while (acc.current >= DT && n++ < MAX) {
        stepMembrane(state, { waveSpeedX: q.waveSpeedX, waveSpeedY: q.waveSpeedY, damping: q.damping, dt: DT, spacingX: WM / (C - 1), spacingY: DM / (R - 1), boundary: q.boundary, conversionEfficiency: q.conversionEfficiency, wakeThresholdJoules: q.wakeThresholdJoules, detectionThreshold: q.detectionThreshold / Math.max(q.sensitivityGain, 1e-6) });
        acc.current -= DT; steps.current++;
      }
    }

    const pa = g.getAttribute("position") as BufferAttribute, ca = g.getAttribute("color") as BufferAttribute;
    const pv = pa.array as Float32Array, cv = ca.array as Float32Array;
    for (let i = 0; i < state.displacement.length; i++) {
      const v = visualDisplacement(state.displacement[i], q.impactEnergyJoules), a = Math.min(1, Math.abs(v) / .72);
      pv[i * 3 + 1] = v; color.setRGB(.1 + a * .9, .16 + a * .48, .18 - a * .1); cv.set([color.r, color.g, color.b], i * 3);
    }
    pa.needsUpdate = ca.needsUpdate = true; frame.current++; if (frame.current % 3 === 0) g.computeVertexNormals();

    if (sensors.current) {
      SENSORS.forEach(([x, y], i) => {
        const k = y * C + x, v = visualDisplacement(state.displacement[k], q.impactEnergyJoules), arrived = Number.isFinite(state.arrivalTimeSeconds[k]);
        pos.set(x / (C - 1) * DW - DW / 2, v + .035, y / (R - 1) * DD - DD / 2); matrix.makeTranslation(pos.x, pos.y, pos.z); sensors.current?.setMatrixAt(i, matrix);
        color.setRGB(arrived ? .9 : .2, arrived ? .75 : .24, arrived ? .1 : .25); sensors.current?.setColorAt(i, color);
      });
      sensors.current.instanceMatrix.needsUpdate = true; if (sensors.current.instanceColor) sensors.current.instanceColor.needsUpdate = true;
    }

    if (frame.current % 12 === 0) onTelemetry(membraneEnergy(state), totalHarvestedEnergy(state), state.awake, buildSomatotopicToken(state, SENSORS, { spacingX: WM / (C - 1), spacingY: DM / (R - 1), waveSpeedX: q.waveSpeedX, waveSpeedY: q.waveSpeedY }), steps.current, fps.current);
  });

  const inject = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); fire((e.point.x + DW / 2) / DW * (C - 1), (e.point.z + DD / 2) / DD * (R - 1)); };
  return <group><mesh geometry={g} onPointerDown={inject}><meshStandardMaterial vertexColors side={DoubleSide} roughness={.62} metalness={.08} /></mesh><instancedMesh ref={sensors} args={[undefined, undefined, 48]}><sphereGeometry args={[.055, 10, 8]} /><meshStandardMaterial vertexColors roughness={.32} metalness={.2} /></instancedMesh></group>;
}
