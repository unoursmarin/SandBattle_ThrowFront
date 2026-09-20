import { beforeAll, describe, expect, it } from "vitest";

import { StickReplay } from "../../src/features/game/replay/stickReplay";
import { pinsFelled } from "../../src/features/game/replay/replayOutcome";
import { initRapier, layout, mulberry32, nominalRack, playToEnd, rackAfter, randomStickLaunch, RAPIER, TEST_TIMEOUT_MS, viaServer } from "./replayFixtures";

beforeAll(async () => {
  await initRapier();
});

/** The rack of a throw: nominal for the first roll of a frame, or what a previous roll left. */
function rackFor(seed: number, partial: boolean) {
  if (!partial) return nominalRack();
  const first = new StickReplay(RAPIER, layout, nominalRack(), randomStickLaunch(mulberry32(seed + 5000)));
  playToEnd(first);
  const rack = rackAfter(first.pinPoses());
  first.dispose();
  return rack;
}

function twoReplays(seed: number, partial: boolean) {
  const rack = rackFor(seed, partial);
  const launch = randomStickLaunch(mulberry32(seed));
  const a = new StickReplay(RAPIER, layout, rack, launch);
  const b = new StickReplay(RAPIER, layout, rack, launch);
  playToEnd(a);
  playToEnd(b);
  return { rack, launch, a, b };
}

// A replay is BUILT from the launch variables and the rack: the thrower's own scene and every
// observer build the same world and play the same code in it, so they must agree on where each pin ends up.
describe("StickReplay — mêmes entrées, même lancer", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])(
    "lancer n°%i : poses finales de toutes les quilles et du bâton IDENTIQUES au bit près",
    (seed) => {
      const { a, b } = twoReplays(500 + seed, seed % 2 === 1);
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
      // The thrower plays its own inputs; an observer plays what came back from the server.
      const rack = rackFor(700 + seed, seed % 2 === 1);
      const launch = randomStickLaunch(mulberry32(700 + seed));
      const own = new StickReplay(RAPIER, layout, rack, launch);
      const observer = new StickReplay(RAPIER, layout, viaServer(rack), viaServer(launch));
      playToEnd(own);
      playToEnd(observer);
      expect(observer.pinPoses()).toEqual(own.pinPoses());
      expect(observer.projectilePose()).toEqual(own.projectilePose());
      expect(observer.stepsDone).toBe(own.stepsDone);
      own.dispose();
      observer.dispose();
    },
    TEST_TIMEOUT_MS,
  );

  it("ces lancers renversent bien des quilles (le test de concordance n'est pas vide)", () => {
    let hits = 0;
    for (let seed = 0; seed < 12; seed += 1) {
      const { rack, a } = twoReplays(500 + seed, seed % 2 === 1);
      const start = rack.map((p) => ({
        enabled: p.standing,
        position: [p.position.x, p.position.y, p.position.z] as [number, number, number],
        rotation: [p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w] as [number, number, number, number],
      }));
      if (pinsFelled(start, a.pinPoses(), layout) > 0) hits += 1;
      a.dispose();
    }
    expect(hits).toBeGreaterThanOrEqual(5);
  }, TEST_TIMEOUT_MS);

  it("un autre lancer donne un autre résultat : le rejeu dépend bien des variables de lancer", () => {
    const rack = nominalRack();
    const slow = new StickReplay(RAPIER, layout, rack, { ...randomStickLaunch(mulberry32(3)), velocity: [0, 1, -3] });
    const fast = new StickReplay(RAPIER, layout, rack, randomStickLaunch(mulberry32(3)));
    playToEnd(slow);
    playToEnd(fast);
    expect(fast.pinPoses()).not.toEqual(slow.pinPoses());
    slow.dispose();
    fast.dispose();
  }, TEST_TIMEOUT_MS);

  it("un lancer sans geste (bâton lâché sur place) se rejoue aussi, sans toucher une quille", () => {
    const launch = { ...randomStickLaunch(mulberry32(9)), velocity: [0, 0, 0] as [number, number, number] };
    const replay = new StickReplay(RAPIER, layout, nominalRack(), launch);
    playToEnd(replay);
    const start = nominalRack().map((p) => ({ enabled: true, position: [p.position.x, p.position.y, p.position.z] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] }));
    expect(replay.finished).toBe(true);
    expect(pinsFelled(start, replay.pinPoses(), layout)).toBe(0);
    replay.dispose();
  }, TEST_TIMEOUT_MS);

  it("les quilles retirées du jeu (standing: false) n'existent pas dans le rejeu", () => {
    const rack = nominalRack().map((p) => (p.index < 5 ? { ...p, standing: false } : p));
    const replay = new StickReplay(RAPIER, layout, rack, randomStickLaunch(mulberry32(4)));
    expect(replay.pinPoses().map((p) => p.enabled)).toEqual(rack.map((p) => p.standing));
    replay.dispose();
  });

  it("le rejeu se termine tout seul", () => {
    const { a } = twoReplays(777, false);
    expect(a.finished).toBe(true);
    a.dispose();
  }, TEST_TIMEOUT_MS);

  it("le rejeu suit l'horloge, pas la cadence d'appel : même résultat en 1 appel ou en 6000 petits", () => {
    const rack = nominalRack();
    const launch = randomStickLaunch(mulberry32(4242));
    const burst = new StickReplay(RAPIER, layout, rack, launch);
    playToEnd(burst);
    const drip = new StickReplay(RAPIER, layout, rack, launch);
    for (let frame = 1; frame <= 6000; frame += 1) drip.advanceTo(frame / 60);
    expect(drip.stepsDone).toBe(burst.stepsDone);
    expect(drip.pinPoses()).toEqual(burst.pinPoses());
    expect(drip.projectilePose()).toEqual(burst.projectilePose());
    burst.dispose();
    drip.dispose();
  }, TEST_TIMEOUT_MS);

  it("avance de 60 pas par seconde exactement, et pas avant d'y être invité", () => {
    const replay = new StickReplay(RAPIER, layout, nominalRack(), randomStickLaunch(mulberry32(1)));
    expect(replay.stepsDone).toBe(0);
    replay.advanceTo(0.5);
    expect(replay.stepsDone).toBe(30);
    replay.advanceTo(0.5);
    expect(replay.stepsDone).toBe(30);
    replay.dispose();
  });
});
