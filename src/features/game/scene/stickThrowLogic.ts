
// Here we calculate thrown  values we simulate an Euler approach
import { GUTTER_BOTTOM_Y, STICK_RADIUS } from "./sceneConstants.ts";
import type { LaneLayout } from "./laneSizes.ts";
export type BallisticState = {
  y: number;
  vy: number;
  landed: boolean;
};

// Verticlal thrown speed ( vy = (target − y0 + ½·g·t²) 
export function solveAerialVelocity(
  releaseY: number,
  distance: number,
  horizontalSpeed: number,
  targetHeight: number,
  gravity: number,
  minVy: number,
  maxVy: number,
): number {
  if (horizontalSpeed <= 0 || distance <= 0) return 0;
  const flightTime = distance / horizontalSpeed;
  const vy = (targetHeight - releaseY + 0.5 * gravity * flightTime * flightTime) / flightTime;
  return Math.min(maxVy, Math.max(minVy, vy));
}

// Offset were you plant the stick
export function stickGroundY(layout: LaneLayout, x: number): number {
  return Math.abs(x) <= layout.laneHalfWidth ? STICK_RADIUS : GUTTER_BOTTOM_Y + STICK_RADIUS;
}

/**
 * We allow the Stick to be thrown within a sphere (x,y,z) + r
 */
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

export type Vec3 = readonly [number, number, number];

/**
 *  force F applies for  Δt at r from the center of mass, v0 = F·Δt/m and
 * I = m·L²/12 for homogenic stick, hence  ω0 = 12·|r×v0|/L² around r×v0 
 * (vectorial product F⊥, . Grab in center (r≈0) →  stable throw without
 * vrille ; caught at the end → vrille maximale (Maximised).
 */
export function computeImpulseSpin(
  grabOffset: Vec3,
  velocity: Vec3,
  stickLength: number,
  maxSpin: number,
): { axis: [number, number, number] | null; angularSpeed: number } {
  const [rx, ry, rz] = grabOffset;
  const [vx, vy, vz] = velocity;
  // r × v (l'impulsion, at m/Δt near ).
  const cx = ry * vz - rz * vy;
  const cy = rz * vx - rx * vz;
  const cz = rx * vy - ry * vx;
  const crossNorm = Math.hypot(cx, cy, cz);
  if (crossNorm < 1e-9 || !(stickLength > 0)) {
    return { axis: null, angularSpeed: 0 };
  }
  const angularSpeed = Math.min(maxSpin, (12 * crossNorm) / (stickLength * stickLength));
  return { axis: [cx / crossNorm, cy / crossNorm, cz / crossNorm], angularSpeed };
}

// Stick is raised at floorY and doesn't bump so 0 resistution
export function integrateBallisticStep(
  state: BallisticState,
  floorY: number,
  gravity: number,
  dt: number,
): BallisticState {
  if (state.landed) return state;
  const vy = state.vy - gravity * dt;
  const y = state.y + vy * dt;
  if (y <= floorY && vy <= 0) {
    return { y: floorY, vy: 0, landed: true };
  }
  return { y, vy, landed: false };
}
