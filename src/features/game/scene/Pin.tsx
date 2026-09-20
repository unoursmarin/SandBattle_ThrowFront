import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { CapsuleCollider, CoefficientCombineRule, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import {
  GUTTER_OUTER_HALF_WIDTH,
  LANE_HALF_LENGTH,
  PIN_CONTACT_SKIN,
  PIN_FRICTION,
  PIN_LOWER_CAPSULE_CENTER_Y,
  PIN_LOWER_CAPSULE_HALF_HEIGHT,
  PIN_OFF_LANE_MARGIN,
  PIN_SPAWN_Y_OFFSET,
  PIN_LOWER_CAPSULE_MASS,
  PIN_LOWER_CAPSULE_RADIUS,
  PIN_RESTITUTION,
  PIN_UPPER_CAPSULE_CENTER_Y,
  PIN_UPPER_CAPSULE_HALF_HEIGHT,
  PIN_UPPER_CAPSULE_MASS,
  PIN_UPPER_CAPSULE_RADIUS,
} from "./sceneConstants";
import { createPinController, type PinBodyPose, type PinHandle } from "./pinController";

export type { PinBodyPose, PinHandle };

export const PIN_MODEL_URL = "/models/bowling_pin.glb";
useGLTF.preload(PIN_MODEL_URL);

// Broad bounds of the playable area: a pin beyond this is out of play, whatever its pose.
const OFF_LANE_BOUNDS = {
  maxAbsX: GUTTER_OUTER_HALF_WIDTH + PIN_OFF_LANE_MARGIN, // m — beyond the gutter, a pin rests on the sand
  maxAbsZ: LANE_HALF_LENGTH + PIN_OFF_LANE_MARGIN, // m
  minY: -1, // m — safety net if a pin falls below the world
};

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
 * A pin of the scene's rack. It is INERT: a fixed body whose pose is set by code (a fresh frame, or
 * where a replayed throw left it), never by physics: the physics of a throw is played in a private
 * world (see replay/replayWorld.ts). `PinRack` asks each pin `isOutOfPlay()` to count the ones that
 * still stand (retired, fallen or off the playable area do not).
 */
export const Pin = forwardRef<PinHandle, { position: [number, number, number]; bounds?: typeof OFF_LANE_BOUNDS }>(function Pin(
  { position, bounds = OFF_LANE_BOUNDS },
  ref,
) {
  const { scene } = useGLTF(PIN_MODEL_URL);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  // The pin's behaviour is in pinController.ts (testable without a scene); it reads the body at every call.
  const controller = useMemo(
    () => createPinController({ getBody: () => rigidBodyRef.current, view: clonedScene, spot: position, bounds }),
    [clonedScene, position, bounds],
  );
  useImperativeHandle(ref, () => controller, [controller]);

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={[position[0], position[1] + PIN_SPAWN_Y_OFFSET, position[2]]}
      // FIXED: a pin here never moves by itself. Where it stands is decided by code (reset, or where a replayed throw left it).
      type="fixed"
      colliders={false}
    >
      <PinColliders />
      <primitive object={clonedScene} />
    </RigidBody>
  );
});
