// The private physics world a throw is played in. It is BUILT from scratch, with the game's own
// constants, out of the launch variables and the state of the rack: every client (the thrower's own
// scene included) builds the same world the same way and plays the same code in it, so all of them
// get the same throw, bit for bit. Nothing of the scene's live physics is involved.
import type * as Rapier from "@dimforge/rapier3d-compat";

import type { PinPose } from "@/lib/api/schemas";
import { buildGutterColliderSpecs } from "../scene/laneColliders";
import type { LaneLayout } from "../scene/laneSizes";
import { buildPinPositions } from "../scene/pinPositions";
import * as C from "../scene/sceneConstants";
import { STICK_MASS_PROPERTIES } from "../scene/stickMassProperties";

// The part of the Rapier module a replay needs (what `useRapier().rapier` and a plain import both provide). 
export type RapierModule = Pick<typeof Rapier, "World" | "RigidBodyDesc" | "ColliderDesc" | "CoefficientCombineRule">;

export type ReplayBodies = {
  world: Rapier.World;
  // The pins, by index (a retired pin exists but is disabled). 
  pins: Rapier.RigidBody[];
  // The thrown stick or ball, parked at its rest position until the throw starts. 
  projectile: Rapier.RigidBody;
};

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

// Same limits as the scene's <Physics>: gravity, and the solver iterations the pins were tuned with. 
const GRAVITY = { x: 0, y: -9.81, z: 0 };
const SOLVER_ITERATIONS = 24;
const INTERNAL_PGS_ITERATIONS = 8;

export function buildReplayWorld(
  rapier: RapierModule,
  layout: LaneLayout,
  projectile: "stick" | "ball",
  rack: readonly PinPose[],
): ReplayBodies {
  const world = new rapier.World(GRAVITY);
  world.numSolverIterations = SOLVER_ITERATIONS;
  world.numInternalPgsIterations = INTERNAL_PGS_ITERATIONS;

  addGround(rapier, world, layout);
  const pins = addPins(rapier, world, layout, rack);
  const body = projectile === "stick" ? addStick(rapier, world, layout) : addBall(rapier, world, layout);
  return { world, pins, projectile: body };
}

function addGround(rapier: RapierModule, world: Rapier.World, layout: LaneLayout): void {
  const { ColliderDesc, RigidBodyDesc, CoefficientCombineRule } = rapier;
  const ground = world.createRigidBody(RigidBodyDesc.fixed());
  world.createCollider(
    ColliderDesc.cuboid(C.BEACH_HALF_WIDTH, 0.5, C.BEACH_HALF_LENGTH)
      .setTranslation(0, C.SAND_SURFACE_Y - 0.5, 0)
      .setFriction(C.SAND_FRICTION)
      .setFrictionCombineRule(CoefficientCombineRule.Max)
      .setRestitution(C.SAND_RESTITUTION),
    ground,
  );
  world.createCollider(
    ColliderDesc.cuboid(layout.laneHalfWidth, C.LANE_SURFACE_HALF_THICKNESS, layout.laneHalfLength)
      .setTranslation(0, -C.LANE_SURFACE_HALF_THICKNESS, 0)
      .setFriction(C.LANE_SURFACE_FRICTION)
      .setFrictionCombineRule(CoefficientCombineRule.Min)
      .setRestitution(C.LANE_SURFACE_RESTITUTION),
    ground,
  );
  for (const side of [1, -1] as const) {
    for (const spec of buildGutterColliderSpecs(side, layout)) {
      // The gutter walls only tilt about Z.
      const tilt = spec.rotation[2] / 2;
      world.createCollider(
        ColliderDesc.cuboid(...spec.args)
          .setTranslation(...spec.position)
          .setRotation({ x: 0, y: 0, z: Math.sin(tilt), w: Math.cos(tilt) })
          .setFriction(C.GUTTER_FRICTION)
          .setFrictionCombineRule(CoefficientCombineRule.Max)
          .setRestitution(C.GUTTER_RESTITUTION),
        ground,
      );
    }
  }
}

