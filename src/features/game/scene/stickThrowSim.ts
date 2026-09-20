import {
  STICK_ANGULAR_DAMPING,
  STICK_GROUND_ANGULAR_DAMPING,
  STICK_RADIUS,
  STICK_ROLLING_DECEL,
  STICK_SNAP_SPIN,
  STICK_TIP_AXIS,
} from "./sceneConstants";
import { applyRollingResistance, ROLLING_MAX_VERTICAL_SPEED, type RollingBody } from "./rollingResistance";
import {
  applyStickAerodynamics,
  clampTransverseSpin,
  groundedAngularDamping,
  releaseSnapOffsetY,
  type AerodynamicBody,
} from "./stickAerodynamics";
import { STICK_MASS_PROPERTIES } from "./stickMassProperties";
import { resolveSandImpact, type SandBody } from "./stickSandImpact";
import { projectOntoAxis } from "./stickThrowLogic";

// Fixed <Physics> timestep (R3F default). 
export const PHYSICS_TIMESTEP = 1 / 60; // s
// Most spin (rad/s) a throw can give the stick end over end. 
export const MAX_SPIN = 12;
// The throw speed at which the finger snap gives STICK_SNAP_SPIN. 
export const MAX_THROW_SPEED = 12; // m/s
// Rapier's `RigidBodyType.Fixed`. 
const FIXED_BODY_TYPE = 1;

// Everything that defines a stick throw from the instant it leaves the hand. 
export type StickLaunch = {
  // Position of the stick's centre at the release, m. 
  origin: readonly [number, number, number];
  // Launch velocity, m/s (the vertical part is the solved lob).
  velocity: readonly [number, number, number];
  // Where the stick was held along its axis, m from its centre.  
  gripOffset: number;
};

  // Represents a pending release of the stick, including the impulse to apply and the grip point relative to the stick's centre.
export type PendingRelease = {
  impulse: [number, number, number];
  grip: [number, number, number];
};

export type SandState = "flying" | "stopped" | "planted";

// The finger release is modeled as an impulse applied at the held point, slightly above the stick's axis, which imparts both linear and angular momentum to the stick.
export function pendingFromLaunch(launch: StickLaunch): PendingRelease {
  const mass = STICK_MASS_PROPERTIES.mass;
  const snapY = releaseSnapOffsetY(STICK_SNAP_SPIN, STICK_MASS_PROPERTIES.axialInertia, mass, MAX_THROW_SPEED);
  const [gx, gy, gz] = projectOntoAxis([launch.gripOffset, 0, 0], STICK_TIP_AXIS);
  return {
    impulse: [mass * launch.velocity[0], mass * launch.velocity[1], mass * launch.velocity[2]],
    grip: [gx, gy + snapY, gz],
  };
}

export type StickSimBody = SandBody &
  AerodynamicBody &
  RollingBody & {
    setAngularDamping(damping: number): void;
  };

// Before every physics step of a stick in flight: the sand (stops it dead, or plants it), rolling
// resistance once it lies on the ground (`grounded`: Rapier reports a contact with it), then the air
// forces. Returns the new sand state.
export function stickBeforeStep(body: StickSimBody, sand: SandState, grounded = false): SandState {
  if (sand === "planted") return sand;
  let next: SandState = sand;
  if (sand === "flying") {
    const impact = resolveSandImpact(body, FIXED_BODY_TYPE, PHYSICS_TIMESTEP);
    if (impact !== "none") next = impact;
    if (impact === "planted") return next;
  }
  body.setAngularDamping(
    groundedAngularDamping(body.translation().y, body.linvel().y, STICK_ANGULAR_DAMPING, STICK_GROUND_ANGULAR_DAMPING),
  );
  if (grounded && Math.abs(body.linvel().y) < ROLLING_MAX_VERTICAL_SPEED) {
    applyRollingResistance(body, STICK_ROLLING_DECEL, STICK_RADIUS, PHYSICS_TIMESTEP);
  }
  applyStickAerodynamics(body, PHYSICS_TIMESTEP);
  return next;
}

// Right after the first physics step that follows the release, when the body is really dynamic
// (applyImpulse* is a silent no-op before): cancel that step's tiny fall, then apply the throw.
export function stickAfterFirstStep(body: StickSimBody, pending: PendingRelease): void {
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  const origin = body.translation();
  const [ix, iy, iz] = pending.impulse;
  const [gx, gy, gz] = pending.grip;
  body.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, { x: origin.x + gx, y: origin.y + gy, z: origin.z + gz }, true);
  const w = body.angvel();
  const [sx, sy, sz] = clampTransverseSpin([w.x, w.y, w.z], STICK_TIP_AXIS, MAX_SPIN);
  body.setAngvel({ x: sx, y: sy, z: sz }, true);
}
