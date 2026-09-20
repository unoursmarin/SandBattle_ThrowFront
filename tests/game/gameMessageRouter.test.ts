import { describe, expect, it, vi } from "vitest";

import { createGameMessageRouter } from "../../src/features/game/gameMessageRouter";

const GAME = "22222222-2222-4222-8222-222222222222";
const ALICE = "33333333-3333-4333-8333-333333333333";

const envelope = (type: string, payload: unknown) => ({ type, id: GAME, payload, timestamp: "2026-09-19T21:00:00Z" });

const rollEvent = (pins: number) => ({
  gameId: GAME,
  player: { playerId: ALICE, displayName: "Alice", frames: [{ number: 1, rolls: [pins], status: "IN_PROGRESS", score: -1 }], totalScore: pins, complete: false },
  nextPlayerId: ALICE,
  sessionCompleted: false,
});

const vec = { x: 0, y: 0, z: 0 };
const throwEvent = {
  throwId: "11111111-1111-4111-8111-111111111111",
  gameId: GAME,
  playerId: ALICE,
  attemptIndex: 0,
  frameNumber: 1,
  status: "STARTED",
  pinsFelled: null,
  launch: { projectile: "stick", laneSize: "small", origin: vec, velocity: vec, gripOffset: 0.2, rack: [], world: null },
  startedAtEpochMs: 1_700_000_000_000,
};

function setup(defer = false) {
  const applied: number[] = [];
  const started: string[] = [];
  let deferring = defer;
  const router = createGameMessageRouter({
    applyRoll: (event) => applied.push(event.player.totalScore),
    onThrowStarted: (snapshot) => started.push(snapshot.throwId),
    shouldDeferRolls: () => deferring,
  });
  return { router, applied, started, setDeferring: (value: boolean) => (deferring = value) };
}

describe("createGameMessageRouter", () => {
  it("un lancer enregistré met le score à jour tout de suite quand rien n'est en cours de rejeu", () => {
    const { router, applied } = setup(false);
    router.handle(envelope("rollRegistered", rollEvent(7)));
    expect(applied).toEqual([7]);
  });

  it("le début d'un lancer est transmis pour être rejoué", () => {
    const { router, started } = setup();
    router.handle(envelope("throwStarted", throwEvent));
    expect(started).toEqual([throwEvent.throwId]);
  });

  it("pendant un rejeu, le score est RETENU : le lancer est vu avant son résultat", () => {
    const { router, applied } = setup(true);
    router.handle(envelope("rollRegistered", rollEvent(9)));
    expect(applied).toEqual([]);
  });

  it("le rejeu terminé, les scores retenus sont appliqués, dans l'ordre d'arrivée", () => {
    const { router, applied, setDeferring } = setup(true);
    router.handle(envelope("rollRegistered", rollEvent(3)));
    router.handle(envelope("rollRegistered", rollEvent(5)));
    setDeferring(false);
    router.flushDeferred();
    expect(applied).toEqual([3, 5]);
  });

  it("une fois vidée, la file ne rejoue pas deux fois", () => {
    const { router, applied, setDeferring } = setup(true);
    router.handle(envelope("rollRegistered", rollEvent(4)));
    setDeferring(false);
    router.flushDeferred();
    router.flushDeferred();
    expect(applied).toEqual([4]);
  });

  it("après le rejeu, les scores suivants ne sont plus retenus", () => {
    const { router, applied, setDeferring } = setup(true);
    router.handle(envelope("rollRegistered", rollEvent(1)));
    setDeferring(false);
    router.flushDeferred();
    router.handle(envelope("rollRegistered", rollEvent(2)));
    expect(applied).toEqual([1, 2]);
  });

  it("les messages illisibles ou d'un type inconnu sont ignorés sans planter", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { router, applied, started } = setup();
    router.handle({ nimporte: "quoi" });
    router.handle(envelope("rollRegistered", { gameId: "pas-un-uuid" }));
    router.handle(envelope("throwStarted", { throwId: 1 }));
    router.handle(envelope("typeInconnu", {}));
    expect(applied).toEqual([]);
    expect(started).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
