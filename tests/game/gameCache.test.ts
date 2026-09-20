import { describe, expect, it, vi } from "vitest";

import { applyRollUpdate, mergeRollUpdate } from "../../src/features/game/gameCache";
import type { GameSessionSnapshot, PlayerStateSnapshot, RollUpdateEvent } from "../../src/lib/api/schemas";

const GAME_ID = "00000000-0000-4000-8000-000000000000";
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

const player = (playerId: string, rolls: number[] = []): PlayerStateSnapshot => ({
  playerId,
  displayName: playerId === ALICE ? "Alice" : "Bob",
  frames: [{ number: 1, rolls, status: "IN_PROGRESS", score: -1 }],
  totalScore: 0,
  complete: false,
});

const snapshot = (overrides: Partial<GameSessionSnapshot> = {}): GameSessionSnapshot => ({
  gameId: GAME_ID,
  status: "IN_PROGRESS",
  currentPlayerId: ALICE,
  players: [player(ALICE), player(BOB)],
  projectile: "stick",
  laneSize: "small",
  ...overrides,
});

const event = (overrides: Partial<RollUpdateEvent> = {}): RollUpdateEvent => ({
  gameId: GAME_ID,
  player: player(ALICE, [7]),
  nextPlayerId: ALICE,
  sessionCompleted: false,
  ...overrides,
});

describe("mergeRollUpdate", () => {
  it("met à jour le joueur, le joueur suivant et le statut", () => {
    const merged = mergeRollUpdate(snapshot(), event({ nextPlayerId: BOB }));
    expect(merged?.players.find((p) => p.playerId === ALICE)?.frames[0].rolls).toEqual([7]);
    expect(merged?.currentPlayerId).toBe(BOB);
    expect(merged?.status).toBe("IN_PROGRESS");
  });

  it("marque la partie terminée quand l'événement le dit", () => {
    expect(mergeRollUpdate(snapshot(), event({ sessionCompleted: true }))?.status).toBe("COMPLETED");
  });

  it("garde les réglages de la partie (projectile, piste) tels que le premier chargement les a donnés", () => {
    const merged = mergeRollUpdate(snapshot({ projectile: "stick", laneSize: "large" }), event());
    expect(merged?.projectile).toBe("stick");
    expect(merged?.laneSize).toBe("large");
  });

  it("RÉGRESSION : sans partie en cache, il n'invente pas de snapshot (ni projectile ni piste par défaut)", () => {
    expect(mergeRollUpdate(undefined, event())).toBeUndefined();
  });

  it("ne modifie pas le snapshot d'entrée", () => {
    const before = snapshot();
    const copy = structuredClone(before);
    mergeRollUpdate(before, event());
    expect(before).toEqual(copy);
  });
});

describe("applyRollUpdate", () => {
  const KEY = ["game", GAME_ID] as const;

  function fakeClient(cached: GameSessionSnapshot | undefined) {
    let data = cached;
    return {
      getQueryData: vi.fn(() => data),
      setQueryData: vi.fn((_key: unknown, updater: (prev: GameSessionSnapshot | undefined) => GameSessionSnapshot | undefined) => {
        data = updater(data);
        return data;
      }),
      invalidateQueries: vi.fn(() => Promise.resolve()),
      get data() {
        return data;
      },
    };
  }

  it("fusionne l'événement dans la partie en cache", () => {
    const client = fakeClient(snapshot());
    applyRollUpdate(client, KEY, event());
    expect(client.data?.players.find((p) => p.playerId === ALICE)?.frames[0].rolls).toEqual([7]);
    expect(client.invalidateQueries).not.toHaveBeenCalled();
  });

  it("RÉGRESSION : événement reçu avant le premier chargement → rien n'est écrit en cache, la partie est rechargée", () => {
    const client = fakeClient(undefined);
    applyRollUpdate(client, KEY, event());
    expect(client.setQueryData).not.toHaveBeenCalled();
    expect(client.data).toBeUndefined();
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: KEY });
  });
});
