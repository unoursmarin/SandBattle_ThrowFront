// Pure aerodynamics of the throwing stick (no React / Rapier), applied at every physics
// step by ThrowingStick.tsx. Tuples instead of THREE vectors, like stickThrowLogic.ts.
import {
  STICK_AIR_DENSITY,
  STICK_CP_AFT_OFFSET,
  STICK_DRAG_COEFFICIENT,
  STICK_MASS,
  STICK_RADIUS,
  STICK_ROTATIONAL_DAMPING,
  STICK_SIDE_AREA,
  STICK_TIP_AREA,
  STICK_TIP_AXIS,
} from "./sceneConstants";

export type Vec3 = readonly [number, number, number];

export type DragParams = {
  /** ρ, kg/m³. */
  airDensity: number;
  /** Cd, dimensionless. */
  dragCoefficient: number;
  /** Cross-section seen head-on (velocity ∥ stick axis), m². */
  tipArea: number;
  /** Cross-section seen broadside (velocity ⟂ stick axis), m². */
  sideArea: number;
};

export const STICK_DRAG_PARAMS: DragParams = {
  airDensity: STICK_AIR_DENSITY,
  dragCoefficient: STICK_DRAG_COEFFICIENT,
  tipArea: STICK_TIP_AREA,
  sideArea: STICK_SIDE_AREA,
};

/** Portion of the momentum that a single drag impulse may remove (explicit-integration guard). */
const MAX_MOMENTUM_FRACTION = 0.9;
const EPSILON = 1e-9;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, k: number): [number, number, number] => [a[0] * k, a[1] * k, a[2] * k];

// A(θ): cross-section presented to the airflow, θ = angle between velocity and stick axis.
// A(θ) = A_tip + (A_side − A_tip)·sin²θ, from `cosAngle` = cos θ (sign irrelevant).
export function projectedArea(cosAngle: number, params: DragParams): number {
  const sin2 = 1 - Math.min(1, cosAngle * cosAngle);
  return params.tipArea + (params.sideArea - params.tipArea) * sin2;
}

// F_drag = −½·ρ·Cd·A(θ)·v²·v̂ — opposes the velocity, stronger when the stick flies broadside.
export function computeAnisotropicDrag(velocity: Vec3, axis: Vec3, params: DragParams): [number, number, number] {
  const speed = length(velocity);
  const axisLength = length(axis);
  if (speed < EPSILON || axisLength < EPSILON) return [0, 0, 0];
  const cosAngle = dot(velocity, axis) / (speed * axisLength);
  const k = 0.5 * params.airDensity * params.dragCoefficient * projectedArea(cosAngle, params);
  return scale(velocity, -k * speed);
}

// Drag impulse (F·Δt) for one physics step, capped so that it can never reverse the
// velocity, whatever the parameters (an explicit step would otherwise oscillate).
export function dragImpulse(
  velocity: Vec3,
  axis: Vec3,
  params: DragParams,
  mass: number,
  dt: number,
): [number, number, number] {
  const impulse = scale(computeAnisotropicDrag(velocity, axis, params), dt);
  const magnitude = length(impulse);
  const cap = MAX_MOMENTUM_FRACTION * mass * length(velocity);
  return magnitude > cap && magnitude > 0 ? scale(impulse, cap / magnitude) : impulse;
}

// Deceleration coefficient per mass (1/m, a = −c·|v|·v) with the mean cross-section: used
// to anticipate the drag when aiming the throw (see solveAerialVelocity).
export function meanDragPerMass(params: DragParams, mass: number): number {
  return (0.5 * params.airDensity * params.dragCoefficient * ((params.tipArea + params.sideArea) / 2)) / mass;
}

// Rotates `v` by the unit quaternion `q` (body frame → world frame).
export function rotateByQuaternion(q: { x: number; y: number; z: number; w: number }, v: Vec3): [number, number, number] {
  const [vx, vy, vz] = v;
  // t = 2·(q.xyz × v);  v' = v + w·t + q.xyz × t
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx),
  ];
}

// Caps the norm of a vector while keeping its direction.
export function clampMagnitude(v: Vec3, max: number): [number, number, number] {
  const norm = length(v);
  return norm > max && norm > 0 ? scale(v, max / norm) : [v[0], v[1], v[2]];
}

// Caps the spin about the axes ACROSS the stick (the end-over-end tumble) and leaves the spin
// about its long axis alone: clamping the whole vector would also shrink the axial snap.
export function clampTransverseSpin(angularVelocity: Vec3, axis: Vec3, maxTransverse: number): [number, number, number] {
  const axisLength = length(axis);
  if (axisLength < EPSILON) return clampMagnitude(angularVelocity, maxTransverse);
  const unit = scale(axis, 1 / axisLength);
  const axialSpin = dot(angularVelocity, unit);
  const axial = scale(unit, axialSpin);
  const transverse = clampMagnitude(
    [angularVelocity[0] - axial[0], angularVelocity[1] - axial[1], angularVelocity[2] - axial[2]],
    maxTransverse,
  );
  return [axial[0] + transverse[0], axial[1] + transverse[1], axial[2] + transverse[2]];
}

