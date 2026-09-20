import { describe, expect, it } from "vitest";

import { getLaneLayout } from "../../src/features/game/scene/laneSizes";
import { buildPinPositions } from "../../src/features/game/scene/pinPositions";
import { PIN_OFF_LANE_MARGIN, PIN_SPAWN_Y_OFFSET } from "../../src/features/game/scene/sceneConstants";
import { pinsFelled, pinsOutOfPlay, settleRack, type PinOutcomePose } from "../../src/features/game/replay/replayOutcome";

const layout = getLaneLayout("small");
const UPRIGHT: [number, number, number, number] = [0, 0, 0, 1];
const s = Math.SQRT1_2;
const LYING: [number, number, number, number] = [s, 0, 0, s]; // 90° about X

const pin = (overrides: Partial<PinOutcomePose> = {}): PinOutcomePose => ({
  enabled: true,
  position: [0, 0, -1.6],
  rotation: UPRIGHT,
  ...overrides,
});

describe("pinsOutOfPlay", () => {
  it("une quille debout sur la piste reste en jeu", () => {
    expect(pinsOutOfPlay([pin()], layout)).toEqual([]);
  });

  it("une quille couchée (inclinée de plus de 60°) est sortie du jeu", () => {
    expect(pinsOutOfPlay([pin({ rotation: LYING })], layout)).toEqual([0]);
  });

  it("une quille légèrement penchée reste debout", () => {
    const a = 0.3 / 2; // 17° about X
    expect(pinsOutOfPlay([pin({ rotation: [Math.sin(a), 0, 0, Math.cos(a)] })], layout)).toEqual([]);
  });

  it("une quille projetée hors de la piste, gouttière comprise, est sortie du jeu même debout", () => {
    const outside = layout.gutterOuterHalfWidth + PIN_OFF_LANE_MARGIN + 0.01;
    expect(pinsOutOfPlay([pin({ position: [outside, 0, -1.6] })], layout)).toEqual([0]);
    expect(pinsOutOfPlay([pin({ position: [-outside, 0, -1.6] })], layout)).toEqual([0]);
    expect(pinsOutOfPlay([pin({ position: [0, 0, -(layout.laneHalfLength + PIN_OFF_LANE_MARGIN + 0.01)] })], layout)).toEqual([0]);
  });

  it("une quille dont le centre est dans la gouttière est tombée, même orientée debout : elle ne tient pas sur le bord", () => {
    expect(pinsOutOfPlay([pin({ position: [layout.laneHalfWidth + 0.02, 0, -1.6] })], layout)).toEqual([0]);
    expect(pinsOutOfPlay([pin({ position: [-(layout.laneHalfWidth + 0.02), 0, -1.6] })], layout)).toEqual([0]);
  });

  it("une quille dont le centre reste sur la piste, même au ras du bord, tient debout", () => {
    expect(pinsOutOfPlay([pin({ position: [layout.laneHalfWidth - 0.01, 0, -1.6] })], layout)).toEqual([]);
  });

  it("une quille tombée sous le monde est sortie du jeu", () => {
    expect(pinsOutOfPlay([pin({ position: [0, -1.5, -1.6] })], layout)).toEqual([0]);
  });

  it("une quille déjà retirée du jeu n'est jamais comptée (elle n'existe plus)", () => {
    expect(pinsOutOfPlay([pin({ enabled: false, rotation: LYING })], layout)).toEqual([]);
  });

  it("renvoie les indices des quilles concernées, dans l'ordre", () => {
    const poses = [pin(), pin({ rotation: LYING }), pin(), pin({ rotation: LYING })];
    expect(pinsOutOfPlay(poses, layout)).toEqual([1, 3]);
  });
});

