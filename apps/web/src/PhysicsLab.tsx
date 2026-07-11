import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
} from "three";
import {
  applyImpulse,
  buildSomatotopicToken,
  createMembrane,
  membraneEnergy,
  resetMembrane,
  stepMembrane,
  totalHarvestedEnergy,
} from "./physics";
import type { BoundaryMode, SomatotopicToken } from "./physics";

export type PhysicsParameters = {
  waveSpeedX: number;
  waveSpeedY: number;
  damping: number;
  impactEnergyJoules: number;
  conversionEfficiency: number;
  wakeThresholdJoules: number;
  detectionThreshold: number;
  boundary: BoundaryMode;
  sensitivityGain: number;
  paused: boolean;
  resetVersion: number;
};

type Props = {
  parameters: PhysicsParameters;
  onTelemetry: (
    energy: number,
    harvestedJoules: number,
    awake: boolean,
    token: SomatotopicToken | null,
    steps: number,
    fps: number,
  ) => void;
};

const COLUMNS = 52;
const ROWS = 34;
const DISPLAY_WIDTH = 8;
const DISPLAY_DEPTH = 5;
const WIDTH_METERS = 0.8;
const DEPTH_METERS = 0.5;
const FIXED_DT = 1 / 1000;
const MAX_SUBSTEPS = 24;

const SENSOR_GRID = Array.from({ length: 48 }, (_, index): [number, number] => {
  const row = Math.floor(index / 8);
  const column = index % 8;
  return [
    Math.round(((column + 0.5) / 8) * (COLUMNS - 1)),
    Math.round(((row + 0.5) / 6) * (ROWS - 1)),
  ];
});

