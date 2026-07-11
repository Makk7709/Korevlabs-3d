export type BoundaryMode = "fixed" | "reflective" | "absorbing";

export type SomatosensoryState = {
  columns: number;
  rows: number;
  displacement: Float32Array;
  velocity: Float32Array;
  nextDisplacement: Float32Array;
  nextVelocity: Float32Array;
  harvestedJoules: Float32Array;
  arrivalTimeSeconds: Float32Array;
  elapsedSeconds: number;
  awake: boolean;
  wakeTimeSeconds: number | null;
  eventSequence: number;
};

export type SomatosensoryStep = {
  waveSpeedX: number;
  waveSpeedY: number;
  damping: number;
  dt: number;
  spacingX: number;
  spacingY: number;
  boundary: BoundaryMode;
  conversionEfficiency: number;
  wakeThresholdJoules: number;
  detectionThreshold: number;
};

export type SomatotopicToken = {
  eventId: string;
  timestampSeconds: number;
  bodyCoordinates: [number, number];
  localizedGridCoordinates: [number, number];
  confidence: number;
  localizationRmseSeconds: number;
  harvestedEnergyJoules: number;
  wakeLatencySeconds: number | null;
  sensorArrivals: Array<{ sensorIndex: number; arrivalSeconds: number; amplitude: number }>;
};

export type LocalizationGeometry = {
  spacingX: number;
  spacingY: number;
  waveSpeedX: number;
  waveSpeedY: number;
};

export function createMembrane(columns: number, rows: number): SomatosensoryState {
  if (columns < 3 || rows < 3) throw new Error("membrane requires at least a 3 × 3 grid");
  const size = columns * rows;
  const arrivals = new Float32Array(size);
  arrivals.fill(Number.POSITIVE_INFINITY);
  return {
    columns,
    rows,
    displacement: new Float32Array(size),
    velocity: new Float32Array(size),
    nextDisplacement: new Float32Array(size),
    nextVelocity: new Float32Array(size),
    harvestedJoules: new Float32Array(size),
    arrivalTimeSeconds: arrivals,
    elapsedSeconds: 0,
    awake: false,
    wakeTimeSeconds: null,
    eventSequence: 0,
  };
}

export function resetMembrane(state: SomatosensoryState): void {
  state.displacement.fill(0);
  state.velocity.fill(0);
  state.nextDisplacement.fill(0);
  state.nextVelocity.fill(0);
  state.harvestedJoules.fill(0);
  state.arrivalTimeSeconds.fill(Number.POSITIVE_INFINITY);
  state.elapsedSeconds = 0;
  state.awake = false;
  state.wakeTimeSeconds = null;
}

export function applyImpulse(
  state: SomatosensoryState,
  column: number,
  row: number,
  impactEnergyJoules: number,
  radius = 2.2,
): void {
  const safeEnergy = Math.max(0, impactEnergyJoules);
  const amplitude = Math.sqrt(safeEnergy);
  const radiusSquared = Math.max(radius * radius, 1e-6);
  const minColumn = Math.max(1, Math.floor(column - radius * 3));
  const maxColumn = Math.min(state.columns - 2, Math.ceil(column + radius * 3));
  const minRow = Math.max(1, Math.floor(row - radius * 3));
  const maxRow = Math.min(state.rows - 2, Math.ceil(row + radius * 3));
  for (let y = minRow; y <= maxRow; y += 1) {
    for (let x = minColumn; x <= maxColumn; x += 1) {
      const distanceSquared = (x - column) ** 2 + (y - row) ** 2;
      const weight = Math.exp(-distanceSquared / radiusSquared);
      state.velocity[y * state.columns + x] += amplitude * weight;
    }
  }
  state.eventSequence += 1;
}

function applyBoundary(state: SomatosensoryState, mode: BoundaryMode): void {
  const { columns, rows, nextDisplacement, nextVelocity } = state;
  const dampEdge = mode === "absorbing" ? 0.15 : 1;
  for (let column = 0; column < columns; column += 1) {
    const top = column;
    const bottom = (rows - 1) * columns + column;
    if (mode === "fixed") {
      nextDisplacement[top] = 0; nextVelocity[top] = 0;
      nextDisplacement[bottom] = 0; nextVelocity[bottom] = 0;
    } else {
      nextDisplacement[top] = nextDisplacement[columns + column];
      nextVelocity[top] = nextVelocity[columns + column] * dampEdge;
      nextDisplacement[bottom] = nextDisplacement[(rows - 2) * columns + column];
      nextVelocity[bottom] = nextVelocity[(rows - 2) * columns + column] * dampEdge;
    }
  }
  for (let row = 0; row < rows; row += 1) {
    const left = row * columns;
    const right = left + columns - 1;
    if (mode === "fixed") {
      nextDisplacement[left] = 0; nextVelocity[left] = 0;
      nextDisplacement[right] = 0; nextVelocity[right] = 0;
    } else {
      nextDisplacement[left] = nextDisplacement[left + 1];
      nextVelocity[left] = nextVelocity[left + 1] * dampEdge;
      nextDisplacement[right] = nextDisplacement[right - 1];
      nextVelocity[right] = nextVelocity[right - 1] * dampEdge;
    }
  }
}

