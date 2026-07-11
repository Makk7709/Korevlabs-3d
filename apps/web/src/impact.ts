import type { SomatosensoryState } from "./physics";

export function applyNormalizedEnergyImpulse(
  state: SomatosensoryState,
  column: number,
  row: number,
  impactEnergyJoules: number,
  radius = 2.2,
): void {
  const safeEnergy = Math.max(0, Number.isFinite(impactEnergyJoules) ? impactEnergyJoules : 0);
  const radiusSquared = Math.max(radius * radius, 1e-6);
  const minColumn = Math.max(1, Math.floor(column - radius * 3));
  const maxColumn = Math.min(state.columns - 2, Math.ceil(column + radius * 3));
  const minRow = Math.max(1, Math.floor(row - radius * 3));
  const maxRow = Math.min(state.rows - 2, Math.ceil(row + radius * 3));

  const samples: Array<{ index: number; weight: number }> = [];
  let squaredWeightSum = 0;
  for (let y = minRow; y <= maxRow; y += 1) {
    for (let x = minColumn; x <= maxColumn; x += 1) {
      const distanceSquared = (x - column) ** 2 + (y - row) ** 2;
      const weight = Math.exp(-distanceSquared / radiusSquared);
      samples.push({ index: y * state.columns + x, weight });
      squaredWeightSum += weight * weight;
    }
  }

  const velocityScale = squaredWeightSum > 0 ? Math.sqrt((2 * safeEnergy) / squaredWeightSum) : 0;
  for (const sample of samples) state.velocity[sample.index] += velocityScale * sample.weight;

  state.inputEnergyJoules = safeEnergy;
  state.eventOrigin = [column, row];
  state.eventSequence += 1;
}

export function visualDisplacement(displacement: number, impactEnergyJoules: number): number {
  const referenceVelocity = Math.sqrt(Math.max(impactEnergyJoules, 1e-12));
  const normalized = displacement / Math.max(referenceVelocity * 0.012, 1e-9);
  return Math.tanh(normalized) * 0.72;
}

export function formatEnergy(joules: number): string {
  const value = Math.max(0, joules);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MJ`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} kJ`;
  if (value >= 1) return `${value.toFixed(value >= 100 ? 0 : 2)} J`;
  if (value >= 0.001) return `${(value * 1_000).toFixed(2)} mJ`;
  return `${(value * 1_000_000).toFixed(2)} µJ`;
}