function buildGeometry(): BufferGeometry {
  const positions = new Float32Array(COLUMNS * ROWS * 3);
  const colors = new Float32Array(COLUMNS * ROWS * 3);
  const indices: number[] = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const index = row * COLUMNS + column;
      positions[index * 3] = (column / (COLUMNS - 1)) * DISPLAY_WIDTH - DISPLAY_WIDTH / 2;
      positions[index * 3 + 1] = 0;
      positions[index * 3 + 2] = (row / (ROWS - 1)) * DISPLAY_DEPTH - DISPLAY_DEPTH / 2;
      colors.set([0.12, 0.16, 0.17], index * 3);

      if (column < COLUMNS - 1 && row < ROWS - 1) {
        const right = index + 1;
        const down = index + COLUMNS;
        indices.push(index, down, right, right, down, down + 1);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("color", new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export default function PhysicsLab({ parameters, onTelemetry }: Props) {
  const meshRef = useRef<Mesh>(null);
  const sensorRef = useRef<InstancedMesh>(null);
  const state = useMemo(() => createMembrane(COLUMNS, ROWS), []);
  const geometry = useMemo(buildGeometry, []);
  const accumulator = useRef(0);
  const totalSteps = useRef(0);
  const frame = useRef(0);
  const smoothedFps = useRef(60);
  const matrix = useMemo(() => new Matrix4(), []);
  const color = useMemo(() => new Color(), []);
  const position = useMemo(() => new Vector3(), []);

  useEffect(() => {
    resetMembrane(state);
    applyImpulse(
      state,
      COLUMNS * 0.52,
      ROWS * 0.48,
      parameters.impactEnergyJoules,
      2.5,
    );
    accumulator.current = 0;
    totalSteps.current = 0;
  }, [parameters.resetVersion, state, parameters.impactEnergyJoules]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_root, delta) => {
    smoothedFps.current =
      smoothedFps.current * 0.9 + Math.min(240, 1 / Math.max(delta, 1e-4)) * 0.1;

    if (!parameters.paused) {
      accumulator.current += Math.min(delta, 0.05);
      let substeps = 0;

      while (accumulator.current >= FIXED_DT && substeps < MAX_SUBSTEPS) {
        stepMembrane(state, {
          waveSpeedX: parameters.waveSpeedX,
          waveSpeedY: parameters.waveSpeedY,
          damping: parameters.damping,
          dt: FIXED_DT,
          spacingX: WIDTH_METERS / (COLUMNS - 1),
          spacingY: DEPTH_METERS / (ROWS - 1),
          boundary: parameters.boundary,
          conversionEfficiency: parameters.conversionEfficiency,
          wakeThresholdJoules: parameters.wakeThresholdJoules,
          detectionThreshold:
            parameters.detectionThreshold / Math.max(parameters.sensitivityGain, 1e-6),
        });
        accumulator.current -= FIXED_DT;
        substeps += 1;
        totalSteps.current += 1;
      }

      if (substeps === MAX_SUBSTEPS) accumulator.current = 0;
    }

    const positionAttribute = geometry.getAttribute("position") as BufferAttribute;
    const colorAttribute = geometry.getAttribute("color") as BufferAttribute;
    const positions = positionAttribute.array as Float32Array;
    const colors = colorAttribute.array as Float32Array;

    for (let index = 0; index < state.displacement.length; index += 1) {
      const displacement = state.displacement[index];
      positions[index * 3 + 1] = displacement * 0.35;
      const intensity = Math.min(1, Math.abs(displacement) * 1.8);
      color.setRGB(
        0.1 + intensity * 0.9,
        0.16 + intensity * 0.48,
        0.18 - intensity * 0.1,
      );
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    frame.current += 1;
    if (frame.current % 3 === 0) geometry.computeVertexNormals();

    if (sensorRef.current) {
      SENSOR_GRID.forEach(([gridColumn, gridRow], sensor) => {
        const index = gridRow * COLUMNS + gridColumn;
        position.set(
          (gridColumn / (COLUMNS - 1)) * DISPLAY_WIDTH - DISPLAY_WIDTH / 2,
          state.displacement[index] * 0.35 + 0.035,
          (gridRow / (ROWS - 1)) * DISPLAY_DEPTH - DISPLAY_DEPTH / 2,
        );
        matrix.makeTranslation(position.x, position.y, position.z);
        sensorRef.current?.setMatrixAt(sensor, matrix);

        const arrived = Number.isFinite(state.arrivalTimeSeconds[index]);
        const activation = Math.min(1, Math.abs(state.displacement[index]) * 2.5);
        color.setRGB(
          arrived ? 0.45 + activation * 0.55 : 0.2,
          arrived ? 0.58 + activation * 0.35 : 0.24,
          arrived ? 0.12 : 0.25,
        );
        sensorRef.current?.setColorAt(sensor, color);
      });

      sensorRef.current.instanceMatrix.needsUpdate = true;
      if (sensorRef.current.instanceColor) {
        sensorRef.current.instanceColor.needsUpdate = true;
      }
    }

    if (frame.current % 12 === 0) {
      const token = buildSomatotopicToken(state, SENSOR_GRID, {
        spacingX: WIDTH_METERS / (COLUMNS - 1),
        spacingY: DEPTH_METERS / (ROWS - 1),
        waveSpeedX: parameters.waveSpeedX,
        waveSpeedY: parameters.waveSpeedY,
      });
      onTelemetry(
        membraneEnergy(state),
        totalHarvestedEnergy(state),
        state.awake,
        token,
        totalSteps.current,
        smoothedFps.current,
      );
    }
  });

  function inject(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    const column =
      ((event.point.x + DISPLAY_WIDTH / 2) / DISPLAY_WIDTH) * (COLUMNS - 1);
    const row =
      ((event.point.z + DISPLAY_DEPTH / 2) / DISPLAY_DEPTH) * (ROWS - 1);

    resetMembrane(state);
    applyImpulse(state, column, row, parameters.impactEnergyJoules, 2.3);
    accumulator.current = 0;
    totalSteps.current = 0;
  }

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} onPointerDown={inject}>
        <meshStandardMaterial
          vertexColors
          side={DoubleSide}
          roughness={0.62}
          metalness={0.08}
        />
      </mesh>
      <instancedMesh ref={sensorRef} args={[undefined, undefined, 48]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial vertexColors roughness={0.32} metalness={0.2} />
      </instancedMesh>
    </group>
  );
}
