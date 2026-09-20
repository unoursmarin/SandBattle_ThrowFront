import { beforeAll, describe, expect, it } from "vitest";

import { isOnGround } from "../../src/features/game/replay/groundContact";
import { buildReplayWorld } from "../../src/features/game/replay/replayWorld";
import { STICK_RADIUS } from "../../src/features/game/scene/sceneConstants";
import { PHYSICS_TIMESTEP, stickBeforeStep } from "../../src/features/game/scene/stickThrowSim";
import { initRapier, layout, RAPIER } from "./replayFixtures";

beforeAll(async () => {
  await initRapier();
});

/** A stick lying on the lane and rolling along the lane (its axis across it), without slipping. */
function rollingStick(speed: number) {
  const bodies = buildReplayWorld(RAPIER, layout, "stick", []);
  const stick = bodies.projectile;
  stick.setTranslation({ x: 0, y: STICK_RADIUS + 0.002, z: -0.5 }, true);
  stick.setLinvel({ x: 0, y: 0, z: -speed }, true);
  stick.setAngvel({ x: -speed / STICK_RADIUS, y: 0, z: 0 }, true);
  return bodies;
}

describe("isOnGround", () => {
  it("un bâton posé sur la piste touche le sol", () => {
    const { world, projectile } = rollingStick(0);
    for (let i = 0; i < 30; i++) world.step();
    expect(isOnGround(world, projectile)).toBe(true);
    world.free();
  });

  it("un bâton en l'air ne touche pas le sol", () => {
    const { world, projectile } = rollingStick(0);
    projectile.setTranslation({ x: 0, y: 1.5, z: -0.5 }, true);
    world.step();
    expect(isOnGround(world, projectile)).toBe(false);
    world.free();
  });
});

// Rapier has no rolling resistance: a stick rolling on the lane used to creep on for ever.
describe("bâton qui roule sur la piste", () => {
  function run(speed: number, seconds: number) {
    const { world, projectile } = rollingStick(speed);
    const speeds: number[] = [];
    for (let i = 0; i < seconds * 60; i++) {
      stickBeforeStep(projectile, "flying", isOnGround(world, projectile));
      world.step();
      const v = projectile.linvel();
      speeds.push(Math.hypot(v.x, v.y, v.z));
    }
    world.free();
    return speeds;
  }

  it.each([0.15, 0.4, 1])("lancé à %f m/s, il est à l'arrêt avant 3 s", (speed) => {
    const speeds = run(speed, 4);
    expect(speeds[speeds.length - 1]).toBeLessThan(0.005);
    // …and stays stopped.
    expect(Math.max(...speeds.slice(3 * 60))).toBeLessThan(0.02);
  });

  it("ralentit sans jamais accélérer", () => {
    const speeds = run(1, 3);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1] + 0.02);
  });

  it("le pas de temps du test est celui du jeu", () => {
    expect(PHYSICS_TIMESTEP).toBeCloseTo(1 / 60, 12);
  });
});