function addPins(rapier: RapierModule, world: Rapier.World, layout: LaneLayout, rack: readonly PinPose[]): Rapier.RigidBody[] {
  const { ColliderDesc, RigidBodyDesc, CoefficientCombineRule } = rapier;
  const capsule = (halfHeight: number, radius: number, centerY: number, mass: number) =>
    ColliderDesc.capsule(halfHeight, radius)
      .setTranslation(0, centerY, 0)
      .setMass(mass)
      .setFriction(C.PIN_FRICTION)
      .setFrictionCombineRule(CoefficientCombineRule.Min)
      .setRestitution(C.PIN_RESTITUTION);

  return buildPinPositions(layout).map(([nx, ny, nz], index) => {
    const pose = rack.find((p) => p.index === index);
    const p = pose?.position ?? { x: nx, y: ny + C.PIN_SPAWN_Y_OFFSET, z: nz };
    const q = pose?.rotation ?? IDENTITY;
    const body = world.createRigidBody(
      RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation(q)
        .setLinearDamping(C.PIN_LINEAR_DAMPING)
        .setAngularDamping(C.PIN_ANGULAR_DAMPING)
        .setGravityScale(C.PIN_GRAVITY_SCALE),
    );
    world.createCollider(
      capsule(C.PIN_LOWER_CAPSULE_HALF_HEIGHT, C.PIN_LOWER_CAPSULE_RADIUS, C.PIN_LOWER_CAPSULE_CENTER_Y, C.PIN_LOWER_CAPSULE_MASS),
      body,
    );
    world.createCollider(
      capsule(C.PIN_UPPER_CAPSULE_HALF_HEIGHT, C.PIN_UPPER_CAPSULE_RADIUS, C.PIN_UPPER_CAPSULE_CENTER_Y, C.PIN_UPPER_CAPSULE_MASS),
      body,
    );
    // A pin retired after an earlier roll of the frame is not in the game (nor is one the rack does not mention).
    if (!pose || !pose.standing) body.setEnabled(false);
    return body;
  });
}

function addStick(rapier: RapierModule, world: Rapier.World, layout: LaneLayout): Rapier.RigidBody {
  const { ColliderDesc, RigidBodyDesc, CoefficientCombineRule } = rapier;
  const { mass, comX, axialInertia, transverseInertia } = STICK_MASS_PROPERTIES;
  const stick = world.createRigidBody(
    RigidBodyDesc.dynamic()
      .setTranslation(...layout.stickRest)
      .setLinearDamping(C.STICK_LINEAR_DAMPING)
      .setAngularDamping(C.STICK_ANGULAR_DAMPING)
      .setCcdEnabled(true),
  );
  // The capsule's axis is the collider's local Y, i.e. the body's −X: the tip (+X) is at local −comX.
  world.createCollider(
    ColliderDesc.capsule(C.STICK_HALF_HEIGHT, C.STICK_RADIUS)
      .setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 })
      .setMassProperties(
        mass,
        { x: 0, y: -comX, z: 0 },
        { x: transverseInertia, y: axialInertia, z: transverseInertia },
        IDENTITY,
      )
      .setFriction(C.STICK_FRICTION)
      .setFrictionCombineRule(CoefficientCombineRule.Max)
      .setRestitution(C.STICK_RESTITUTION)
      .setRestitutionCombineRule(CoefficientCombineRule.Min),
    stick,
  );
  return stick;
}

// The ball is a kinematic body driven by hand (see ballThrowSim.ts): it pushes the pins, they never deflect it. 
function addBall(rapier: RapierModule, world: Rapier.World, layout: LaneLayout): Rapier.RigidBody {
  const { ColliderDesc, RigidBodyDesc, CoefficientCombineRule } = rapier;
  const ball = world.createRigidBody(RigidBodyDesc.kinematicVelocityBased().setTranslation(...layout.ballRest));
  world.createCollider(
    ColliderDesc.ball(C.BALL_RADIUS)
      .setFriction(0.2)
      .setFrictionCombineRule(CoefficientCombineRule.Min)
      .setRestitution(0)
      .setRestitutionCombineRule(CoefficientCombineRule.Min),
    ball,
  );
  return ball;
}