// Height (m) of the release point above the stick axis so that the impulse J = m·v gives an
// axial spin (torque = r_y·J_z about the long axis, ω = τ / I) of `spinAtReferenceSpeed`
// at `referenceSpeed`. The spin then scales with the throw speed on its own.
export function releaseSnapOffsetY(
  spinAtReferenceSpeed: number,
  axialInertia: number,
  mass: number,
  referenceSpeed: number,
): number {
  if (!(referenceSpeed > 0) || !(mass > 0)) return 0;
  return (spinAtReferenceSpeed * axialInertia) / (mass * referenceSpeed);
}

// Aerodynamic center of pressure: `aftOffset` behind the geometric center, opposite to the tip.
export function centerOfPressure(center: Vec3, tipAxis: Vec3, aftOffset: number): [number, number, number] {
  const axisLength = length(tipAxis);
  if (axisLength < EPSILON) return [center[0], center[1], center[2]];
  const k = aftOffset / axisLength;
  return [center[0] - tipAxis[0] * k, center[1] - tipAxis[1] * k, center[2] - tipAxis[2] * k];
}

// Aerodynamic damping torque τ = −c·|v|·ω⊥ (ω⊥ = transverse part of the angular velocity).
// Without it, the weathervane effect would oscillate around the trajectory forever. The
// spin about the long axis is left alone.
export function computeRotationalDamping(
  angularVelocity: Vec3,
  axis: Vec3,
  airSpeed: number,
  coefficient: number,
): [number, number, number] {
  const axisLength = length(axis);
  if (axisLength < EPSILON || airSpeed <= 0) return [0, 0, 0];
  const unit = scale(axis, 1 / axisLength);
  const axial = dot(angularVelocity, unit);
  const k = -coefficient * airSpeed;
  // `+ 0` turns a possible −0 into 0.
  return [
    (angularVelocity[0] - axial * unit[0]) * k + 0,
    (angularVelocity[1] - axial * unit[1]) * k + 0,
    (angularVelocity[2] - axial * unit[2]) * k + 0,
  ];
}

const GROUND_CONTACT_MARGIN = 0.03; // m above the resting height (STICK_RADIUS)
const GROUND_MAX_VERTICAL_SPEED = 0.3; // m/s

// Angular damping to use right now. Rapier has no rolling resistance, so a stick lying on the
// lane would roll like a log for ever: once it rests on the ground (low and not bouncing any
// more), damping is raised. Right after an impact it stays low so the tumble is not smothered.
export function groundedAngularDamping(
  centerY: number,
  verticalSpeed: number,
  airDamping: number,
  groundDamping: number,
): number {
  const isOnGround = centerY <= STICK_RADIUS + GROUND_CONTACT_MARGIN && Math.abs(verticalSpeed) < GROUND_MAX_VERTICAL_SPEED;
  return isOnGround ? groundDamping : airDamping;
}

// The subset of a Rapier rigid body used here (structural: no dependency on Rapier).
export type AerodynamicBody = {
  linvel(): { x: number; y: number; z: number };
  angvel(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
  translation(): { x: number; y: number; z: number };
  applyImpulseAtPoint(impulse: { x: number; y: number; z: number }, point: { x: number; y: number; z: number }, wakeUp: boolean): void;
  applyTorqueImpulse(torque: { x: number; y: number; z: number }, wakeUp: boolean): void;
};

// Tunable air-force parameters (injectable so tests can sweep them).
export type AerodynamicsConfig = {
  drag: DragParams;
  mass: number;
  /** Center of pressure, behind the geometric center (m). */
  cpAftOffset: number;
  rotationalDamping: number;
};

const STICK_AERODYNAMICS: AerodynamicsConfig = {
  drag: STICK_DRAG_PARAMS,
  mass: STICK_MASS,
  cpAftOffset: STICK_CP_AFT_OFFSET,
  rotationalDamping: STICK_ROTATIONAL_DAMPING,
};

// One physics step of air forces: anisotropic drag applied at the center of pressure (behind
// the center of mass → weathervane torque) plus damping of transverse rotations. Called
// before every step of a throw's replay world, so `dt` is the physics timestep.
export function applyStickAerodynamics(
  body: AerodynamicBody,
  dt: number,
  config: AerodynamicsConfig = STICK_AERODYNAMICS,
): void {
  const v = body.linvel();
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed < EPSILON) return;
  const axis = rotateByQuaternion(body.rotation(), STICK_TIP_AXIS);
  const [jx, jy, jz] = dragImpulse([v.x, v.y, v.z], axis, config.drag, config.mass, dt);
  const t = body.translation();
  const [px, py, pz] = centerOfPressure([t.x, t.y, t.z], axis, config.cpAftOffset);
  body.applyImpulseAtPoint({ x: jx, y: jy, z: jz }, { x: px, y: py, z: pz }, false);
  const w = body.angvel();
  const [tx, ty, tz] = computeRotationalDamping([w.x, w.y, w.z], axis, speed, config.rotationalDamping);
  body.applyTorqueImpulse({ x: tx * dt, y: ty * dt, z: tz * dt }, false);
}
