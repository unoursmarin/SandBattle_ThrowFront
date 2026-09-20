
// Pure helpers of the stick throw: aiming (lob solver) and drag geometry.
const SOLVER_DT = 1 / 240; // s
const SOLVER_MAX_TIME = 10; // s
const SOLVER_BISECTIONS = 40;

// Height (m) at which a point mass launched with (horizontalSpeed, vy) crosses `distance` metres
// horizontally, with gravity and quadratic drag a = −dragPerMass·|v|·v. -Infinity if it never gets there.

function heightAtDistance(
  releaseY: number,
  distance: number,
  horizontalSpeed: number,
  vy0: number,
  gravity: number,
  dragPerMass: number,
): number {
  let travelled = 0;
  let y = releaseY;
  let vh = horizontalSpeed;
  let vy = vy0;
  for (let t = 0; t < SOLVER_MAX_TIME; t += SOLVER_DT) {
    const speed = Math.hypot(vh, vy);
    vh -= dragPerMass * speed * vh * SOLVER_DT;
    vy -= (gravity + dragPerMass * speed * vy) * SOLVER_DT;
    travelled += vh * SOLVER_DT;
    y += vy * SOLVER_DT;
    if (travelled >= distance) return y;
  }
  return -Infinity;
}

// Vertical throw speed so that the stick crosses the pins at `targetHeight`.
// Without drag: vy = (target − y0 + ½·g·t²) / t. With drag (`dragPerMass` > 0, see
// meanDragPerMass) the flight is longer and there is no closed form: bisection on vy.
export function solveAerialVelocity(
  releaseY: number,
  distance: number,
  horizontalSpeed: number,
  targetHeight: number,
  gravity: number,
  minVy: number,
  maxVy: number,
  dragPerMass = 0,
): number {
  if (horizontalSpeed <= 0 || distance <= 0) return 0;
  if (!(dragPerMass > 0)) {
    const flightTime = distance / horizontalSpeed;
    const vy = (targetHeight - releaseY + 0.5 * gravity * flightTime * flightTime) / flightTime;
    return Math.min(maxVy, Math.max(minVy, vy));
  }
  const miss = (vy: number) =>
    heightAtDistance(releaseY, distance, horizontalSpeed, vy, gravity, dragPerMass) - targetHeight;
  if (miss(maxVy) <= 0) return maxVy;
  if (miss(minVy) >= 0) return minVy;
  let low = minVy;
  let high = maxVy;
  for (let i = 0; i < SOLVER_BISECTIONS; i += 1) {
    const mid = (low + high) / 2;
    if (miss(mid) < 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}


//  We allow the Stick to be thrown within a sphere (x,y,z) + r
export function clampToSphere(
  center: readonly [number, number, number],
  point: readonly [number, number, number],
  radius: number,
): [number, number, number] {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  const dz = point[2] - center[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= radius || distance === 0) {
    return [point[0], point[1], point[2]];
  }
  const scale = radius / distance;
  return [center[0] + dx * scale, center[1] + dy * scale, center[2] + dz * scale];
}

// Compute the target center of the stick during a drag operation, constrained within a sphere.
export function dragTargetCenter(
  pointer: readonly [number, number, number],
  grabOffset: readonly [number, number, number],
  sphereCenter: readonly [number, number, number],
  radius: number,
): [number, number, number] {
  return clampToSphere(
    sphereCenter,
    [pointer[0] - grabOffset[0], pointer[1] - grabOffset[1], pointer[2] - grabOffset[2]],
    radius,
  );
}


// Check if the stick has settled based on linear and angular velocity thresholds.
export function isStickSettled(
  linvel: readonly [number, number, number],
  angvel: readonly [number, number, number],
  axis: readonly [number, number, number],
  size: { radius: number; halfLength: number },
  threshold: number,
): boolean {
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
  const axialSpin =
    axisLength > 1e-9 ? (angvel[0] * axis[0] + angvel[1] * axis[1] + angvel[2] * axis[2]) / axisLength : 0;
  const transverseSpin = Math.sqrt(Math.max(0, angvel[0] ** 2 + angvel[1] ** 2 + angvel[2] ** 2 - axialSpin ** 2));
  return (
    Math.hypot(linvel[0], linvel[1], linvel[2]) < threshold &&
    Math.abs(axialSpin) * size.radius < threshold &&
    transverseSpin * size.halfLength < threshold
  );
}

// Point of the stock axis closest to offset. 
export function projectOntoAxis(
  offset: readonly [number, number, number],
  axis: readonly [number, number, number],
): [number, number, number] {
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
  if (axisLength < 1e-9) return [0, 0, 0];
  const along = (offset[0] * axis[0] + offset[1] * axis[1] + offset[2] * axis[2]) / (axisLength * axisLength);
  return [axis[0] * along, axis[1] * along, axis[2] * along];
}
