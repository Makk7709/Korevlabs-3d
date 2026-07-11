import { describe, expect, it } from "vitest";
import {
  applyImpulse,
  buildSomatotopicToken,
  createMembrane,
  membraneEnergy,
  resetMembrane,
  stepMembrane,
  totalHarvestedEnergy,
} from "./physics";

const parameters = {
  waveSpeedX: 18,
  waveSpeedY: 12,
  damping: 1.5,
  dt: 1 / 1000,
  spacingX: 0.02,
  spacingY: 0.02,
  boundary: "reflective" as const,
  conversionEfficiency: 0.2,
  wakeThresholdJoules: 1e-7,
  detectionThreshold: 1e-6,
};

describe("causal somatosensory solver", () => {
  it("requires a meaningful grid", () => {
    expect(() => createMembrane(2, 2)).toThrow();
    expect(createMembrane(8, 6).displacement).toHaveLength(48);
  });

  it("converts an energy-bounded impact into propagation and harvested energy", () => {
    const state = createMembrane(15, 15);
    applyImpulse(state, 7, 7, 0.02, 0.8);
    expect(state.velocity[7 * 15 + 7]).toBeGreaterThan(0);
    for (let index = 0; index < 20; index += 1) stepMembrane(state, parameters);
    expect(membraneEnergy(state)).toBeGreaterThan(0);
    expect(totalHarvestedEnergy(state)).toBeGreaterThan(0);
    expect(state.awake).toBe(true);
  });

  it("produces a normalized somatotopic token after distributed arrivals", () => {
    const state = createMembrane(21, 21);
    const sensors: Array<[number, number]> = [[4, 4], [16, 4], [4, 16], [16, 16], [10, 10]];
    applyImpulse(state, 8, 12, 0.05, 0.7);
    for (let index = 0; index < 120; index += 1) stepMembrane(state, parameters);
    const token = buildSomatotopicToken(state, sensors);
    expect(token).not.toBeNull();
    expect(token?.bodyCoordinates[0]).toBeGreaterThanOrEqual(0);
    expect(token?.bodyCoordinates[0]).toBeLessThanOrEqual(1);
    expect(token?.bodyCoordinates[1]).toBeGreaterThanOrEqual(0);
    expect(token?.bodyCoordinates[1]).toBeLessThanOrEqual(1);
    expect(token?.sensorArrivals.length).toBeGreaterThanOrEqual(3);
  });

  it("stays finite under hostile parameters", () => {
    const state = createMembrane(20, 12);
    applyImpulse(state, 10, 6, 20);
    for (let index = 0; index < 500; index += 1) {
      stepMembrane(state, {
        ...parameters,
        waveSpeedX: 1e9,
        waveSpeedY: 1e9,
        damping: -10,
        dt: 1,
        spacingX: 0,
        spacingY: 0,
      });
    }
    expect(Array.from(state.displacement).every(Number.isFinite)).toBe(true);
    expect(Array.from(state.velocity).every(Number.isFinite)).toBe(true);
  });

  it("resets displacement, energy, arrivals and wake state", () => {
    const state = createMembrane(10, 10);
    applyImpulse(state, 5, 5, 0.02);
    for (let index = 0; index < 10; index += 1) stepMembrane(state, parameters);
    resetMembrane(state);
    expect(membraneEnergy(state)).toBe(0);
    expect(totalHarvestedEnergy(state)).toBe(0);
    expect(state.awake).toBe(false);
    expect(Array.from(state.arrivalTimeSeconds).every((value) => value === Number.POSITIVE_INFINITY)).toBe(true);
  });
});
