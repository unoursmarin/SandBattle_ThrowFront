import { describe, expect, it } from "vitest";
import { decelerateSpeed } from "../../src/features/game/scene/ballRollLogic";

describe("decelerateSpeed", () => {
  it("ne change rien tant que la boule n'a pas atteint la zone d'arrêt", () => {
    // The speed should not change before entering the stopping zone.
    expect(decelerateSpeed(0.8, false, 8, 1)).toBe(0.8);
  });

  it("décélère à taux constant une fois dans la zone d'arrêt", () => {
    expect(decelerateSpeed(4, true, 8, 0.1)).toBeCloseTo(3.2, 5);
  });

  it("ne descend jamais sous zéro", () => {
    expect(decelerateSpeed(0.3, true, 8, 1)).toBe(0);
  });

  it("une vitesse déjà nulle reste nulle", () => {
    expect(decelerateSpeed(0, true, 8, 1)).toBe(0);
  });
});
