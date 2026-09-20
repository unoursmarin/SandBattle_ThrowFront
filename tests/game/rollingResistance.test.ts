import { describe, expect, it } from "vitest";

import { applyRollingResistance, type RollingBody } from "../../src/features/game/scene/rollingResistance";

type Vec = { x: number; y: number; z: number };
function fakeBody(lin: Vec, ang: Vec) {
  const state = { lin: { ...lin }, ang: { ...ang } };
  const body: RollingBody = {
    linvel: () => ({ ...state.lin }),
    angvel: () => ({ ...state.ang }),
    setLinvel: (v) => void (state.lin = { ...v }),
    setAngvel: (v) => void (state.ang = { ...v }),
  };
  return { body, state };
}
const DT = 1 / 60;

describe("applyRollingResistance", () => {
  it("ralentit la vitesse horizontale d'exactement decel·dt", () => {
    const { body, state } = fakeBody({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 });
    applyRollingResistance(body, 0.6, 0.035, DT);
    expect(state.lin.z).toBeCloseTo(-1 + 0.6 * DT, 12);
  });

  it("garde la direction de déplacement et ne touche pas à la composante verticale", () => {
    const { body, state } = fakeBody({ x: 0.3, y: -0.2, z: -0.4 }, { x: 0, y: 0, z: 0 });
    applyRollingResistance(body, 0.6, 0.035, DT);
    expect(state.lin.y).toBe(-0.2);
    expect(state.lin.x / state.lin.z).toBeCloseTo(0.3 / -0.4, 9);
    expect(Math.hypot(state.lin.x, state.lin.z)).toBeCloseTo(0.5 - 0.6 * DT, 9);
  });

  it("s'arrête net à zéro, sans jamais inverser le mouvement", () => {
    const { body, state } = fakeBody({ x: 0, y: 0, z: -0.004 }, { x: 0, y: 0, z: 0 });
    applyRollingResistance(body, 0.6, 0.035, DT);
    expect(state.lin.z).toBeCloseTo(0, 12);
    expect(Object.is(state.lin.z, -0) || state.lin.z === 0).toBe(true);
    applyRollingResistance(body, 0.6, 0.035, DT);
    expect(state.lin.z).toBeCloseTo(0, 12);
  });

  it("freine la rotation de decel/rayon·dt (cohérent avec un roulement sans glissement)", () => {
    const { body, state } = fakeBody({ x: 0, y: 0, z: 0 }, { x: -20, y: 0, z: 0 });
    applyRollingResistance(body, 0.6, 0.035, DT);
    expect(state.ang.x).toBeCloseTo(-20 + (0.6 / 0.035) * DT, 9);
  });

  it("ne fait rien sur un corps déjà immobile", () => {
    const { body, state } = fakeBody({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    applyRollingResistance(body, 0.6, 0.035, DT);
    expect(state).toEqual({ lin: { x: 0, y: 0, z: 0 }, ang: { x: 0, y: 0, z: 0 } });
  });
});
