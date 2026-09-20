import { beforeAll, describe, expect, it } from "vitest";

import { BallReplay } from "../../src/features/game/replay/ballReplay";
import { PHYSICS_TIMESTEP } from "../../src/features/game/scene/stickThrowSim";
import { initRapier, layout, mulberry32, nominalRack, randomBallLaunch, RAPIER, TEST_TIMEOUT_MS } from "./replayFixtures";

beforeAll(async () => {
  await initRapier();
});

const make = () => new BallReplay(RAPIER, layout, nominalRack(), randomBallLaunch(mulberry32(42)));

// A late frame must not stall on a burst of catch-up steps, and must not change what the throw does.
describe("ThrowReplay — cadence de lecture", () => {
  it("un appel n'avance jamais de plus de maxSteps pas, même très en retard sur l'horloge", () => {
    const replay = make();
    replay.advanceTo(5, 8);
    expect(replay.stepsDone).toBe(8);
    replay.advanceTo(5, 8);
    expect(replay.stepsDone).toBe(16);
    replay.dispose();
  });

  it("lagBehind mesure le retard sur l'horloge, et vaut 0 une fois rattrapé", () => {
    const replay = make();
    replay.advanceTo(1, 10);
    expect(replay.lagBehind(1)).toBeCloseTo(1 - 10 * PHYSICS_TIMESTEP, 9);
    replay.advanceTo(1);
    expect(replay.lagBehind(1)).toBeLessThan(PHYSICS_TIMESTEP);
    replay.dispose();
  });

  it(
    "jouer par petites tranches donne exactement le même lancer que d'un seul coup",
    () => {
      const chunked = make();
      const whole = make();
      // Frames of irregular length, each capped: the clock is far ahead of the steps done.
      for (let i = 0; i < 5000 && !chunked.finished; i++) chunked.advanceTo(60, 3 + (i % 7));
      whole.advanceTo(60);
      expect(chunked.stepsDone).toBe(whole.stepsDone);
      expect(chunked.pinPoses()).toEqual(whole.pinPoses());
      expect(chunked.projectilePose()).toEqual(whole.projectilePose());
      chunked.dispose();
      whole.dispose();
    },
    TEST_TIMEOUT_MS,
  );
});
