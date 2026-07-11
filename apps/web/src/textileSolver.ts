import type { SomatotopicToken } from "./physics";
import type { LocalizationGeometry, TextileState, TextileStep } from "./textileModel";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function addSpring(
  state: TextileState,
  first: number,
  second: number,
  restLength: number,
  stiffnessNm: number,
  pretensionNm: number,
): number {
  const dz = state.displacement[second] - state.displacement[first];
  const length = Math.hypot(restLength, dz);
  const strain = Math.max(0, (length - restLength) / restLength);
  const damage = 0.5 * (state.damage[first] + state.damage[second]);
  const tension = (pretensionNm + stiffnessNm * strain) * (1 - damage);
  const vertical = length > 0 ? tension * dz / length : 0;
  state.force[first] += vertical;
  state.force[second] -= vertical;
  state.nodeStrain[first] = Math.max(state.nodeStrain[first], strain);
  state.nodeStrain[second] = Math.max(state.nodeStrain[second], strain);
  return 0.5 * stiffnessNm * strain * strain * restLength;
}

function applyBoundary(state: TextileState, boundary: TextileStep["boundary"]): void {
  const { columns, rows } = state;
  for (let x = 0; x < columns; x += 1) {
    const top = x;
    const bottom = (rows - 1) * columns + x;
    if (boundary === "fixed") {
      state.displacement[top] = 0; state.velocity[top] = 0;
      state.displacement[bottom] = 0; state.velocity[bottom] = 0;
    } else if (boundary === "absorbing") {
      state.velocity[top] *= 0.25; state.velocity[bottom] *= 0.25;
    }
  }
  for (let y = 0; y < rows; y += 1) {
    const left = y * columns;
    const right = left + columns - 1;
    if (boundary === "fixed") {
      state.displacement[left] = 0; state.velocity[left] = 0;
      state.displacement[right] = 0; state.velocity[right] = 0;
    } else if (boundary === "absorbing") {
      state.velocity[left] *= 0.25; state.velocity[right] *= 0.25;
    }
  }
}

export function stepTextile(state: TextileState, parameters: TextileStep): void {
  const { columns, rows, spacingX, spacingY } = state;
  const material = parameters.material;
  const dt = clamp(parameters.dt, 1e-7, 5e-4);
  const damping = Math.exp(-Math.max(0, material.dampingPerSecond * parameters.dampingScale) * dt);
  const diagonal = Math.hypot(spacingX, spacingY);
  state.force.fill(0);
  state.nodeStrain.fill(0);
  state.damageDelta.fill(0);

  let elasticEnergy = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const i = y * columns + x;
      if (x + 1 < columns) elasticEnergy += addSpring(state, i, i + 1, spacingX, material.tensileXNm, material.pretensionXNm);
      if (y + 1 < rows) elasticEnergy += addSpring(state, i, i + columns, spacingY, material.tensileYNm, material.pretensionYNm);
      if (x + 1 < columns && y + 1 < rows) elasticEnergy += addSpring(state, i, i + columns + 1, diagonal, material.shearNm, 0);
      if (x > 0 && y + 1 < rows) elasticEnergy += addSpring(state, i, i + columns - 1, diagonal, material.shearNm, 0);
    }
  }

  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < columns - 1; x += 1) {
      const i = y * columns + x;
      const laplacian =
        (state.displacement[i - 1] - 2 * state.displacement[i] + state.displacement[i + 1]) / (spacingX * spacingX) +
        (state.displacement[i - columns] - 2 * state.displacement[i] + state.displacement[i + columns]) / (spacingY * spacingY);
      state.force[i] += material.bendingNm * laplacian;
    }
  }

  let kineticBefore = 0;
  let kineticAfter = 0;
  let maximumStrain = 0;
  let peakDeflection = state.peakDeflectionMeters;
  const mass = Math.max(state.nodeMassKg, 1e-9);
  const velocityLimit = 2_000;
  for (let i = 0; i < state.displacement.length; i += 1) {
    kineticBefore += 0.5 * mass * state.velocity[i] * state.velocity[i];
    const acceleration = clamp(state.force[i] / mass, -5e7, 5e7);
    state.velocity[i] = clamp((state.velocity[i] + acceleration * dt) * damping, -velocityLimit, velocityLimit);
    state.displacement[i] += state.velocity[i] * dt;
    kineticAfter += 0.5 * mass * state.velocity[i] * state.velocity[i];

    const strain = state.nodeStrain[i];
    maximumStrain = Math.max(maximumStrain, strain);
    state.peakNodeStrain[i] = Math.max(state.peakNodeStrain[i], strain);
    peakDeflection = Math.max(peakDeflection, Math.abs(state.displacement[i]));
    if (strain > material.yieldStrain) {
      const span = Math.max(material.failureStrain - material.yieldStrain, 1e-6);
      const increment = material.damageRatePerSecond * dt * ((strain - material.yieldStrain) / span) ** 2;
      state.damageDelta[i] = increment;
      state.damage[i] = clamp(state.damage[i] + increment, 0, 1);
    }
    if (strain >= material.failureStrain || state.damage[i] >= 0.995) state.perforated = true;
  }

  applyBoundary(state, parameters.boundary);
  const dissipated = Math.max(0, kineticBefore - kineticAfter);
  state.dissipatedEnergyJoules += dissipated;
  const harvestLimit = Math.min(
    state.inputEnergyJoules * clamp(parameters.conversionEfficiency, 0, 1),
    material.harvestCapJoules,
  );
  const availableHarvest = Math.max(0, harvestLimit - state.storedEnergyJoules);
  const harvested = Math.min(availableHarvest, dissipated * clamp(parameters.conversionEfficiency, 0, 1));
  if (harvested > 0) {
    state.storedEnergyJoules += harvested;
    const share = harvested / state.harvestedJoules.length;
    for (let i = 0; i < state.harvestedJoules.length; i += 1) state.harvestedJoules[i] += share;
  }

  state.elapsedSeconds += dt;
  state.maximumStrain = Math.max(state.maximumStrain, maximumStrain);
  state.peakDeflectionMeters = peakDeflection;
  if (!state.awake && state.storedEnergyJoules >= Math.max(0, parameters.wakeThresholdJoules)) {
    state.awake = true;
    state.wakeTimeSeconds = state.elapsedSeconds;
  }

  if (!Number.isFinite(elasticEnergy)) throw new Error("non-finite textile state");
}

