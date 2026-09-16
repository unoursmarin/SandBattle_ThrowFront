import { describe, expect, it } from "vitest";
import { LANE_LAYOUTS } from "../../src/features/game/scene/laneSizes";
import { STICK_RADIUS } from "../../src/features/game/scene/sceneConstants";
import {
  clampToSphere,
  computeImpulseSpin,
  integrateBallisticStep,
  solveAerialVelocity,
  stickGroundY,
} from "../../src/features/game/scene/stickThrowLogic";

describe("solveAerialVelocity", () => {
  it("zéro sans vitesse ni distance (geste annulé, lâcher vers l'arrière)", () => {
    expect(solveAerialVelocity(1, 4.2, 0, 0.15, 9.81, -2, 7.5)).toBe(0);
    expect(solveAerialVelocity(1, 0, 7, 0.15, 9.81, -2, 7.5)).toBe(0);
    expect(solveAerialVelocity(1, -1, 7, 0.15, 9.81, -2, 7.5)).toBe(0);
  });

  it("traverse exactement le point visé (petite piste, lancer franc)", () => {
    const releaseY = 1.0;
    const distance = 4.2;
    const hSpeed = 7;
    const vy = solveAerialVelocity(releaseY, distance, hSpeed, 0.15, 9.81, -2, 7.5);
    const flightTime = distance / hSpeed;
    const heightAtRack = releaseY + vy * flightTime - 0.5 * 9.81 * flightTime * flightTime;
    expect(heightAtRack).toBeCloseTo(0.15, 5);
  });

  it("un lancer franc part tendu, un lancer doux part en cloche", () => {
    const flat = solveAerialVelocity(1.0, 4.2, 12, 0.15, 9.81, -2, 7.5);
    const lobbed = solveAerialVelocity(1.0, 4.2, 5, 0.15, 9.81, -2, 7.5);
    expect(flat).toBeLessThan(lobbed);
    expect(flat).toBeLessThanOrEqual(0.5);
  });

  it("plafonne les gestes trop mous pour porter (retombée honnête avant les quilles)", () => {
    const vy = solveAerialVelocity(1.0, 9.4, 3, 0.15, 9.81, -2, 7.5);
    expect(vy).toBe(7.5);
    // Portée réelle avec le plafond : en deçà du râtelier (9,4 m).
    const flightTime = (vy + Math.sqrt(vy * vy + 2 * 9.81 * (1.0 - 0.035))) / 9.81;
    expect(flightTime * 3).toBeLessThan(9.4);
  });
});

describe("stickGroundY", () => {
  it("sur la piste : couché au sol (rayon), pas à hauteur de lancer", () => {
    for (const size of ["small", "medium", "large"] as const) {
      const layout = LANE_LAYOUTS[size];
      expect(stickGroundY(layout, 0)).toBe(STICK_RADIUS);
      expect(stickGroundY(layout, layout.laneHalfWidth + 0.1)).toBeLessThan(0.1);
    }
  });
});

describe("clampToSphere", () => {
  it("laisse passer les points intérieurs intacts", () => {
    expect(clampToSphere([0, 0.6, 2.6], [0.1, 0.7, 2.5], 0.4)).toEqual([0.1, 0.7, 2.5]);
  });

  it("replaque sur la sphère en conservant la direction (x/y/z libres)", () => {
    const [x, y, z] = clampToSphere([0, 0.6, 2.6], [0, 1.6, 2.6], 0.4);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(1.0, 5);
    expect(z).toBeCloseTo(2.6, 5);
  });
});

describe("computeImpulseSpin", () => {
  it("saisie au centre → vol stable, aucune vrille", () => {
    const spin = computeImpulseSpin([0, 0, 0], [0, 2, -7], 0.6, 12);
    expect(spin.axis).toBeNull();
    expect(spin.angularSpeed).toBe(0);
  });

  it("saisie au bout + lancer franc → vrille avant plafonnée", () => {
    const spin = computeImpulseSpin([0.3, 0, 0], [0, 0, -7], 0.6, 12);
    expect(spin.axis).not.toBeNull();
    expect(spin.angularSpeed).toBe(12);
  });

  it("formule exacte sous le plafond : ω = 12·|r×v|/L²", () => {
    const spin = computeImpulseSpin([0.05, 0, 0], [0, 0, -4], 0.6, 100);
    expect(spin.angularSpeed).toBeCloseTo((12 * 0.05 * 4) / 0.36, 5);
  });

  it("zéro sans vitesse ni longueur (jamais de division par zéro)", () => {
    expect(computeImpulseSpin([0.3, 0, 0], [0, 0, 0], 0.6, 12).angularSpeed).toBe(0);
    expect(computeImpulseSpin([0.3, 0, 0], [0, 0, -7], 0, 12).angularSpeed).toBe(0);
  });
});

describe("integrateBallisticStep", () => {
  it("un bâton déjà posé reste posé", () => {
    expect(integrateBallisticStep({ y: 0.04, vy: 0, landed: true }, 0.04, 9.81, 1 / 60)).toEqual({
      y: 0.04,
      vy: 0,
      landed: true,
    });
  });

  it("monte puis redescend et se pose sans rebond", () => {
    const floorY = 0.04;
    let state = { y: floorY, vy: 2.45, landed: false };
    let apex = floorY;
    let steps = 0;
    while (!state.landed && steps < 600) {
      state = integrateBallisticStep(state, floorY, 9.81, 1 / 60);
      apex = Math.max(apex, state.y);
      steps += 1;
    }
    expect(state.landed).toBe(true);
    expect(state.y).toBe(floorY);
    expect(state.vy).toBe(0);

    expect(apex).toBeGreaterThan(floorY + 0.2);
    expect(apex).toBeLessThan(floorY + 0.45);
  });

  it("atterrit à hauteur de gouttière au-dessus d'un chenal", () => {
    const gutterFloorY = -0.025;
    let state = { y: 0.0, vy: -1, landed: false };
    let steps = 0;
    while (!state.landed && steps < 60) {
      state = integrateBallisticStep(state, gutterFloorY, 9.81, 1 / 60);
      steps += 1;
    }
    expect(state.landed).toBe(true);
    expect(state.y).toBe(gutterFloorY);
  });
});
