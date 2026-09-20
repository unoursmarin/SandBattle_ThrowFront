import { describe, expect, it } from "vitest";
import { computeStickMassProperties } from "../../src/features/game/scene/stickMassProperties";

const ROD = { rodMass: 0.27, tipMass: 0.03, tipOffset: 0.28, length: 0.6, radius: 0.035 };

describe("computeStickMassProperties", () => {
  it("sans masse ferrée : tige homogène (centre de masse au centre, I = m·L²/12 + m·r²/4)", () => {
    const p = computeStickMassProperties({ ...ROD, tipMass: 0 });
    expect(p.mass).toBeCloseTo(0.27, 9);
    expect(p.comX).toBeCloseTo(0, 9);
    expect(p.axialInertia).toBeCloseTo(0.5 * 0.27 * 0.035 ** 2, 9);
    expect(p.transverseInertia).toBeCloseTo(0.27 * (0.36 / 12 + 0.035 ** 2 / 4), 9);
  });

  it("la masse ferrée avance le centre de masse vers la pointe : x = m_t·a / m", () => {
    const p = computeStickMassProperties(ROD);
    expect(p.mass).toBeCloseTo(0.3, 9);
    expect(p.comX).toBeCloseTo((0.03 * 0.28) / 0.3, 9);
  });

  it("la masse ferrée, sur l'axe, ne change pas l'inertie longitudinale ; elle augmente la transverse", () => {
    const bare = computeStickMassProperties({ ...ROD, tipMass: 0 });
    const shod = computeStickMassProperties(ROD);
    expect(shod.axialInertia).toBeCloseTo(bare.axialInertia, 12);
    expect(shod.transverseInertia).toBeGreaterThan(bare.transverseInertia);
  });

  it("tourner autour de l'axe demande ≥ 20× moins d'énergie que basculer bout sur bout", () => {
    const p = computeStickMassProperties(ROD);
    expect(p.transverseInertia / p.axialInertia).toBeGreaterThan(20);
  });
});
