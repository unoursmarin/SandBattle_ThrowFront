
export type RackResetPlan =
  | { type: "noop" }
  | { type: "resetAll" }
  | { type: "resetPartial"; standCount: number };

/**
 * Decides to bring back the rack in place
 */
export function planRackReset(currentlyStanding: number, target: number, totalPins: number): RackResetPlan {
  if (currentlyStanding === target) return { type: "noop" };
  if (target === totalPins) return { type: "resetAll" };
  return { type: "resetPartial", standCount: target };
}

/** ~60° of inclination: beyond this (cosine of the tilt below it), a pin is considered fallen. */
export const FALLEN_UP_DOT_THRESHOLD = 0.5;

/**
 * Whether a pin no longer counts as standing: retired from the game (a pin that fell is disabled
 * where it was, still upright, so its pose alone says nothing), fallen, or off the playable area.
 */
export function isPinOutOfPlay(
  pin: { inGame: boolean; upDot: number; position: { x: number; y: number; z: number } },
  bounds: { maxAbsX: number; maxAbsZ: number; minY: number },
): boolean {
  return !pin.inGame || pin.upDot < FALLEN_UP_DOT_THRESHOLD || isPositionOffLane(pin.position, bounds);
}

/**
 * Truth we don't wait for the pin to stabilizee, it's offlane
 */
export function isPositionOffLane(
  position: { x: number; y: number; z: number },
  bounds: { maxAbsX: number; maxAbsZ: number; minY: number },
): boolean {
  return Math.abs(position.x) > bounds.maxAbsX || Math.abs(position.z) > bounds.maxAbsZ || position.y < bounds.minY;
}
