import type { BoundaryMode, SomatotopicToken } from "./physics";

export type TextileMaterialKey = "aramid" | "uhmwpe" | "elastomer";

export type TextileMaterial = {
  key: TextileMaterialKey;
  label: string;
  arealDensityKgM2: number;
  tensileXNm: number;
  tensileYNm: number;
  shearNm: number;
  pretensionXNm: number;
  pretensionYNm: number;
  bendingNm: number;
  dampingPerSecond: number;
  yieldStrain: number;
  failureStrain: number;
  damageRatePerSecond: number;
  ballisticLimitJoules: number;
  harvestCapJoules: number;
};

export const TEXTILE_MATERIALS: Record<TextileMaterialKey, TextileMaterial> = {
  aramid: {
    key: "aramid",
    label: "Aramid multilayer (uncalibrated)",
    arealDensityKgM2: 1.6,
    tensileXNm: 120_000,
    tensileYNm: 100_000,
    shearNm: 18_000,
    pretensionXNm: 60,
    pretensionYNm: 60,
    bendingNm: 0.04,
    dampingPerSecond: 70,
    yieldStrain: 0.06,
    failureStrain: 0.18,
    damageRatePerSecond: 300,
    ballisticLimitJoules: 700,
    harvestCapJoules: 0.01,
  },
  uhmwpe: {
    key: "uhmwpe",
    label: "UHMWPE laminate (uncalibrated)",
    arealDensityKgM2: 1.2,
    tensileXNm: 180_000,
    tensileYNm: 150_000,
    shearNm: 14_000,
    pretensionXNm: 50,
    pretensionYNm: 50,
    bendingNm: 0.025,
    dampingPerSecond: 45,
    yieldStrain: 0.045,
    failureStrain: 0.14,
    damageRatePerSecond: 360,
    ballisticLimitJoules: 900,
    harvestCapJoules: 0.01,
  },
  elastomer: {
    key: "elastomer",
    label: "Elastomer sensor skin (uncalibrated)",
    arealDensityKgM2: 1.0,
    tensileXNm: 8_000,
    tensileYNm: 8_000,
    shearNm: 3_000,
    pretensionXNm: 15,
    pretensionYNm: 15,
    bendingNm: 0.003,
    dampingPerSecond: 30,
    yieldStrain: 0.35,
    failureStrain: 1.2,
    damageRatePerSecond: 35,
    ballisticLimitJoules: 120,
    harvestCapJoules: 0.01,
  },
};

export type ImpactProfile = {
  energyJoules: number;
  projectileMassKg: number;
  diameterMeters: number;
  maximumCoupling: number;
};

export type TextileState = {
  columns: number;
  rows: number;
  widthMeters: number;
  depthMeters: number;
  spacingX: number;
  spacingY: number;
  nodeMassKg: number;
  displacement: Float32Array;
  velocity: Float32Array;
  force: Float32Array;
  damage: Float32Array;
  damageDelta: Float32Array;
  nodeStrain: Float32Array;
  peakNodeStrain: Float32Array;
  harvestedJoules: Float32Array;
  arrivalTimeSeconds: Float32Array;
  elapsedSeconds: number;
  eventSequence: number;
  awake: boolean;
  wakeTimeSeconds: number | null;
  inputEnergyJoules: number;
  transferredEnergyJoules: number;
  residualEnergyJoules: number;
  storedEnergyJoules: number;
  dissipatedEnergyJoules: number;
  projectileVelocityMps: number;
  eventOrigin: [number, number] | null;
  peakDeflectionMeters: number;
  maximumStrain: number;
  perforated: boolean;
  materialKey: TextileMaterialKey;
};

export type TextileStep = {
  material: TextileMaterial;
  boundary: BoundaryMode;
  dt: number;
  dampingScale: number;
  conversionEfficiency: number;
  wakeThresholdJoules: number;
  detectionStrain: number;
};

