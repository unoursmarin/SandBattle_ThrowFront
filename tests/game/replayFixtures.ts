// Shared fixtures of the replay tests: launches and racks like the game produces.
import RAPIER from "@dimforge/rapier3d-compat";

import { pinsOutOfPlay, settleRack } from "../../src/features/game/replay/replayOutcome";
import type { PinReplayPose, ThrowReplay } from "../../src/features/game/replay/throwReplay";
import { getLaneLayout, type LaneLayout } from "../../src/features/game/scene/laneSizes";
import { buildPinPositions } from "../../src/features/game/scene/pinPositions";
import { PIN_SPAWN_Y_OFFSET } from "../../src/features/game/scene/sceneConstants";
import { STICK_MASS_PROPERTIES } from "../../src/features/game/scene/stickMassProperties";
import { meanDragPerMass, STICK_DRAG_PARAMS } from "../../src/features/game/scene/stickAerodynamics";
import { solveAerialVelocity } from "../../src/features/game/scene/stickThrowLogic";
import type { StickLaunch } from "../../src/features/game/scene/stickThrowSim";
import type { PinPose } from "../../src/lib/api/schemas";

export { RAPIER };
export const layout: LaneLayout = getLaneLayout("small");

/** A throw simulates up to 22 s of a 15-pin rack: slow under a parallel test run. */
export const TEST_TIMEOUT_MS = 90_000;

export async function initRapier(): Promise<void> {
  await RAPIER.init();
}

/** Small deterministic PRNG so that trials are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh frame: all 15 pins upright on their spots, like Pin.reset() puts them. */
export function nominalRack(): PinPose[] {
  return buildPinPositions(layout).map(([x, y, z], index) => ({
    index,
    standing: true,
    position: { x, y: y + PIN_SPAWN_Y_OFFSET, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  }));
}

/**
 * The rack the NEXT roll of a frame starts from: where a replay left the pins, the ones that fell
 * having left the game (what PinRack.applyReplayResult does).
 */
export function rackAfter(poses: readonly PinReplayPose[]): PinPose[] {
  const settled = settleRack(poses, layout);
  const out = new Set(pinsOutOfPlay(settled, layout));
  return settled.map((pose, index) => ({
    index,
    standing: pose.enabled && !out.has(index),
    position: { x: pose.position[0], y: pose.position[1], z: pose.position[2] },
    rotation: { x: pose.rotation[0], y: pose.rotation[1], z: pose.rotation[2], w: pose.rotation[3] },
  }));
}

export function randomStickLaunch(random: () => number): StickLaunch {
  const pick = (min: number, max: number) => min + (max - min) * random();
  const rest = layout.stickRest;
  const origin: [number, number, number] = [rest[0] + pick(-0.3, 0.3), rest[1] + pick(-0.15, 0.4), rest[2] + pick(-0.4, 0.1)];
  const hSpeed = pick(5, 10);
  const vx = hSpeed * pick(-0.1, 0.1);
  const vz = -Math.sqrt(hSpeed * hSpeed - vx * vx);
  const vy = solveAerialVelocity(
    origin[1], origin[2] - layout.pinTipRowZ, hSpeed, 0.15, 9.81, -2, 7.5,
    meanDragPerMass(STICK_DRAG_PARAMS, STICK_MASS_PROPERTIES.mass),
  );
  return { origin, velocity: [vx, vy, vz], gripOffset: pick(-0.3, 0.3) };
}

export type BallThrow = { origin: [number, number, number]; velocity: [number, number, number] };

export function randomBallLaunch(random: () => number): BallThrow {
  const pick = (min: number, max: number) => min + (max - min) * random();
  const rest = layout.ballRest;
  const vz = -pick(5, 11);
  return { origin: [rest[0] + pick(-0.3, 0.3), rest[1], rest[2] + pick(-0.2, 0.1)], velocity: [vz * pick(-0.06, 0.06), 0, vz] };
}

/** What a JSON round trip through the server does to a value (doubles survive it exactly). */
export function viaServer<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function playToEnd(replay: ThrowReplay): void {
  replay.advanceTo(100);
}
