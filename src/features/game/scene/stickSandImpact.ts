import { rotateByQuaternion } from "./stickAerodynamics";
import {
  SAND_CONTACT_SKIN,
  SAND_PLANT_DEPTH_PER_SPEED,
  SAND_PLANT_MAX_EMBEDDED_LENGTH,
  SAND_PLANT_MIN_SPEED,
  SAND_PLANT_MIN_TILT,
  SAND_SURFACE_Y,
  STICK_HALF_HEIGHT,
  STICK_RADIUS,
  STICK_TIP_AXIS,
} from "./sceneConstants";

export type SandImpactConfig = {
  surfaceY: number;
  /** Half-length of the capsule's cylindrical part, m. */
  halfHeight: number;
  radius: number;
  skin: number;
  /** Minimum |axis.y| to plant (sin of the angle between the stick and the horizontal). */
  plantMinTilt: number;
  /** Minimum vertical impact speed to plant, m/s. */
  plantMinSpeed: number;
  /** Depth of the lowest point per m/s of vertical impact speed, m. */
  depthPerSpeed: number;
  /** Most stick that can be buried, measured along its axis, m. */
  maxEmbeddedLength: number;
};

export const SAND_IMPACT_CONFIG: SandImpactConfig = {
  surfaceY: SAND_SURFACE_Y,
  halfHeight: STICK_HALF_HEIGHT,
  radius: STICK_RADIUS,
  skin: SAND_CONTACT_SKIN,
  plantMinTilt: SAND_PLANT_MIN_TILT,
  plantMinSpeed: SAND_PLANT_MIN_SPEED,
  depthPerSpeed: SAND_PLANT_DEPTH_PER_SPEED,
  maxEmbeddedLength: SAND_PLANT_MAX_EMBEDDED_LENGTH,
};

export type SandImpact =
  | { kind: "none" }
  /** Contact with the stick lying (or too slow to bury itself): stop it dead. */
  | { kind: "stop" }
  /** An end hit steeply and fast: bury it, the stick's center must be moved to `centerY`. */
  | { kind: "plant"; centerY: number };

/** Height of the lowest point of the capsule, whatever the direction of its axis (`axisY` = axis.y). */
export function lowestPointY(centerY: number, axisY: number, config: SandImpactConfig = SAND_IMPACT_CONFIG): number {
  return centerY - Math.abs(axisY) * config.halfHeight - config.radius;
}

// Below this |axis.y| the two ends are at about the same height: either one may hit the sand first.
const NEARLY_HORIZONTAL = 0.05;

// Vertical speed of the lowest end of the stick: the centre's, plus what the rotation adds at the end,
// (ω × r).y with r the vector from the centre to it. A stick tumbling end over end hits with its END,
// which can be falling far faster (or rising) than its centre. Nearly horizontal: the end going down faster. 
function lowestEndVerticalSpeed(
  axis: readonly [number, number, number],
  velocityY: number,
  angularVelocity: readonly [number, number, number],
  halfHeight: number,
): number {
  // r = side · axis · halfHeight, and (ω × r).y = ω.z · r.x − ω.x · r.z.
  const endSpeed = (side: 1 | -1) => velocityY + side * halfHeight * (angularVelocity[2] * axis[0] - angularVelocity[0] * axis[2]);
  if (Math.abs(axis[1]) < NEARLY_HORIZONTAL) return Math.min(endSpeed(1), endSpeed(-1));
  return endSpeed(axis[1] > 0 ? -1 : 1); // the end that is lower
}

export function classifySandImpact(
  input: {
    center: readonly [number, number, number];
    /** Unit axis of the stick in the world frame. */
    axis: readonly [number, number, number];
    velocity: readonly [number, number, number];
    /** Spin, rad/s (default: none). */
    angularVelocity?: readonly [number, number, number];
    dt: number;
  },
  config: SandImpactConfig = SAND_IMPACT_CONFIG,
): SandImpact {
  const { center, axis, velocity, dt } = input;
  const tilt = Math.abs(axis[1]);
  const lowest = lowestPointY(center[1], tilt, config);
  const endSpeed = lowestEndVerticalSpeed(axis, velocity[1], input.angularVelocity ?? [0, 0, 0], config.halfHeight);
  // Anticipated one step ahead (only the fall counts): act BEFORE the sand has pushed back.
  const willTouch = lowest + Math.min(0, endSpeed) * dt <= config.surfaceY + config.skin;
  if (!willTouch) return { kind: "none" };

  const impactSpeed = Math.max(0, -endSpeed);
  if (tilt < config.plantMinTilt || impactSpeed < config.plantMinSpeed) return { kind: "stop" };

  // Vertical depth of the lowest point; the buried LENGTH along the axis is depth / |axis.y|.
  const depth = Math.min(impactSpeed * config.depthPerSpeed, config.maxEmbeddedLength * tilt);
  return { kind: "plant", centerY: config.surfaceY - depth + tilt * config.halfHeight + config.radius };
}

// The subset of a Rapier rigid body used here (structural: no dependency on Rapier).
export type SandBody = {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
  linvel(): { x: number; y: number; z: number };
  angvel(): { x: number; y: number; z: number };
  setLinvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setAngvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setTranslation(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setBodyType(type: number, wakeUp: boolean): void;
};

// Applies to the body what the sand does to it, if it reaches the sand within the next step:
// "stopped" = velocities cancelled (it then finishes lying down, held by the sand's friction);
// "planted" = moved to its buried pose and frozen (`fixedBodyType` = Rapier's RigidBodyType.Fixed).
export function resolveSandImpact(
  body: SandBody,
  fixedBodyType: number,
  dt: number,
  config: SandImpactConfig = SAND_IMPACT_CONFIG,
): "none" | "stopped" | "planted" {
  const t = body.translation();
  const v = body.linvel();
  const w = body.angvel();
  const impact = classifySandImpact(
    {
      center: [t.x, t.y, t.z],
      axis: rotateByQuaternion(body.rotation(), STICK_TIP_AXIS),
      velocity: [v.x, v.y, v.z],
      angularVelocity: [w.x, w.y, w.z],
      dt,
    },
    config,
  );
  if (impact.kind === "none") return "none";
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  if (impact.kind === "stop") return "stopped";
  body.setTranslation({ x: t.x, y: impact.centerY, z: t.z }, true);
  body.setBodyType(fixedBodyType, true);
  return "planted";
}
