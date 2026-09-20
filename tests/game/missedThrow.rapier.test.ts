import { beforeAll, describe, expect, it } from "vitest";

import { BallReplay } from "../../src/features/game/replay/ballReplay";
import { pinsFelled } from "../../src/features/game/replay/replayOutcome";
import { StickReplay } from "../../src/features/game/replay/stickReplay";
import type { PinPose } from "../../src/lib/api/schemas";
import {
  initRapier,
  layout,
  mulberry32,
  nominalRack,
  playToEnd,
  rackAfter,
  randomBallLaunch,
  randomStickLaunch,
  RAPIER,
  TEST_TIMEOUT_MS,
} from "./replayFixtures";

beforeAll(async () => {
  await initRapier();
});

// A stick thrown far to one side: it never comes near the rack.
function wideStick(seed: number) {
  const launch = randomStickLaunch(mulberry32(seed));
  return { ...launch, velocity: [(seed % 2 ? 1 : -1) * 4.5, launch.velocity[1], -3] as [number, number, number] };
}

function wideBall(seed: number) {
  const launch = randomBallLaunch(mulberry32(seed));
  const side = seed % 2 ? 1 : -1;
  return { origin: [side * 0.35, launch.origin[1], launch.origin[2]] as [number, number, number], velocity: [side * 1.6, 0, -6] as [number, number, number] };
}

// The rack after a real first roll of a frame (partial: some pins fell, the others came to rest wherever).
function racksAfterFirstRoll(seeds: readonly number[]): PinPose[][] {
  return seeds.flatMap((seed) => {
    const first = new StickReplay(RAPIER, layout, nominalRack(), randomStickLaunch(mulberry32(200 + seed)));
    playToEnd(first);
    const rack = rackAfter(first.pinPoses());
    first.dispose();
    const standing = rack.filter((p) => p.standing).length;
    return standing > 0 && standing < 15 ? [rack] : [];
  });
}

const start = (rack: readonly PinPose[]) =>
  rack.map((p) => ({
    enabled: p.standing,
    position: [p.position.x, p.position.y, p.position.z] as [number, number, number],
    rotation: [p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w] as [number, number, number, number],
  }));

// A throw that misses must never cost a pin, whatever state the rack is in.
describe("un lancer qui passe à côté ne fait jamais tomber de quille", () => {
  // First rolls of a frame that leave a partial rack (checked by the length assertion below).
  const SEEDS = [0, 1, 2, 4, 5, 7];

  it(
    "bâton, râtelier partiel",
    () => {
      const racks = racksAfterFirstRoll(SEEDS);
      expect(racks).toHaveLength(SEEDS.length);
      racks.forEach((rack, i) => {
        const replay = new StickReplay(RAPIER, layout, rack, wideStick(i));
        playToEnd(replay);
        expect(pinsFelled(start(rack), replay.pinPoses(), layout)).toBe(0);
        replay.dispose();
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "boule, râtelier partiel",
    () => {
      racksAfterFirstRoll(SEEDS).forEach((rack, i) => {
        const replay = new BallReplay(RAPIER, layout, rack, wideBall(i));
        playToEnd(replay);
        expect(pinsFelled(start(rack), replay.pinPoses(), layout)).toBe(0);
        replay.dispose();
      });
    },
    TEST_TIMEOUT_MS,
  );
});
