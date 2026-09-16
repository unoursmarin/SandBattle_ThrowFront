import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { CapsuleCollider, CoefficientCombineRule, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Quaternion, Vector3 } from "three";
import {
  GUTTER_OUTER_HALF_WIDTH,
  LANE_HALF_LENGTH,
  PIN_ANGULAR_DAMPING,
  PIN_CONTACT_SKIN,
  PIN_FRICTION,
  PIN_GRAVITY_SCALE,
  PIN_LINEAR_DAMPING,
  PIN_LOWER_CAPSULE_CENTER_Y,
  PIN_LOWER_CAPSULE_HALF_HEIGHT,
  PIN_LOWER_CAPSULE_MASS,
  PIN_LOWER_CAPSULE_RADIUS,
  PIN_RESTITUTION,
  PIN_UPPER_CAPSULE_CENTER_Y,
  PIN_UPPER_CAPSULE_HALF_HEIGHT,
  PIN_UPPER_CAPSULE_MASS,
  PIN_UPPER_CAPSULE_RADIUS,
} from "./sceneConstants";
import { isPositionOffLane } from "./pinSettleLogic";

const PIN_MODEL_URL = "/models/bowling_pin.glb";
useGLTF.preload(PIN_MODEL_URL);

const UP = new Vector3(0, 1, 0);
/** ~60° inclination: beyond this, the pin is considered fallen. */
const FALLEN_UP_DOT_THRESHOLD = 0.5;
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const LYING_ROTATION = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2.3);
const MOTION_LINEAR_THRESHOLD = 0.05;
const MOTION_ANGULAR_THRESHOLD = 0.5;
// Slight offset above the lane: prevents a pin from resting in exact interpenetration
const SPAWN_Y_OFFSET = 0.002;
// Broad bounds of the playable area: a pin ejected beyond this (thrown off-lane by a violent impact) should be considered settled immediately, without waiting for its velocity to drop below the motion thresholds. With PIN_GRAVITY_SCALE=0.4 (fall slightly slowed), a pin in the air far from the lane could take much longer than usual to pass under MOTION_LINEAR_THRESHOLD / MOTION_ANGULAR_THRESHOLD, which would delay the scoring unnecessarily (see PinRack, which excludes an "off-lane" pin from the stability wait).
const OFF_LANE_BOUNDS = {
  maxAbsX: GUTTER_OUTER_HALF_WIDTH + 0.3, // m
  maxAbsZ: LANE_HALF_LENGTH + 1, // m
  minY: -1, // m — safety net if a pin falls below the world
};

export interface PinHandle {
  /** Reads the actual inclination of the rigid body — never a React state. */
  isFallen(): boolean;
  /** True if the pin still has significant linear/angular velocity. */
  isMoving(): boolean;
  /** True if the pin is out of the playable area (see OFF_LANE_*). */
  isOffLane(): boolean;
  /**
   * True if the pin should no longer be counted as "standing" for the score:
   * fallen (see `isFallen`) OR off-lane (see `isOffLane`). 
   */
  isOutOfPlay(): boolean;
  /** Raises pin to its original position, resets velocities, and reintegrates it into the game (see `retire`). */
  reset(): void;
  /** Instantly lays the pin down (synchronization of a remote throw, see PinRack), then removes it (see `retire`). */
  forceDown(): void;
  /**
   * Removes the pin from the game for the rest of the round: disabled
   * (no more collision, `RigidBody.setEnabled(false)`) and hidden, so that
   * it no longer interferes with the ball or other pins on subsequent
   * throws of the same round. Reversed by `reset()` at the beginning of the
   * next round (fresh rack).
   */
  retire(): void;
}

