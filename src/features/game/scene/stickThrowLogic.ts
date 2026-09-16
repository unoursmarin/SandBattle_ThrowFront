/**
 * Logique pure du lancer aérien du bâton (voir ThrowingStick.tsx) — même
 * rôle que `ballRollLogic.ts` pour la boule : testée indépendamment
 * (tests/game/stickThrowLogic.test.ts), sans React ni Rapier.
 *
 * Le bâton est un corps `KinematicVelocityBased` : le moteur ne lui applique
 * jamais la gravité (voir ThrowingStick.tsx), donc la cloche du lancer est
 * intégrée ici à la main, à pas explicite (Euler semi-implicite : la
 * vitesse est mise à jour AVANT la position — stable pour ce cas).
 */
import { GUTTER_BOTTOM_Y, STICK_RADIUS } from "./sceneConstants.ts";
import type { LaneLayout } from "./laneSizes.ts";
export type BallisticState = {
  y: number;
  vy: number;
  landed: boolean;
};

/**
 * Vitesse verticale initiale pour traverser EXACTEMENT le point visé
 * (distance horizontale `distance`, hauteur `targetHeight`) : on impose
 * y(t) = targetHeight à t = distance / hSpeed, soit
 * vy = (target − y0 + ½·g·t²) / t. Chaque lancer légal vole ainsi jusqu'au
 * râtelier et le frappe à mi-quille — jamais de glissade sur la piste, et
 * la hauteur du lob s'adapte d'elle-même à la puissance (un lancer franc
 * part tendu, un lancer doux part en cloche). Bornée : un geste trop mou
 * pour porter jusqu'aux quilles retombe honnêtement avant (pas de
 * glissade de rattrapage), un geste nul ne décolle pas.
 */
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

/**
 * Hauteur où le bâton se plante (centre du fût) : SUR la piste (couché,
 * y = rayon), DANS la gouttière s'il a dérivé sur le côté — jamais à la
 * hauteur de lancer (le repos surélevé n'est pas un sol).
 */
export function stickGroundY(layout: LaneLayout, x: number): number {
  return Math.abs(x) <= layout.laneHalfWidth ? STICK_RADIUS : GUTTER_BOTTOM_Y + STICK_RADIUS;
}

/**
 * Replaque un point de drag dans la sphère de saisie (centre + rayon) :
 * l'utilisateur déplace le bâton librement sur x/y/z autour de sa pose de
 * repos, sans jamais pouvoir l'emmener vers les quilles.
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
