import { describe, expect, it } from "vitest";
import {
  applyTextileImpact,
  createTextile,
  inferImpactProfile,
  renderDisplacement,
  TEXTILE_MATERIALS,
} from "./textileModel";
import { stepTextile, textileMechanicalEnergy } from "./textileSolver";

const material = TEXTILE_MATERIALS.aramid;

function runImpact(energyJoules: number): number {
  const state = createTextile(25, 17, 0.8, 0.5, material);
  applyTextileImpact(state, material, inferImpactProfile(energyJoules), 12, 8, 3_500, 3_000, 1e-8);
  for (let index = 0; index < 500; index += 1) {
    stepTextile(state, {
      material,
      boundary: "fixed",
      dt: 1e-5,
      dampingScale: 1,
      conversionEfficiency: 0.1,
      wakeThresholdJoules: 1e-6,
      detectionStrain: 1e-8,
    });
  }
  expect(Array.from(state.displacement).every(Number.isFinite)).toBe(true);
  expect(Array.from(state.velocity).every(Number.isFinite)).toBe(true);
  return state.peakDeflectionMeters;
}

describe("nonlinear textile impact model", () => {
  it("injects the transferred impact energy as textile kinetic energy", () => {
    const state = createTextile(25, 17, 0.8, 0.5, material);
    applyTextileImpact(state, material, inferImpactProfile(490), 12, 8, 3_500, 3_000, 1e-8);
    expect(textileMechanicalEnergy(state)).toBeCloseTo(state.transferredEnergyJoules, 4);
    expect(state.transferredEnergyJoules).toBeGreaterThan(0);
    expect(state.residualEnergyJoules + state.transferredEnergyJoules).toBeCloseTo(490, 6);
  });

  it("produces larger physical deflection for a higher-energy impact", () => {
    const low = runImpact(120);
    const ballistic = runImpact(490);
    expect(low).toBeGreaterThan(0);
    expect(ballistic).toBeGreaterThan(low * 1.25);
  });

  it("keeps metric rendering linear through ordinary ballistic deflections", () => {
    expect(renderDisplacement(0.02, 10)).toBeCloseTo(0.2);
    expect(renderDisplacement(0.08, 10)).toBeCloseTo(0.8);
    expect(renderDisplacement(0.08, 10)).toBeGreaterThan(renderDisplacement(0.02, 10));
  });

  it("marks gross overload as perforation while retaining finite state", () => {
    const state = createTextile(25, 17, 0.8, 0.5, material);
    applyTextileImpact(state, material, inferImpactProfile(3_500), 12, 8, 3_500, 3_000, 1e-8);
    expect(state.perforated).toBe(true);
    for (let index = 0; index < 100; index += 1) {
      stepTextile(state, {
        material,
        boundary: "fixed",
        dt: 1e-5,
        dampingScale: 1,
        conversionEfficiency: 0.1,
        wakeThresholdJoules: 1e-6,
        detectionStrain: 1e-8,
      });
    }
    expect(Array.from(state.displacement).every(Number.isFinite)).toBe(true);
  });
});
