import { describe, expect, it } from "vitest";

import {
  buildThrowLaunchPayload,
  replayInputFromSnapshot,
  type CapturedThrow,
} from "../../src/features/game/replay/throwPayload";
import { throwLaunchSchema, throwSnapshotSchema, type PinPose } from "../../src/lib/api/schemas";

const rack: PinPose[] = Array.from({ length: 15 }, (_, index) => ({
  index,
  standing: index !== 4,
  position: { x: -0.4 + index * 0.05, y: 0.002, z: -1.6 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
}));

function captured(overrides: Partial<CapturedThrow> = {}): CapturedThrow {
  return {
    capture: {
      projectile: "stick",
      launch: { origin: [0.02, 0.9, 2.3], velocity: [0.3, 3.4, -5.1], gripOffset: 0.2 },
    },
    rack,
    laneSize: "small",
    ...overrides,
  };
}

describe("buildThrowLaunchPayload", () => {
  it("produit exactement le contrat du serveur (validé par le même schéma que la réponse)", () => {
    const payload = buildThrowLaunchPayload(captured());
    expect(throwLaunchSchema.parse(payload)).toEqual(payload);
    expect(payload.projectile).toBe("stick");
    expect(payload.laneSize).toBe("small");
    expect(payload.origin).toEqual({ x: 0.02, y: 0.9, z: 2.3 });
    expect(payload.velocity).toEqual({ x: 0.3, y: 3.4, z: -5.1 });
    expect(payload.gripOffset).toBe(0.2);
    expect(payload.rack).toHaveLength(15);
    expect(payload.rack[4].standing).toBe(false);
  });

  it("n'envoie rien de la physique du lanceur : seulement les entrées du lancer et le râtelier", () => {
    expect(Object.keys(buildThrowLaunchPayload(captured())).sort()).toEqual(
      ["gripOffset", "laneSize", "origin", "projectile", "rack", "velocity"],
    );
  });

  it("une boule n'a pas de point de saisie et roule à plat", () => {
    const payload = buildThrowLaunchPayload(
      captured({
        capture: { projectile: "ball", launch: { origin: [0, 0.108, 5.6], velocity: [0.2, 0, -7], gripOffset: null } },
        laneSize: "medium",
      }),
    );
    expect(payload.projectile).toBe("ball");
    expect(payload.gripOffset).toBeNull();
    expect(payload.velocity.y).toBe(0);
  });

  it("les nombres survivent à un aller-retour JSON exactement (le rejeu en dépend)", () => {
    const odd = captured({
      capture: { projectile: "stick", launch: { origin: [0.1 + 0.2, 0.9, 2.3], velocity: [1 / 3, Math.PI, -5.1], gripOffset: 0.2 } },
    });
    const payload = buildThrowLaunchPayload(odd);
    expect(throwLaunchSchema.parse(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });
});

function snapshotOf(launch: ReturnType<typeof buildThrowLaunchPayload>) {
  return throwSnapshotSchema.parse({
    throwId: "11111111-1111-4111-8111-111111111111",
    gameId: "22222222-2222-4222-8222-222222222222",
    playerId: "33333333-3333-4333-8333-333333333333",
    attemptIndex: 0,
    frameNumber: 1,
    status: "STARTED",
    pinsFelled: null,
    launch,
    startedAtEpochMs: 1_700_000_000_000,
  });
}

describe("replayInputFromSnapshot", () => {
  it("relit le lancer du serveur : variables de lâcher et râtelier", () => {
    const input = replayInputFromSnapshot(snapshotOf(buildThrowLaunchPayload(captured())));
    expect(input).not.toBeNull();
    expect(input?.projectile).toBe("stick");
    expect(input?.laneSize).toBe("small");
    expect(input?.launch).toEqual({ origin: [0.02, 0.9, 2.3], velocity: [0.3, 3.4, -5.1], gripOffset: 0.2 });
    expect(input?.rack).toEqual(rack);
    expect(input?.own).toBe(false);
  });

  it("sans râtelier, il n'y a pas d'état de départ : rien à rejouer, null", () => {
    const payload = { ...buildThrowLaunchPayload(captured()), rack: [] };
    expect(replayInputFromSnapshot(snapshotOf(payload))).toBeNull();
  });

  it("un lancer déjà terminé (COMPLETED) se rejoue quand même : le rejeu est indépendant du score", () => {
    const snap = { ...snapshotOf(buildThrowLaunchPayload(captured())), status: "COMPLETED" as const, pinsFelled: 7 };
    expect(replayInputFromSnapshot(snap)).not.toBeNull();
  });
});
