import { beforeAll, describe, expect, it } from "vitest";
import { BallReplay } from "../../src/features/game/replay/ballReplay";
import { pinsFelled } from "../../src/features/game/replay/replayOutcome";
import { initRapier, layout, mulberry32, nominalRack, playToEnd, rackAfter, randomBallLaunch, RAPIER, TEST_TIMEOUT_MS, viaServer } from "./replayFixtures";

beforeAll(async () => {
  await initRapier();
});

function rackFor(seed: number, partial: boolean) {
  if (!partial) return nominalRack();
  const first = new BallReplay(RAPIER, layout, nominalRack(), randomBallLaunch(mulberry32(seed + 5000)));
  playToEnd(first);
  const rack = rackAfter(first.pinPoses());
  first.dispose();
  return rack;
}

function twoReplays(seed: number, partial: boolean) {
  const rack = rackFor(seed, partial);
  const launch = randomBallLaunch(mulberry32(seed));
  const a = new BallReplay(RAPIER, layout, rack, launch);
  const b = new BallReplay(RAPIER, layout, rack, launch);
  playToEnd(a);
  playToEnd(b);
  return { rack, launch, a, b };
}

describe("BallReplay — mêmes entrées, même lancer", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])(
    "lancer n°%i : poses finales de toutes les quilles et de la boule IDENTIQUES au bit près",
    (seed) => {
      const { a, b } = twoReplays(900 + seed, seed % 2 === 1);
      expect(b.pinPoses()).toEqual(a.pinPoses());
      expect(b.projectilePose()).toEqual(a.projectilePose());
      expect(b.stepsDone).toBe(a.stepsDone);
      a.dispose();
      b.dispose();
    },
    TEST_TIMEOUT_MS,
  );

  it.each([0, 1, 2, 3, 4, 5])(
    "lancer n°%i rejoué depuis les entrées passées par le serveur (JSON) : identique à celui du lanceur",
    (seed) => {
      const rack = rackFor(1100 + seed, seed % 2 === 1);
      const launch = randomBallLaunch(mulberry32(1100 + seed));
      const own = new BallReplay(RAPIER, layout, rack, launch);
      const observer = new BallReplay(RAPIER, layout, viaServer(rack), viaServer(launch));
      playToEnd(own);
      playToEnd(observer);
      expect(observer.pinPoses()).toEqual(own.pinPoses());
      expect(observer.projectilePose()).toEqual(own.projectilePose());
      own.dispose();
      observer.dispose();
    },
    TEST_TIMEOUT_MS,
  );

  it("ces lancers renversent bien des quilles (le test de concordance n'est pas vide)", () => {
    let hits = 0;
    for (let seed = 0; seed < 12; seed += 1) {
      const { rack, a } = twoReplays(900 + seed, seed % 2 === 1);
      const start = rack.map((p) => ({
        enabled: p.standing,
        position: [p.position.x, p.position.y, p.position.z] as [number, number, number],
        rotation: [p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w] as [number, number, number, number],
      }));
      if (pinsFelled(start, a.pinPoses(), layout) > 0) hits += 1;
      a.dispose();
    }
    expect(hits).toBeGreaterThanOrEqual(6);
  }, TEST_TIMEOUT_MS);

  it("la boule part bien vers les quilles dès les premiers pas", () => {
    const replay = new BallReplay(RAPIER, layout, nominalRack(), randomBallLaunch(mulberry32(31)));
    const startZ = replay.projectilePose().position[2];
    replay.advanceTo(0.5);
    expect(replay.projectilePose().position[2]).toBeLessThan(startZ - 1);
    replay.dispose();
  });

  it("le rejeu se termine tout seul, boule arrêtée", () => {
    const { a } = twoReplays(777, false);
    expect(a.finished).toBe(true);
    a.dispose();
  }, TEST_TIMEOUT_MS);

  it("le rejeu suit l'horloge, pas la cadence d'appel", () => {
    const launch = randomBallLaunch(mulberry32(4242));
    const burst = new BallReplay(RAPIER, layout, nominalRack(), launch);
    playToEnd(burst);
    const drip = new BallReplay(RAPIER, layout, nominalRack(), launch);
    for (let frame = 1; frame <= 6000; frame += 1) drip.advanceTo(frame / 60);
    expect(drip.stepsDone).toBe(burst.stepsDone);
    expect(drip.pinPoses()).toEqual(burst.pinPoses());
    burst.dispose();
    drip.dispose();
  }, TEST_TIMEOUT_MS);
});
