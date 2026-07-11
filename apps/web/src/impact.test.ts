import { describe, expect, it } from "vitest";
import { applyNormalizedEnergyImpulse, formatEnergy, visualDisplacement } from "./impact";
import { createMembrane, membraneEnergy } from "./physics";

describe("impact energy utilities", () => {
  it("injects the requested kinetic energy independent of radius", () => {
    for (const radius of [0.8, 2.2, 4]) {
      const state = createMembrane(41, 31);
      applyNormalizedEnergyImpulse(state, 20, 15, 490, radius);
      expect(membraneEnergy(state)).toBeCloseTo(490, 3);
      expect(state.inputEnergyJoules).toBe(490);
    }
  });

  it("supports micro to megajoule display without changing physics", () => {
    expect(formatEnergy(0.000001)).toContain("µJ");
    expect(formatEnergy(490)).toBe("490 J");
    expect(formatEnergy(490_000)).toBe("490.00 kJ");
    expect(formatEnergy(1_000_000)).toBe("1.00 MJ");
  });

  it("keeps the visual deformation bounded across energy scales", () => {
    expect(Math.abs(visualDisplacement(1, 0.001))).toBeLessThanOrEqual(0.72);
    expect(Math.abs(visualDisplacement(1_000, 1_000_000))).toBeLessThanOrEqual(0.72);
  });
});