export function textileMechanicalEnergy(state: TextileState): number {
  let kinetic = 0;
  for (const velocity of state.velocity) kinetic += 0.5 * state.nodeMassKg * velocity * velocity;
  return kinetic;
}

export function totalTextileHarvestedEnergy(state: TextileState): number {
  return state.storedEnergyJoules;
}

export function buildTextileToken(
  state: TextileState,
  sensors: Array<[number, number]>,
  geometry: LocalizationGeometry,
): SomatotopicToken | null {
  const arrivals = sensors
    .map(([column, row], sensorIndex) => {
      const index = row * state.columns + column;
      return { sensorIndex, column, row, arrivalSeconds: state.arrivalTimeSeconds[index], amplitude: state.peakNodeStrain[index] };
    })
    .filter((item) => Number.isFinite(item.arrivalSeconds));
  if (!state.awake || arrivals.length < 3) return null;

  const observedMin = Math.min(...arrivals.map((item) => item.arrivalSeconds));
  const relative = arrivals.map((item) => item.arrivalSeconds - observedMin);
  let bestColumn = 0;
  let bestRow = 0;
  let bestError = Number.POSITIVE_INFINITY;
  for (let row = 0; row < state.rows; row += 1) {
    for (let column = 0; column < state.columns; column += 1) {
      const predicted = arrivals.map((sensor) => {
        const dx = (sensor.column - column) * state.spacingX / Math.max(geometry.signalSpeedX, 1);
        const dy = (sensor.row - row) * state.spacingY / Math.max(geometry.signalSpeedY, 1);
        return Math.hypot(dx, dy);
      });
      const minimum = Math.min(...predicted);
      let squaredError = 0;
      for (let i = 0; i < predicted.length; i += 1) {
        const residual = predicted[i] - minimum - relative[i];
        squaredError += residual * residual;
      }
      const error = Math.sqrt(squaredError / predicted.length);
      if (error < bestError) { bestError = error; bestColumn = column; bestRow = row; }
    }
  }

  const coverage = arrivals.length / sensors.length;
  const confidence = clamp(coverage * Math.exp(-bestError / 0.00015), 0, 1);
  return {
    eventId: `somato-${state.eventSequence}`,
    timestampSeconds: state.elapsedSeconds,
    eventClass: "impact",
    modality: "mechanical",
    bodyCoordinates: [bestColumn / (state.columns - 1), bestRow / (state.rows - 1)],
    localizedGridCoordinates: [bestColumn, bestRow],
    confidence,
    localizationRmseSeconds: bestError,
    impactEnergyJoules: state.inputEnergyJoules,
    harvestedEnergyJoules: state.storedEnergyJoules,
    wakeLatencySeconds: state.wakeTimeSeconds,
    sensorArrivals: arrivals.map(({ sensorIndex, arrivalSeconds, amplitude }) => ({ sensorIndex, arrivalSeconds, amplitude })),
  };
}
