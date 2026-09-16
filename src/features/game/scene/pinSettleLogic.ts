
//Calculate stability of the state
export function updateStableSince(previousStableSince: number | null, isStableNow: boolean, now: number): number | null {
  if (!isStableNow) return null;
  return previousStableSince ?? now;
}

export function hasBeenStableLongEnough(stableSince: number | null, now: number, durationMs: number): boolean {
  return stableSince !== null && now - stableSince > durationMs;
}

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

/**
 * Truth we don't wait for the pin to stabilizee, it's offlane
 */
export function isPositionOffLane(
  position: { x: number; y: number; z: number },
  bounds: { maxAbsX: number; maxAbsZ: number; minY: number },
): boolean {
  return Math.abs(position.x) > bounds.maxAbsX || Math.abs(position.z) > bounds.maxAbsZ || position.y < bounds.minY;
}
