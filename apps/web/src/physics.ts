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

