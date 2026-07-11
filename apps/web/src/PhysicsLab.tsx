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
import { applyNormalizedEnergyImpulse, visualDisplacement } from "./impact";
import {
  buildSomatotopicToken,
  createMembrane,
  membraneEnergy,
  resetMembrane,
  step