// Colliders for the pin: two stacked `CapsuleCollider`s (wide bottom, narrow top) rather than an encompassing `cuboid` or a collision mesh. See sceneConstants.ts for detailed measurements/masses and reasoning about the lowered center of mass. Modularized separately from `Pin` to clearly separate collision geometry from game logic.
function PinColliders() {
  return (
    <>
      <CapsuleCollider
        args={[PIN_LOWER_CAPSULE_HALF_HEIGHT, PIN_LOWER_CAPSULE_RADIUS]}
        position={[0, PIN_LOWER_CAPSULE_CENTER_Y, 0]}
        mass={PIN_LOWER_CAPSULE_MASS}
        friction={PIN_FRICTION}
        restitution={PIN_RESTITUTION}
        frictionCombineRule={CoefficientCombineRule.Min}
        contactSkin={PIN_CONTACT_SKIN}
      />
      <CapsuleCollider
        args={[PIN_UPPER_CAPSULE_HALF_HEIGHT, PIN_UPPER_CAPSULE_RADIUS]}
        position={[0, PIN_UPPER_CAPSULE_CENTER_Y, 0]}
        mass={PIN_UPPER_CAPSULE_MASS}
        friction={PIN_FRICTION}
        restitution={PIN_RESTITUTION}
        frictionCombineRule={CoefficientCombineRule.Min}
        contactSkin={PIN_CONTACT_SKIN}
      />
    </>
  );
}

/**
 * Physical pin: dynamic rigid body toppled by real collision with the ball (see docs/architecture/3d-rendering.md) — no more scripted lerp. `PinRack` queries `isOutOfPlay()` on each pin once the ball is stationary to count pins no longer in play for that throw (fallen or off-lane, see `isOutOfPlay`).
 */
export const Pin = forwardRef<PinHandle, { position: [number, number, number]; bounds?: typeof OFF_LANE_BOUNDS }>(function Pin(
  { position, bounds = OFF_LANE_BOUNDS },
  ref,
) {
  const { scene } = useGLTF(PIN_MODEL_URL);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const rigidBodyRef = useRef<RapierRigidBody>(null);

  function isFallen(): boolean {
    const body = rigidBodyRef.current;
    if (!body) return false;
    const q = body.rotation();
    const localUp = UP.clone().applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
    return localUp.dot(UP) < FALLEN_UP_DOT_THRESHOLD;
  }

  function isOffLane(): boolean {
    const body = rigidBodyRef.current;
    if (!body) return false;
    return isPositionOffLane(body.translation(), bounds);
  }

  useImperativeHandle(ref, () => ({
    isFallen,
    isMoving() {
      const body = rigidBodyRef.current;
      if (!body) return false;
      const lin = body.linvel();
      const ang = body.angvel();
      return (
        Math.hypot(lin.x, lin.y, lin.z) > MOTION_LINEAR_THRESHOLD ||
        Math.hypot(ang.x, ang.y, ang.z) > MOTION_ANGULAR_THRESHOLD
      );
    },
    isOffLane,
    isOutOfPlay() {
      return isFallen() || isOffLane();
    },
    reset() {
      const body = rigidBodyRef.current;
      if (!body) return;
      body.setTranslation({ x: position[0], y: position[1] + SPAWN_Y_OFFSET, z: position[2] }, true);
      body.setRotation(IDENTITY_ROTATION, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setEnabled(true);
      clonedScene.visible = true;
    },
    forceDown() {
      const body = rigidBodyRef.current;
      if (!body) return;
      body.setEnabled(true); // le corps doit être actif pour repositionner sa pose avant de le retirer
      body.setTranslation({ x: position[0], y: position[1] + SPAWN_Y_OFFSET, z: position[2] }, true);
      body.setRotation(LYING_ROTATION, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setEnabled(false);
      clonedScene.visible = false;
    },
    retire() {
      const body = rigidBodyRef.current;
      if (!body) return;
      body.setEnabled(false);
      clonedScene.visible = false;
    },
  }));

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={[position[0], position[1] + SPAWN_Y_OFFSET, position[2]]}
      colliders={false}
      linearDamping={PIN_LINEAR_DAMPING}
      angularDamping={PIN_ANGULAR_DAMPING}
      gravityScale={PIN_GRAVITY_SCALE}
    >
      <PinColliders />
      <primitive object={clonedScene} />
    </RigidBody>
  );
});