describe("pinsFelled", () => {
  it("le nombre de quilles debout au début moins celles qui le sont à la fin", () => {
    const before = [pin(), pin(), pin(), pin()];
    const after = [pin(), pin({ rotation: LYING }), pin({ rotation: LYING }), pin()];
    expect(pinsFelled(before, after, layout)).toBe(2);
  });

  it("des quilles déjà retirées avant le lancer ne comptent ni au début ni à la fin", () => {
    const before = [pin(), pin({ enabled: false, rotation: LYING }), pin()];
    const after = [pin({ rotation: LYING }), pin({ enabled: false, rotation: LYING }), pin()];
    expect(pinsFelled(before, after, layout)).toBe(1);
  });

  it("aucune quille touchée : zéro", () => {
    const poses = [pin(), pin(), pin()];
    expect(pinsFelled(poses, poses, layout)).toBe(0);
  });

  it("jamais négatif, même si une quille couchée se redresse (bruit numérique)", () => {
    expect(pinsFelled([pin({ rotation: LYING })], [pin()], layout)).toBe(0);
  });
});

describe("settleRack: le râtelier du lancer suivant", () => {
  const nominal = buildPinPositions(layout);
  const at = (index: number, overrides: Partial<PinOutcomePose> = {}): PinOutcomePose => ({
    enabled: true,
    position: [nominal[index][0], nominal[index][1], nominal[index][2]],
    rotation: UPRIGHT,
    ...overrides,
  });

  it("remet une survivante poussée, penchée et enfoncée EXACTEMENT sur sa case d'origine, droite", () => {
    const a = 0.12 / 2; // ~7° about X
    const poses = [at(0), at(1, { position: [nominal[1][0] + 0.03, -0.001, nominal[1][2] - 0.02], rotation: [Math.sin(a), 0, 0, Math.cos(a)] })];
    const [, stood] = settleRack(poses, layout);
    expect(stood.rotation).toEqual(UPRIGHT);
    expect(stood.position).toEqual([nominal[1][0], nominal[1][1] + PIN_SPAWN_Y_OFFSET, nominal[1][2]]);
    expect(stood.enabled).toBe(true);
  });

  it("chaque survivante retrouve SA case : elles ne sont ni recentrées ni échangées", () => {
    // All 15 pins pushed about (by index: pin `k` of the list is the rack's pin `k`).
    const shifted = nominal.map((_, i) => at(i, { position: [nominal[i][0] + 0.06 * (i % 2 ? 1 : -1), 0.01, nominal[i][2] + 0.08] }));
    const settled = settleRack(shifted, layout);
    expect(settled.every((pose) => pose.enabled)).toBe(true);
    settled.forEach((pose, k) => {
      expect(pose.position).toEqual([nominal[k][0], nominal[k][1] + PIN_SPAWN_Y_OFFSET, nominal[k][2]]);
    });
  });

  it("retire une quille tombée ou dans la gouttière (elle ne peut pas être redressée), et laisse une quille déjà retirée telle quelle", () => {
    const fallen = at(0, { rotation: LYING });
    const inGutter = at(1, { position: [layout.laneHalfWidth + 0.03, 0, nominal[1][2]] });
    const retired = at(2, { enabled: false, position: [0, 0, 0] });
    const [a, b, c] = settleRack([fallen, inGutter, retired], layout);
    expect(a).toEqual({ ...fallen, enabled: false });
    expect(b).toEqual({ ...inGutter, enabled: false });
    expect(c).toEqual(retired);
  });

  it("ne change jamais le nombre de quilles tombées (le score ne dépend pas du redressement)", () => {
    const a = 0.5 / 2; // ~29°: leaning but still in play
    const poses = [at(0), at(1, { rotation: [Math.sin(a), 0, 0, Math.cos(a)] }), at(2, { rotation: LYING }), at(3, { position: [3, 0, -1.6] })];
    const inPlay = (p: readonly PinOutcomePose[]) => p.filter((x) => x.enabled).length - pinsOutOfPlay(p, layout).length;
    expect(inPlay(settleRack(poses, layout))).toBe(inPlay(poses));
    expect(pinsFelled(poses, settleRack(poses, layout), layout)).toBe(0);
  });

  it("ne modifie pas ses entrées", () => {
    const poses = [at(0, { rotation: [0.1, 0, 0, 0.995] })];
    const copy = structuredClone(poses);
    settleRack(poses, layout);
    expect(poses).toEqual(copy);
  });
});
