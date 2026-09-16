// Decelerate the ball's speed once it enters the stop zone
export function decelerateSpeed(
  currentSpeed: number,
  inStopZone: boolean,
  decelerationPerSecond: number,
  dt: number,
): number {
  if (!inStopZone || currentSpeed <= 0) return currentSpeed;
  return Math.max(0, currentSpeed - decelerationPerSecond * dt);
}

export interface RollEndCheck {
  pinsSettled: boolean;
  ballSettledLongEnough: boolean;
  elapsedMs: number;
  maxRollDurationMs: number;
  absoluteMaxRollDurationMs: number;
}

// Determine whether the ball's roll should end based on the current state and elapsed time.
export function shouldEndRoll({
  pinsSettled,
  ballSettledLongEnough,
  elapsedMs,
  maxRollDurationMs,
  absoluteMaxRollDurationMs,
}: RollEndCheck): boolean {
  if (elapsedMs > absoluteMaxRollDurationMs) return true;
  if (!pinsSettled) return false;
  return ballSettledLongEnough || elapsedMs > maxRollDurationMs;
}
