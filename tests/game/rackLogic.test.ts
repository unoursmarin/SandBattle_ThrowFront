import { describe, expect, it } from "vitest";

import { getLaneLayout } from "../../src/features/game/scene/laneSizes";
import { buildPinPositions } from "../../src/features/game/scene/pinPositions";
import { createPinController, type PinBody, type PinBodyPose, type PinHandle } from "../../src/features/game/scene/pinController";
import { applyReplayResult, countStanding, resetRackToTarget, retireFallenPins, snapshotPins } from "../../src/features/game/scene/rackLogic";
import { PIN_SPAWN_Y_OFFSET } from "../../src/features/game/scene/sceneConstants";
import { settleRack } from "../../src/features/game/replay/replayOutcome";

const layout = getLaneLayout("small");
const SPOTS = buildPinPositions(layout);
const BOUNDS = { maxAbsX: layout.gutterOuterHalfWidth + 0.02, maxAbsZ: layout.laneHalfLength + 0.02, minY: -1 };
const TOTAL = 15;

// A rigid body reduced to what the rack observes: enabled or not, and where it is. Like Rapier, a disabled body keeps its pose.
class FakeBody implements PinBody {
  enabled = true;
  t = { x: 0, y: 0, z: 0 };
  q = { x: 0, y: 0, z: 0, w: 1 };
  isEnabled = () => this.enabled;
  setEnabled = (enabled: boolean) => void (this.enabled = enabled);
  translation = () => ({ ...this.t });
  rotation = () => ({ ...this.q });
  setTranslation = (v: { x: number; y: number; z: number }) => void (this.t = { ...v });
  setRotation = (q: { x: number; y: number; z: number; w: number }) => void (this.q = { ...q });
  setLinvel = () => undefined;
  setAngvel = () => undefined;
}

// A fresh rack of 15 pins on their spots, as the scene mounts it.
function freshRack() {
  const bodies = SPOTS.map(([x, y, z]) => Object.assign(new FakeBody(), { t: { x, y: y + PIN_SPAWN_Y_OFFSET, z } }));
  const views = SPOTS.map(() => ({ visible: true }));
  const pins: PinHandle[] = SPOTS.map((spot, i) => createPinController({ getBody: () => bodies[i], view: views[i], spot, bounds: BOUNDS }));
  return { bodies, views, pins };
}

const spotOf = (i: number) => ({ x: SPOTS[i][0], y: SPOTS[i][1] + PIN_SPAWN_Y_OFFSET, z: SPOTS[i][2] });

// What the replay of a throw ends with: the pins in `felled` are lying, the others stand pushed about a little.
function replayOutcome(felled: readonly number[]): PinBodyPose[] {
  const s = Math.SQRT1_2;
  return SPOTS.map(([x, y, z], i) =>
    felled.includes(i)
      ? { enabled: true, position: [x + 0.2, 0.07, z - 0.3], rotation: [s, 0, 0, s] }
      : { enabled: true, position: [x + 0.03, y, z + 0.02], rotation: [0.05, 0, 0, 0.9987] },
  );
}

describe("comptage des quilles debout", () => {
  it("un râtelier neuf compte 15 quilles", () => {
    expect(countStanding(freshRack().pins)).toBe(15);
  });

  it("RÉGRESSION : une quille retirée n'est plus comptée, même restée droite sur sa case", () => {
    const { pins } = freshRack();
    pins[4].retire();
    expect(countStanding(pins)).toBe(14);
  });

  it("une quille couchée ou hors de la piste n'est pas comptée", () => {
    const { pins, bodies } = freshRack();
    bodies[0].q = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
    bodies[1].t = { x: 5, y: 0, z: 0 };
    expect(countStanding(pins)).toBe(13);
  });

  it("ignore un emplacement pas encore monté", () => {
    const { pins } = freshRack();
    expect(countStanding([...pins.slice(0, 14), null])).toBe(14);
  });
});

