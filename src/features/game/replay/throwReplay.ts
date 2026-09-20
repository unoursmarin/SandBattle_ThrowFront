import type { RigidBody, World } from "@dimforge/rapier3d-compat";
import { PIN_LOWER_CAPSULE_RADIUS, PIN_ROLLING_DECEL } from "../scene/sceneConstants";
import { applyRollingResistance, ROLLING_MAX_VERTICAL_SPEED } from "../scene/rollingResistance";
import { PHYSICS_TIMESTEP } from "../scene/stickThrowSim";
import { isOnGround } from "./groundContact";
import { WORLD_FLOOR_Y } from "./replayOutcome";
import type { ReplayBodies } from "./replayWorld";

export type BodyPose = {
  position: [number, number, number];
  rotation: [number, number, number, number];
};

export type PinReplayPose = BodyPose & { enabled: boolean };

/** What differs between projectiles: how the throw starts, the code run around every step, and when it is over. */
export type ProjectileStrategy = {
  /** Once, when the replay is created: puts the projectile in flight. */
  start(world: World, projectile: RigidBody): void;
  /** Before every physics step. */
  beforeStep(projectile: RigidBody): void;
  /** Whether the projectile has come to rest. */
  isSettled(projectile: RigidBody): boolean;
};

/** Same limits as a real roll (MAX_ROLL_DURATION): a replay always ends. */
const MAX_STEPS = 22 * 60;
const CALM_STEPS = 30;
const PIN_CALM_LINEAR = 0.05;
const PIN_CALM_ANGULAR = 0.5;

export class ThrowReplay {
  private readonly world: World;
  private readonly projectile: RigidBody;
  private readonly pins: RigidBody[];
  private readonly strategy: ProjectileStrategy;
  private calmSteps = 0;
  private steps = 0;
  private done = false;

  constructor(bodies: ReplayBodies, strategy: ProjectileStrategy) {
    this.world = bodies.world;
    this.projectile = bodies.projectile;
    this.pins = bodies.pins;
    this.strategy = strategy;
    strategy.start(this.world, this.projectile);
  }

  get stepsDone(): number {
    return this.steps;
  }

  get finished(): boolean {
    return this.done;
  }

  /**
   * Simulates up to `elapsedSeconds` of the throw. Driven by the clock, not by the frame rate: the
   * number of steps and their order never depend on how often this is called. `maxSteps` bounds the
   * work of one call (a late frame must not stall on a burst of catch-up steps): the rest comes later.
   */
  advanceTo(elapsedSeconds: number, maxSteps = Infinity): void {
    const target = Math.min(MAX_STEPS, Math.floor(elapsedSeconds / PHYSICS_TIMESTEP), this.steps + maxSteps);
    while (!this.done && this.steps < target) this.stepOnce();
  }

  /** How far the simulation is behind the clock, in seconds (0 once it has caught up). */
  lagBehind(elapsedSeconds: number): number {
    return this.done ? 0 : Math.max(0, elapsedSeconds - this.steps * PHYSICS_TIMESTEP);
  }

  private stepOnce(): void {
    this.strategy.beforeStep(this.projectile);
    this.gripPins();
    this.world.step();
    this.steps += 1;
    this.calmSteps = this.strategy.isSettled(this.projectile) && this.pinsAtRest() ? this.calmSteps + 1 : 0;
    if (this.calmSteps >= CALM_STEPS || this.steps >= MAX_STEPS) this.done = true;
  }

  // The lane (or the sand) grips a pin that rolls or spins on it: without this, a fallen pin rolls on for ever. 
  private gripPins(): void {
    for (const pin of this.pins) {
      if (!pin.isEnabled() || pin.isSleeping()) continue;
      const v = pin.linvel();
      if (Math.abs(v.y) >= ROLLING_MAX_VERTICAL_SPEED || !canRoll(pin.rotation()) || !isOnGround(this.world, pin)) continue;
      applyRollingResistance(pin, PIN_ROLLING_DECEL, PIN_LOWER_CAPSULE_RADIUS, PHYSICS_TIMESTEP);
    }
  }

  private pinsAtRest(): boolean {
    return this.pins.every((pin) => {
      if (!pin.isEnabled() || pin.translation().y < WORLD_FLOOR_Y) return true;
      const lin = pin.linvel();
      const ang = pin.angvel();
      return Math.hypot(lin.x, lin.y, lin.z) < PIN_CALM_LINEAR && Math.hypot(ang.x, ang.y, ang.z) < PIN_CALM_ANGULAR;
    });
  }

  projectilePose(): BodyPose {
    return poseOf(this.projectile);
  }

  pinPoses(): PinReplayPose[] {
    return this.pins.map((pin) => ({ ...poseOf(pin), enabled: pin.isEnabled() }));
  }

  // Frees the private world. 
  dispose(): void {
    this.world.free();
  }
}

//Cosine of the tilt beyond which a pin can roll (~26°): a pin that is nearly upright slides, and is left to friction. 
const ROLLING_TILT_UP_DOT = 0.9;

// A pin lying down, or tilted enough to roll on its rim: that is the one that rolls on for ever. 
function canRoll(q: { x: number; z: number }): boolean {
  return 1 - 2 * (q.x * q.x + q.z * q.z) < ROLLING_TILT_UP_DOT;
}

function poseOf(body: RigidBody): BodyPose {
  const t = body.translation();
  const q = body.rotation();
  return { position: [t.x, t.y, t.z], rotation: [q.x, q.y, q.z, q.w] };
}