export type LocalizationGeometry = {
  signalSpeedX: number;
  signalSpeedY: number;
};

export function createTextile(
  columns: number,
  rows: number,
  widthMeters: number,
  depthMeters: number,
  material: TextileMaterial,
): TextileState {
  if (columns < 5 || rows < 5) throw new Error("textile requires at least a 5 × 5 grid");
  if (!(widthMeters > 0) || !(depthMeters > 0)) throw new Error("textile dimensions must be positive");
  const size = columns * rows;
  const arrivals = new Float32Array(size);
  arrivals.fill(Number.POSITIVE_INFINITY);
  const spacingX = widthMeters / (columns - 1);
  const spacingY = depthMeters / (rows - 1);
  return {
    columns,
    rows,
    widthMeters,
    depthMeters,
    spacingX,
    spacingY,
    nodeMassKg: material.arealDensityKgM2 * spacingX * spacingY,
    displacement: new Float32Array(size),
    velocity: new Float32Array(size),
    force: new Float32Array(size),
    damage: new Float32Array(size),
    damageDelta: new Float32Array(size),
    nodeStrain: new Float32Array(size),
    peakNodeStrain: new Float32Array(size),
    harvestedJoules: new Float32Array(size),
    arrivalTimeSeconds: arrivals,
    elapsedSeconds: 0,
    eventSequence: 0,
    awake: false,
    wakeTimeSeconds: null,
    inputEnergyJoules: 0,
    transferredEnergyJoules: 0,
    residualEnergyJoules: 0,
    storedEnergyJoules: 0,
    dissipatedEnergyJoules: 0,
    projectileVelocityMps: 0,
    eventOrigin: null,
    peakDeflectionMeters: 0,
    maximumStrain: 0,
    perforated: false,
    materialKey: material.key,
  };
}

export function resetTextile(state: TextileState, material: TextileMaterial): void {
  state.displacement.fill(0);
  state.velocity.fill(0);
  state.force.fill(0);
  state.damage.fill(0);
  state.damageDelta.fill(0);
  state.nodeStrain.fill(0);
  state.peakNodeStrain.fill(0);
  state.harvestedJoules.fill(0);
  state.arrivalTimeSeconds.fill(Number.POSITIVE_INFINITY);
  state.elapsedSeconds = 0;
  state.awake = false;
  state.wakeTimeSeconds = null;
  state.inputEnergyJoules = 0;
  state.transferredEnergyJoules = 0;
  state.residualEnergyJoules = 0;
  state.storedEnergyJoules = 0;
  state.dissipatedEnergyJoules = 0;
  state.projectileVelocityMps = 0;
  state.eventOrigin = null;
  state.peakDeflectionMeters = 0;
  state.maximumStrain = 0;
  state.perforated = false;
  state.materialKey = material.key;
  state.nodeMassKg = material.arealDensityKgM2 * state.spacingX * state.spacingY;
}

