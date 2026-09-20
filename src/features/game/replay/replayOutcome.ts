import type { LaneLayout } from "../scene/laneSizes";
import { buildPinPositions } from "../scene/pinPositions";
import { PIN_SPAWN_Y_OFFSET } from "../scene/sceneConstants";
import { FALLEN_UP_DOT_THRESHOLD, isPositionOffLane } from "../scene/pinSettleLogic";
import type { PinReplayPose } from "./throwReplay";

// Below this a pin has fallen off the world: it is out of play, and it is never going to come to rest. 
export const WORLD_FLOOR_Y = -1;

export type PinOutcomePose = {
  // Still in the game (a pin retired after an earlier roll of the frame is not). 
  enabled: boolean;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number, number];
};

// Indices of the pins in the game that are fallen, in the gutter or off the lane. */
export function pinsOutOfPlay(poses: readonly PinOutcomePose[], layout: LaneLayout): number[] {
  // A pin stands on the lane: one whose centre is over the gutter, beyond the end of the lane or off
  // the world has fallen, whatever way it is turned (it cannot stay upright there).
  const bounds = { maxAbsX: layout.laneHalfWidth, maxAbsZ: layout.laneHalfLength, minY: WORLD_FLOOR_Y };
  return poses.flatMap((pose, index) => {
    if (!pose.enabled) return [];
    const [qx, , qz] = pose.rotation;
    // Local up (0,1,0) rotated by q, dotted with world up = 1 − 2(x² + z²).
    const upDot = 1 - 2 * (qx * qx + qz * qz);
    const [x, y, z] = pose.position;
    return upDot < FALLEN_UP_DOT_THRESHOLD || isPositionOffLane({ x, y, z }, bounds) ? [index] : [];
  });
}

/** How many pins the throw knocked out of play: standing before, minus standing after. */
export function pinsFelled(
  before: readonly PinOutcomePose[],
  after: readonly PinOutcomePose[],
  layout: LaneLayout,
): number {
  const standing = (poses: readonly PinOutcomePose[]) =>
    poses.filter((p) => p.enabled).length - pinsOutOfPlay(poses, layout).length;
  return Math.max(0, standing(before) - standing(after));
}


// The rack the next roll starts from 
export function settleRack(poses: readonly PinReplayPose[], layout: LaneLayout): PinReplayPose[] {
  const out = new Set(pinsOutOfPlay(poses, layout));
  const nominal = buildPinPositions(layout);
  return poses.map((pose, index) => {
    if (!pose.enabled) return pose;
    if (out.has(index)) return { ...pose, enabled: false };
    const [x, y, z] = nominal[index];
    return { enabled: true, position: [x, y + PIN_SPAWN_Y_OFFSET, z], rotation: [0, 0, 0, 1] };
  });
}
