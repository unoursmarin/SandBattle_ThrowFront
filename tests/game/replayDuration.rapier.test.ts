import { beforeAll, describe, expect, it } from "vitest";

import { BallReplay } from "../../src/features/game/replay/ballReplay";
import { StickReplay } from "../../src/features/game/replay/stickReplay";
import { PHYSICS_TIMESTEP } from "../../src/features/game/scene/stickThrowSim";
import {
  initRapier,
  layout,
  mulberry32,
  nominalRack,
  playToEnd,
  randomBallLaunch,
  randomStickLaunch,
  RAPIER,
  TEST_TIMEOUT_MS,
} from "./replayFixtures";

beforeAll(async () => {
  await initRapier();
});

/** Nobody waits 22 s (the cap) for pins and a stick that keep rolling: a replay ends soon after the last impact. */
const MAX_REPLAY_SECONDS = 9;

describe("durée d'un rejeu", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])(
    "bâton, lancer n°%i : le rejeu se termine avant 9 s",
    (seed) => {
      const replay = new StickReplay(RAPIER, layout, nominalRack(), randomStickLaunch(mulberry32(seed)));
      playToEnd(replay);
      expect(replay.stepsDone * PHYSICS_TIMESTEP).toBeLessThan(MAX_REPLAY_SECONDS);
      replay.dispose();
    },
    TEST_TIMEOUT_MS,
  );

  it.each([0, 1, 2, 3, 4, 5])(
    "boule, lancer n°%i : le rejeu se termine avant 9 s",
    (seed) => {
      const replay = new BallReplay(RAPIER, layout, nominalRack(), randomBallLaunch(mulberry32(seed)));
      playToEnd(replay);
      expect(replay.stepsDone * PHYSICS_TIMESTEP).toBeLessThan(MAX_REPLAY_SECONDS);
      replay.dispose();
    },
    TEST_TIMEOUT_MS,
  );
});
