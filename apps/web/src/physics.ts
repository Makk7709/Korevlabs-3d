export type MembraneState = {
  columns: number;
  rows: number;
  current: Float32Array;
  previous: Float32Array;
  next: Float32Array;
};

export type MembraneStep = {
  waveSpeed: number;
  damping: number;
  dt: number;
  spacing: number;
};

export function createMembrane(columns: number, rows: number): MembraneState {
  if (columns < 3 || rows < 3) throw new Error("membrane requires at least a 3 × 3 grid");
  const size = columns * rows;
  return {
    columns,
    rows,
    current: new Float32Array(size),
    previous: new Float32Array(size),
    next: new Float32Array(size),
  };
}

export function resetMembrane(state: MembraneState): void {
  state.current.fill(0);
  state.previous.fill(0);
  state.next.fill(0);
}

export function applyImpulse(
  state: MembraneState,
  column: number,
  row: number,
  amplitude: number,
  radius = 2.2,
): void {
  const radiusSquared = Math.max(radius * radius, 1e-6);
  const minColumn = Math.max(1, Math.floor(column - radius * 3));
  const maxColumn = Math.min(state.columns - 2, Math.ceil(column + radius * 3));
  const minRow = Math.max(1, Math.floor(row - radius * 3));
  const maxRow = Math.min(state.rows - 2, Math.ceil(row + radius * 3));
  for (let y = minRow; y <= maxRow; y += 1) {
    for (let x = minColumn; x <= maxColumn; x += 1) {
      const distanceSquared = (x - column) ** 2 + (y - row) ** 2;
      state.current[y * state.columns + x] += amplitude * Math.exp(-distanceSquared / radiusSquared);
    }
  }
}

export function stepMembrane(state: MembraneState, parameters: MembraneStep): void {
  const { columns, rows, current, previous, next } = state;
  const courant = parameters.waveSpeed * parameters.dt / Math.max(parameters.spacing, 1e-6);
  const coefficient = Math.min(0.49, Math.max(0, courant * courant));
  const velocityRetention = Math.exp(-Math.max(0, parameters.damping) * parameters.dt);

  next.fill(0);
  for (let row = 1; row < rows - 1; row += 1) {
    const offset = row * columns;
    for (let column = 1; column < columns - 1; column += 1) {
      const index = offset + column;
      const laplacian =
        current[index - 1] + current[index + 1] +
        current[index - columns] + current[index + columns] -
        4 * current[index];
      next[index] =
        current[index] +
        (current[index] - previous[index]) * velocityRetention +
        coefficient * laplacian;
    }
  }

  state.previous = current;
  state.current = next;
  state.next = previous;
}

export function membraneEnergy(state: MembraneState): number {
  let energy = 0;
  for (let index = 0; index < state.current.length; index += 1) {
    const velocity = state.current[index] - state.previous[index];
    energy += velocity * velocity + state.current[index] * state.current[index];
  }
  return energy;
}