export function inferImpactProfile(energyJoules: number): ImpactProfile {
  const energy = Math.max(0, Number.isFinite(energyJoules) ? energyJoules : 0);
  if (energy < 1) {
    return { energyJoules: energy, projectileMassKg: 0.05, diameterMeters: 0.02, maximumCoupling: 0.12 };
  }
  if (energy < 250) {
    return { energyJoules: energy, projectileMassKg: 4, diameterMeters: 0.08, maximumCoupling: 0.08 };
  }
  if (energy < 1_200) {
    return { energyJoules: energy, projectileMassKg: 0.008, diameterMeters: 0.009, maximumCoupling: 0.05 };
  }
  if (energy < 10_000) {
    return { energyJoules: energy, projectileMassKg: 0.008, diameterMeters: 0.00762, maximumCoupling: 0.04 };
  }
  return { energyJoules: energy, projectileMassKg: 1, diameterMeters: 0.05, maximumCoupling: 0.025 };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function applyTextileImpact(
  state: TextileState,
  material: TextileMaterial,
  profile: ImpactProfile,
  column: number,
  row: number,
  signalSpeedX: number,
  signalSpeedY: number,
  detectionSignalJoules: number,
): void {
  const energy = Math.max(0, Number.isFinite(profile.energyJoules) ? profile.energyJoules : 0);
  const mass = Math.max(1e-6, Number.isFinite(profile.projectileMassKg) ? profile.projectileMassKg : 1e-6);
  const diameter = clamp(profile.diameterMeters, 0.001, Math.min(state.widthMeters, state.depthMeters));
  const overload = Math.max(1, energy / Math.max(material.ballisticLimitJoules, 1e-6));
  const captureLimit = material.ballisticLimitJoules * (1 + 0.12 * Math.log(overload));
  const capturableEnergy = Math.min(energy, captureLimit);
  const coupling = clamp(profile.maximumCoupling, 0, 0.25);
  const transferred = capturableEnergy * coupling;
  const radiusMeters = Math.max(diameter * 0.5, 3 * Math.max(state.spacingX, state.spacingY));
  const radiusColumns = radiusMeters / state.spacingX;
  const radiusRows = radiusMeters / state.spacingY;
  const samples: Array<{ index: number; weight: number }> = [];
  let weightedMass = 0;

  const minX = Math.max(1, Math.floor(column - radiusColumns * 3));
  const maxX = Math.min(state.columns - 2, Math.ceil(column + radiusColumns * 3));
  const minY = Math.max(1, Math.floor(row - radiusRows * 3));
  const maxY = Math.min(state.rows - 2, Math.ceil(row + radiusRows * 3));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x - column) * state.spacingX;
      const dy = (y - row) * state.spacingY;
      const weight = Math.exp(-(dx * dx + dy * dy) / Math.max(radiusMeters * radiusMeters, 1e-12));
      const index = y * state.columns + x;
      samples.push({ index, weight });
      weightedMass += state.nodeMassKg * weight * weight;
    }
  }

  const velocityScale = weightedMass > 0 ? Math.sqrt((2 * transferred) / weightedMass) : 0;
  for (const sample of samples) state.velocity[sample.index] += velocityScale * sample.weight;

  const overloadDamage = clamp((energy / Math.max(material.ballisticLimitJoules, 1e-6) - 1) * 0.45, 0, 1);
  if (overloadDamage > 0) {
    for (const sample of samples) {
      state.damage[sample.index] = Math.max(state.damage[sample.index], overloadDamage * sample.weight);
    }
  }

  const speedX = Math.max(1, signalSpeedX);
  const speedY = Math.max(1, signalSpeedY);
  const signalFloor = Math.max(0, detectionSignalJoules);
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.columns; x += 1) {
      const dx = (x - column) * state.spacingX;
      const dy = (y - row) * state.spacingY;
      const distance = Math.hypot(dx, dy);
      const signalEnergy = transferred / (1 + (distance / Math.max(radiusMeters, 1e-6)) ** 2);
      if (signalEnergy >= signalFloor) {
        state.arrivalTimeSeconds[y * state.columns + x] = state.elapsedSeconds + Math.hypot(dx / speedX, dy / speedY);
      }
    }
  }

  state.inputEnergyJoules = energy;
  state.transferredEnergyJoules = transferred;
  state.residualEnergyJoules = Math.max(0, energy - transferred);
  state.projectileVelocityMps = Math.sqrt((2 * energy) / mass);
  state.eventOrigin = [column, row];
  state.perforated = energy > material.ballisticLimitJoules * 1.25;
  state.eventSequence += 1;
}

export function renderDisplacement(displacementMeters: number, displayUnitsPerMeter: number): number {
  const linear = displacementMeters * displayUnitsPerMeter;
  const magnitude = Math.abs(linear);
  if (magnitude <= 4) return linear;
  return Math.sign(linear) * (4 + Math.log1p(magnitude - 4));
}

export type TextileToken = SomatotopicToken;