describe("après mon lancer : le râtelier du tour suivant", () => {
  it("RÉGRESSION : strike, puis nouveau frame : les 15 quilles reviennent, sur leurs cases", () => {
    const { pins, bodies, views } = freshRack();
    applyReplayResult(pins, settleRack(replayOutcome([...Array(15).keys()]), layout));
    expect(countStanding(pins)).toBe(0);
    expect(views.some((v) => v.visible)).toBe(false);

    resetRackToTarget(pins, 15, TOTAL); // the next frame: 15 pins again
    expect(countStanding(pins)).toBe(15);
    bodies.forEach((b, i) => expect(b.t).toEqual(spotOf(i)));
    expect(views.every((v) => v.visible)).toBe(true);
    expect(bodies.every((b) => b.enabled)).toBe(true);
  });

  it("lancer partiel : les survivantes reviennent sur LEURS cases, droites, et le serveur ne les déplace pas", () => {
    const { pins, bodies, views } = freshRack();
    const felled = [0, 1, 2, 4, 6, 7, 9, 12, 13];
    const survivors = SPOTS.map((_, i) => i).filter((i) => !felled.includes(i));
    applyReplayResult(pins, settleRack(replayOutcome(felled), layout));

    survivors.forEach((i) => {
      expect(bodies[i].t).toEqual(spotOf(i));
      expect(bodies[i].q).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      expect(views[i].visible).toBe(true);
    });
    felled.forEach((i) => expect(views[i].visible).toBe(false));
    expect(countStanding(pins)).toBe(survivors.length);

    // The server then says how many stand: same number, so the rack is left alone (no guessing by index).
    const before = bodies.map((b) => ({ ...b.t, on: b.enabled }));
    resetRackToTarget(pins, survivors.length, TOTAL);
    expect(bodies.map((b) => ({ ...b.t, on: b.enabled }))).toEqual(before);
    survivors.forEach((i) => expect(pins[i].isOutOfPlay()).toBe(false));
  });

  it("un lancer qui ne fait rien tomber laisse les 15 quilles sur leurs cases", () => {
    const { pins, bodies } = freshRack();
    applyReplayResult(pins, settleRack(replayOutcome([]), layout));
    expect(countStanding(pins)).toBe(15);
    bodies.forEach((b, i) => expect(b.t).toEqual(spotOf(i)));
  });

  it("une quille tombée dans la gouttière est retirée, pas redressée", () => {
    const { pins } = freshRack();
    const poses = replayOutcome([]);
    poses[3] = { ...poses[3], position: [layout.laneHalfWidth + 0.03, 0, poses[3].position[2]] };
    applyReplayResult(pins, settleRack(poses, layout));
    expect(pins[3].isOutOfPlay()).toBe(true);
    expect(countStanding(pins)).toBe(14);
  });
});

describe("resetRackToTarget : rattrapage quand le compte ne correspond pas", () => {
  it("quand seul le nombre est connu (rejeu perdu, rechargement), les N premières quilles se dressent et les autres sont couchées", () => {
    const { pins, views } = freshRack();
    resetRackToTarget(pins, 6, TOTAL);
    expect(countStanding(pins)).toBe(6);
    expect(views.slice(0, 6).every((v) => v.visible)).toBe(true);
    expect(views.slice(6).some((v) => v.visible)).toBe(false);
  });

  it("un nouveau frame remet tout le râtelier, même après un lancer partiel", () => {
    const { pins } = freshRack();
    resetRackToTarget(pins, 6, TOTAL);
    resetRackToTarget(pins, 15, TOTAL);
    expect(countStanding(pins)).toBe(15);
  });
});

describe("rejeu du lancer d'un autre joueur", () => {
  it("le râtelier est caché puis rendu tel quel, quilles déjà retirées comprises", () => {
    const { pins, bodies, views } = freshRack();
    pins[2].retire();
    pins.forEach((p) => p.hideForReplay());
    expect(views.some((v) => v.visible)).toBe(false);
    pins.forEach((p) => p.showAfterReplay());
    expect(views.map((v) => v.visible)).toEqual(SPOTS.map((_, i) => i !== 2));
    expect(bodies.map((b) => b.enabled)).toEqual(SPOTS.map((_, i) => i !== 2));
    expect(countStanding(pins)).toBe(14);
  });

  it("pendant qu'elles sont cachées, les quilles comptent toujours comme en jeu", () => {
    const { pins } = freshRack();
    pins.forEach((p) => p.hideForReplay());
    expect(countStanding(pins)).toBe(15);
  });

  it("cacher deux fois de suite n'efface pas qu'elles étaient en jeu", () => {
    const { pins, views } = freshRack();
    pins.forEach((p) => p.hideForReplay());
    pins.forEach((p) => p.hideForReplay());
    pins.forEach((p) => p.showAfterReplay());
    expect(views.every((v) => v.visible)).toBe(true);
    expect(countStanding(pins)).toBe(15);
  });
});

describe("instantané pour un lancer", () => {
  it("donne, par index, la pose et si la quille est encore en jeu", () => {
    const { pins } = freshRack();
    pins[5].retire();
    const snapshot = snapshotPins(pins);
    expect(snapshot).toHaveLength(15);
    expect(snapshot[0]).toEqual({ index: 0, standing: true, position: { x: SPOTS[0][0], y: SPOTS[0][1] + PIN_SPAWN_Y_OFFSET, z: SPOTS[0][2] }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    expect(snapshot.filter((p) => !p.standing).map((p) => p.index)).toEqual([5]);
  });

  it("retireFallenPins retire les quilles tombées et laisse les autres", () => {
    const { pins, bodies } = freshRack();
    bodies[7].q = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
    retireFallenPins(pins);
    expect(bodies[7].enabled).toBe(false);
    expect(bodies.filter((b) => b.enabled)).toHaveLength(14);
  });
});
