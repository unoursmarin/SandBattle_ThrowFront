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
