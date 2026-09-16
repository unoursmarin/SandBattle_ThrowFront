import { Quaternion, Vector3 } from "three";

/**
 * Maths pures du lancer de bâton (voir `useStickThrow.ts`) : aucune
 * dépendance React ni R3F — testées indépendamment
 * (tests/game/stickThrowMath.test.ts).
 *
 * Convention : le bâton est lancé EN L'AIR (jamais glissé au sol). La
 * trajectoire est une parabole balistique (gravité constante, pas de
 * frottement dans l'air) et la rotation un tungage autour d'un axe
 * horizontal perpendiculaire au lancer.
 */

/** Un échantillon de drag : position monde + horodatage `performance.now()`. */
export type DragSample = {
  position: Vector3;
  timeMs: number;
};

const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Vitesse de translation initiale : (P_récent − P_ancien) / Δt sur l'ensemble
 * du buffer glissant (plus stable que deux échantillons consécutifs, qui
 * amplifient le bruit du pointeur). Δt borné inférieurement pour ne jamais
 * diviser par ~zéro sur un relâcher instantané.
 */
export function computeReleaseVelocity(samples: readonly DragSample[], minDtSec = 1 / 60): Vector3 {
  if (samples.length < 2) return new Vector3();
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = Math.max((last.timeMs - first.timeMs) / 1000, minDtSec);
  return last.position.clone().sub(first.position).divideScalar(dt);
}

/** Borne la norme d'une vitesse (geste erratique → jamais de lancer absurde). */
export function clampSpeed(velocity: Vector3, maxSpeed: number): Vector3 {
  const speed = velocity.length();
  if (speed > maxSpeed && speed > 0) {
    velocity.multiplyScalar(maxSpeed / speed);
  }
  return velocity;
}

/**
 * Axe de tungage : horizontal, perpendiculaire à la direction du lancer
 * (`UP × v_h`), orienté pour un tungage AVANT (le haut du bâton bascule vers
 * la cible — vérifié par test : v=(0,0,−6) donne l'axe (−1,0,0)). Repli sur
 * +X pour un lancer purement vertical (aucune direction horizontale).
 */
export function computeTumbleAxis(velocity: Vector3): { axis: Vector3; horizontalSpeed: number } {
  const horizontal = new Vector3(velocity.x, 0, velocity.z);
  const horizontalSpeed = horizontal.length();
  if (horizontalSpeed < 1e-4) {
    return { axis: new Vector3(1, 0, 0), horizontalSpeed: 0 };
  }
  // `UP × h` est déjà unitaire (vecteurs unitaires perpendiculaires) : la
  // division par `horizontalSpeed` normalise le produit avec `h` non unitaire.
  const axis = new Vector3().crossVectors(WORLD_UP, horizontal).divideScalar(horizontalSpeed);
  return { axis, horizontalSpeed };
}

/**
 * Vitesse angulaire (rad/s) : ω = |v| / bras de levier (demi-longueur du
 * bâton — un bout parcourt la vitesse du lancer), plafonnée. Bras nul ou
 * négatif → aucune rotation (jamais de division par zéro).
 */
export function computeAngularSpeed(totalSpeed: number, leverArm: number, maxSpin: number): number {
  if (!(leverArm > 0) || totalSpeed <= 0) return 0;
  return Math.min(maxSpin, totalSpeed / leverArm);
}

/**
 * Parabole prévisionnelle : intégration explicite depuis (origine, vitesse),
 * arrêtée au premier point sous `groundY` (recalé pile au sol) ou à `count`
 * points. Sert la ligne de visée pendant le drag.
 */
export function sampleTrajectoryPoints(
  origin: Vector3,
  velocity: Vector3,
  gravity: number,
  groundY: number,
  count = 24,
  dt = 1 / 30,
): [number, number, number][] {
  const points: [number, number, number][] = [];
  const position = origin.clone();
  const speed = velocity.clone();
  for (let i = 0; i < count; i += 1) {
    speed.y -= gravity * dt;
    position.addScaledVector(speed, dt);
    if (position.y <= groundY) {
      points.push([position.x, groundY, position.z]);
      break;
    }
    points.push([position.x, position.y, position.z]);
  }
  return points;
}

/** Un pas de vol : gravité puis avance (Euler semi-implicite, stable ici). */
export function integrateFlightStep(position: Vector3, velocity: Vector3, gravity: number, dt: number): void {
  velocity.y -= gravity * dt;
  position.addScaledVector(velocity, dt);
}

/** Applique ω·Δt autour de `axis` au quaternion courant (tungage). */
export function applyTumble(quaternion: Quaternion, axis: Vector3, angularSpeed: number, dt: number): void {
  const step = new Quaternion().setFromAxisAngle(axis, angularSpeed * dt);
  quaternion.premultiply(step);
}
