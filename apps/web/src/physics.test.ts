import { describe, expect, it } from "vitest";
import {
  applyImpulse,
  createMembrane,
  membraneEnergy,
  resetMembrane,
  stepMembrane,
} from "./physics";

const parameters = { waveSpeed: 2.4, damping: 0.3, dt: 1 / 120, spacing: 0.12 };

describe("membrane solver", () => {
  it("requires a meaningful grid", () => {
    expect(() => createMembrane(2, 2)).toThrow();
    expect(createMembrane(8, 6).current).toHaveLength(48);
  });

  it("applies a bounded gaussian impulse and propagates it", () => {
    const state = createMembrane(15, 15);
    applyImpulse(state, 7, 7, 1, 0.5);
    const center = 7 * 15 + 7;
    expect(state.current[center]).toBeCloseTo(1);
    expect(state.current[0]).toBe(0);

    stepMembrane(state, parameters);
    expect(state.current[center - 1]).toBeGreaterThan(0);
    expect(state.current[0]).toBe(0);
  });

  it("stays finite under hostile parameters", () => {
    const state = createMembrane(20, 12);
    applyImpulse(state, 10, 6, 20);
    for (let index = 0; index < 500; index += 1) {
      stepMembrane(state, { waveSpeed: 1e9, damping: -10, dt: 1, spacing: 0 });
    }
    expect(Array.from(state.current).every(Number.isFinite)).toBe(true);
  });

  it("resets all state and reports energy", () => {
    const state = createMembrane(10, 10);
    applyImpulse(state, 5, 5, 2);
    expect(membraneEnergy(state)).toBeGreaterThan(0);
    resetMembrane(state);
    expect(membraneEnergy(state)).toBe(0);
  });
});