export function stepMembrane(state: SomatosensoryState, parameters: SomatosensoryStep): void {
  const { columns, rows, displacement, velocity, nextDisplacement, nextVelocity } = state;
  const dx = Math.max(parameters.spacingX, 1e-6);
  const dy = Math.max(parameters.spacingY, 1e-6);
  const dt = Math.max(parameters.dt, 1e-6);
  const cx = Math.max(0, parameters.waveSpeedX);
  const cy = Math.max(0, parameters.waveSpeedY);
  let coeffX = (cx * dt / dx) ** 2;
  let coeffY = (cy * dt / dy) ** 2;
  const cflSum = coeffX + coeffY;
  if (cflSum > 0.49) {
    const stabilityScale = 0.49 / cflSum;
    coeffX *= stabilityScale;
    coeffY *= stabilityScale;
  }
  const damping = Math.exp(-Math.max(0, parameters.damping) * dt);
  const efficiency = Math.min(1, Math.max(0, parameters.conversionEfficiency));

  nextDisplacement.fill(0);
  nextVelocity.fill(0);
  for (let row = 1; row < rows - 1; row += 1) {
    const offset = row * columns;
    for (let column = 1; column < columns - 1; column += 1) {
      const index = offset + column;
      const laplacianX = displacement[index - 1] - 2 * displacement[index] + displacement[index + 1];
      const laplacianY = displacement[index - columns] - 2 * displacement[index] + displacement[index + columns];
      const acceleration = (coeffX * laplacianX + coeffY * laplacianY) / (dt * dt);
      const nextV = (velocity[index] + acceleration * dt) * damping;
      const nextU = displacement[index] + nextV * dt;
      nextVelocity[index] = Number.isFinite(nextV) ? nextV : 0;
      nextDisplacement[index] = Number.isFinite(nextU) ? nextU : 0;

      const localMechanicalEnergy = 0.5 * nextV * nextV + 0.5 * (Math.abs(laplacianX) + Math.abs(laplacianY));
      state.harvestedJoules[index] += localMechanicalEnergy * efficiency * dt;
      if (state.arrivalTimeSeconds[index] === Number.POSITIVE_INFINITY && Math.abs(nextU) >= parameters.detectionThreshold) {
        state.arrivalTimeSeconds[index] = state.elapsedSeconds + dt;
      }
    }
  }
  applyBoundary(state, parameters.boundary);

  state.displacement = nextDisplacement;
  state.velocity = nextVelocity;
  state.nextDisplacement = displacement;
  state.nextVelocity = velocity;
  state.elapsedSeconds += dt;

  if (!state.awake && totalHarvestedEnergy(state) >= Math.max(0, parameters.wakeThresholdJoules)) {
    state.awake = true;
    state.wakeTimeSeconds = state.elapsedSeconds;
  }
}

export function totalHarvestedEnergy(state: SomatosensoryState): number {
  let energy = 0;
  for (const value of state.harvestedJoules) energy += value;
  return energy;
}

export function membraneEnergy(state: SomatosensoryState): number {
  let energy = 0;
  for (let index = 0; index < state.displacement.length; index += 1) {
    const u = state.displacement[index];
    const v = state.velocity[index];
    energy += 0.5 * v * v + 0.5 * u * u;
  }
  return energy;
}

export function buildSomatotopicToken(
  state: SomatosensoryState,
  sensors: Array<[number, number]>,
  geometry: LocalizationGeometry,
): SomatotopicToken | null {
  const arrivals = sensors
    .map(([column, row], sensorIndex) => {
      const index = row * state.columns + column;
      return { sensorIndex, column, row, arrivalSeconds: state.arrivalTimeSeconds[index], amplitude: Math.abs(state.displacement[index]) };
    })
    .filter((item) => Number.isFinite(item.arrivalSeconds));
  if (!state.awake || arrivals.length < 3) return null;

  const observedMin = Math.min(...arrivals.map((item) => item.arrivalSeconds));
  const observedRelative = arrivals.map((item) => item.arrivalSeconds - observedMin);
  const speedX = Math.max(geometry.waveSpeedX, 1e-6);
  const speedY = Math.max(geometry.waveSpeedY, 1e-6);
  let bestColumn = 0;
  let bestRow = 0;
  let bestError = Number.POSITIVE_INFINITY;

  for (let row = 0; row < state.rows; row += 1) {
    for (let column = 0; column < state.columns; column += 1) {
      const predicted = arrivals.map((sensor) => {
        const dx = (sensor.column - column) * geometry.spacingX;
        const dy = (sensor.row - row) * geometry.spacingY;
        return Math.sqrt((dx / speedX) ** 2 + (dy / speedY) ** 2);
      });
      const predictedMin = Math.min(...predicted);
      let squaredError = 0;
      for (let index = 0; index < predicted.length; index += 1) {
        const residual = (predicted[index] - predictedMin) - observedRelative[index];
        squaredError += residual * residual;
      }
      const rmse = Math.sqrt(squaredError / predicted.length);
      if (rmse < bestError) {
        bestError = rmse;
        bestColumn = column;
        bestRow = row;
      }
    }
  }

  const sensorCoverage = arrivals.length / sensors.length;
  const confidence = Math.max(0, Math.min(1, sensorCoverage * Math.exp(-bestError / 0.003)));
  return {
    eventId: `somato-${state.eventSequence}`,
    timestampSeconds: state.elapsedSeconds,
    bodyCoordinates: [bestColumn / (state.columns - 1), bestRow / (state.rows - 1)],
    localizedGridCoordinates: [bestColumn, bestRow],
    confidence,
    localizationRmseSeconds: bestError,
    harvestedEnergyJoules: totalHarvestedEnergy(state),
    wakeLatencySeconds: state.wakeTimeSeconds,
    sensorArrivals: arrivals.map(({ sensorIndex, arrivalSeconds, amplitude }) => ({ sensorIndex, arrivalSeconds, amplitude })),
  };
}
