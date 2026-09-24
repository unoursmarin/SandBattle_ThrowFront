import { useEffect, useMemo, useRef, useState } from "react";
import { CoefficientCombineRule, RigidBodyType } from "@dimforge/rapier3d-compat";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  CapsuleCollider,
  RigidBody,
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import { Plane, Vector3 } from "three";
import {
  BEACH_HALF_LENGTH,
  BEACH_HALF_WIDTH,
  STICK_ANGULAR_DAMPING,
  STICK_FRICTION,
  STICK_GROUND_ANGULAR_DAMPING,
  STICK_HALF_HEIGHT,
  STICK_LENGTH,
  STICK_LINEAR_DAMPING,
  STICK_RADIUS,
  STICK_RESTITUTION,
  STICK_SETTLE_SPEED,
  STICK_SNAP_SPIN,
  STICK_TIP_AXIS,
} from "./sceneConstants";
import type { LaneLayout } from "./laneSizes";
import { shouldEndRoll } from "./ballRollLogic";
import {
  applyStickAerodynamics,
  clampTransverseSpin,
  groundedAngularDamping,
  meanDragPerMass,
  releaseSnapOffsetY,
  rotateByQuaternion,
  STICK_DRAG_PARAMS,
} from "./stickAerodynamics";
import { STICK_MASS_PROPERTIES } from "./stickMassProperties";
import { resolveSandImpact } from "./stickSandImpact";
import {
  dragTargetCenter,
  isStickOutOfPlay,
  isStickSettled,
  projectOntoAxis,
  solveAerialVelocity,
} from "./stickThrowLogic";

const STICK_MODEL_URL = "/models/throwing_stick.glb";
useGLTF.preload(STICK_MODEL_URL);

const MAX_DRAG_RADIUS = 0.6;
const MAX_THROW_SPEED = 12; // m/s
const LATERAL_GESTURE_DAMPING = 0.4;
const MIN_THROW_SPEED = 0.6;
const VELOCITY_HISTORY_MS = 120;
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const SETTLE_DURATION_MS = 300;
const ROLL_END_GRACE_MS = 3000;
const MAX_ROLL_DURATION_MS = 14000;
const ABSOLUTE_MAX_ROLL_DURATION_MS = 22000;
const STICK_GRAVITY = 9.81; // m/s² — same as <Physics gravity> in BowlingScene, used to aim the lob
const STICK_STRIKE_HEIGHT = 0.15; // m  
const MAX_LOB = 7.5; // m/s — 
const MIN_LOB_VY = -2; // m/s — a throw can go down
const MAX_SPIN = 12; // rad/s
/** Fixed <Physics> timestep R3F default. */
const PHYSICS_TIMESTEP = 1 / 60; // s
// Length max  the stick can fall to
const OUT_OF_PLAY_MIN_Y = -1.5; // m
const OUT_OF_PLAY_EDGE_MARGIN = 0.3; // m past the edge of the beach plateau

/** Drag anticipated when aiming the lob (mean cross-section, see meanDragPerMass). */
const AIM_DRAG_PER_MASS = meanDragPerMass(STICK_DRAG_PARAMS, STICK_MASS_PROPERTIES.mass);
/**
 * Hand release snap: the impulse is applied this high above the stick axis, which gives an
 * axial spin of STICK_SNAP_SPIN rad/s at MAX_THROW_SPEED (scales with the throw speed).
 */
const SNAP_OFFSET_Y = releaseSnapOffsetY(
  STICK_SNAP_SPIN,
  STICK_MASS_PROPERTIES.axialInertia,
  STICK_MASS_PROPERTIES.mass,
  MAX_THROW_SPEED,
);

type Phase = "resting" | "held" | "rolling";

type PointerSample = { x: number; z: number; t: number };

// Throwing stick : dragged as a kinematic body (the grabbed point follows the pointer), then
// released as a DYNAMIC body: the throw is an impulse applied at the grabbed point, and Rapier
// simulates gravity, spin, contacts and tumbling. Air forces: see stickAerodynamics.ts.
export function ThrowingStick({
  canThrow,
  onDragChange,
  onSettled,
  arePinsSettled,
  layout,
}: {
  canThrow: boolean;
  onDragChange: (isDragging: boolean) => void;
  onSettled: () => void;
  arePinsSettled: () => boolean;
  /** Dimension of the current lane cf laneSizes.ts). */
  layout: LaneLayout;
}) {
  const { scene } = useGLTF(STICK_MODEL_URL);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [phase, setPhaseState] = useState<Phase>("resting");
  const historyRef = useRef<PointerSample[]>([]);
  const settledSinceRef = useRef<number | null>(null);
  // Detects end of the throw
  const endDetectedAtRef = useRef<number | null>(null);
  const rollingSinceRef = useRef(0);
  // phaseRef` synchrone, same ref as in Ball.tsx
  const phaseRef = useRef<Phase>("resting");
  function setPhase(next: Phase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  
  // rest position of the stick
  const rest = layout.stickRest;
  const camera = useThree((state) => state.camera);
  //Dragging plane for the stick
  const dragPlaneRef = useRef<Plane | null>(null);
  // Offset from the body origin (geometric center) to the grab point: keeps the grabbed point under the pointer while dragging, and is the lever arm of the release impulse.
  const grabOffsetRef = useRef<[number, number, number]>([0, 0, 0]);
  // What the sand did to the stick during this throw (it happens once): still flying, stopped dead, or planted.
  const sandStateRef = useRef<"flying" | "stopped" | "planted">("flying");
  // Throw impulse waiting for the first physics step after the release (see useAfterPhysicsStep).
  const pendingReleaseRef = useRef<{
    impulse: [number, number, number];
    grip: [number, number, number];
  } | null>(null);

  // Unmounted mid-drag: give the camera controls and the cursor back.
  useEffect(
    () => () => {
      if (phaseRef.current === "held") {
        onDragChange(false);
        document.body.style.cursor = "auto";
      }
    },
    [],
  );

  useEffect(() => {
    if (!canThrow && document.body.style.cursor === "grab") {
      document.body.style.cursor = "auto";
    }
  }, [canThrow]);

  // Projects the pointer onto the drag plane and returns where the stick CENTER must be so
  // that the grabbed point stays under the pointer (clamped within the grab sphere).
  function dragPoint(event: ThreeEvent<PointerEvent>): Vector3 | null {
    const plane = dragPlaneRef.current;
    if (!plane) return null;
    const hit = new Vector3();
    if (!event.ray.intersectPlane(plane, hit)) return null;
    const [x, y, z] = dragTargetCenter(
      [hit.x, hit.y, hit.z],
      grabOffsetRef.current,
      rest,
      MAX_DRAG_RADIUS,
    );
    return new Vector3(x, y, z);
  }

  function handlePointerOver(event: ThreeEvent<PointerEvent>) {
    if (!canThrow || phase !== "resting") return;
    event.stopPropagation();
    document.body.style.cursor = "grab";
  }

  function handlePointerOut() {
    if (phase === "resting") {
      document.body.style.cursor = "auto";
    }
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (!canThrow || phase !== "resting") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    // Camera-facing plane passing through the grab point (see dragPoint).
    const normal = new Vector3();
    camera.getWorldDirection(normal).negate();
    dragPlaneRef.current = new Plane().setFromNormalAndCoplanarPoint(normal, event.point);
    // Grab point minus body origin (see grabOffsetRef).
    const com = rigidBodyRef.current?.translation();
    grabOffsetRef.current = com
      ? [event.point.x - com.x, event.point.y - com.y, event.point.z - com.z]
      : [0, 0, 0];
    historyRef.current = [];
    setPhase("held");
    onDragChange(true);
    document.body.style.cursor = "grabbing";
    rigidBodyRef.current?.setBodyType(RigidBodyType.KinematicPositionBased, true);
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    if (phase !== "held") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const dragged = dragPoint(event);
    const body = rigidBodyRef.current;
    if (!dragged || !body) return;

    body.setNextKinematicTranslation({ x: dragged.x, y: dragged.y, z: dragged.z });

    const now = performance.now();
    const history = historyRef.current;
    history.push({ x: dragged.x, z: dragged.z, t: now });
    while (history.length > 0 && now - history[0].t > VELOCITY_HISTORY_MS) {
      history.shift();
    }
  }

  // Aborts the current drag gesture, returning the stick to its resting position and resetting its physical state.
  function abortDrag() {
    if (phaseRef.current !== "held") return;
    historyRef.current = [];
    onDragChange(false);
    document.body.style.cursor = "auto";
    const body = rigidBodyRef.current;
    if (body) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setTranslation({ x: rest[0], y: rest[1], z: rest[2] }, true);
      body.setRotation(IDENTITY_ROTATION, true);
      body.setBodyType(RigidBodyType.Fixed, true);
    }
    setPhase("resting");
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (phase !== "held") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    // Leave "held" BEFORE releasing the capture: releasing fires lostpointercapture, which
    // abortDrag() must not mistake for a lost gesture.
    setPhase("rolling");
    (event.target as Element).releasePointerCapture(event.pointerId);
    onDragChange(false);
    document.body.style.cursor = "auto";

    const body = rigidBodyRef.current;
    const history = historyRef.current;
    let vx = 0;
    let vz = 0;
    if (body && history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      const dt = Math.max((last.t - first.t) / 1000, 1 / 60);
      vx = ((last.x - first.x) / dt) * LATERAL_GESTURE_DAMPING;
      vz = (last.z - first.z) / dt;
    }

    const speed = Math.hypot(vx, vz);
    if (speed > MAX_THROW_SPEED) {
      const scale = MAX_THROW_SPEED / speed;
      vx *= scale;
      vz *= scale;
    } else if (speed < MIN_THROW_SPEED) {
      vx = 0;
      vz = 0;
    }

    rollingSinceRef.current = performance.now();
    sandStateRef.current = "flying";
    settledSinceRef.current = null;

    if (body) {
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const hSpeed = Math.hypot(vx, vz);
      // No gesture (or too soft): the stick is simply dropped where it was released.
      if (hSpeed > 0) {
        const origin = body.translation();
        const vy = solveAerialVelocity(
          origin.y,
          origin.z - layout.pinTipRowZ,
          hSpeed,
          STICK_STRIKE_HEIGHT,
          STICK_GRAVITY,
          MIN_LOB_VY,
          MAX_LOB,
          AIM_DRAG_PER_MASS,
        );
        // The throw is ONE impulse J = m·v applied at the grabbed point (not at the center of
        // mass): Rapier derives the spin from the lever arm (r × J / I), so an end grab gives a
        // tumble and a grab at the balance point a clean flight. The grab point is brought back
        // onto the stick axis (the hand encircles the stick), then `SNAP_OFFSET_Y` adds the
        // finger release: a slightly off-axis point that spins the stick about its long axis.
        const mass = STICK_MASS_PROPERTIES.mass;
        const [gx, gy, gz] = projectOntoAxis(grabOffsetRef.current, STICK_TIP_AXIS);
        // Not applied now: right after setBodyType(Dynamic), Rapier has not refreshed the body's
        // mass yet and applyImpulse* is a silent no-op. See useAfterPhysicsStep below.
        pendingReleaseRef.current = {
          impulse: [mass * vx, mass * vy, mass * vz],
          grip: [gx, gy + SNAP_OFFSET_Y, gz],
        };
      }
    }
  }

  // First physics step after the release: the body is now really dynamic, apply the throw.
  useAfterPhysicsStep(() => {
    const body = rigidBodyRef.current;
    const pending = pendingReleaseRef.current;
    if (!body || !pending) return;
    pendingReleaseRef.current = null;
    // Cancel the (tiny) fall of that single step so the lob aims from the release point.
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const origin = body.translation();
    const [ix, iy, iz] = pending.impulse;
    const [gx, gy, gz] = pending.grip;
    body.applyImpulseAtPoint(
      { x: ix, y: iy, z: iz },
      { x: origin.x + gx, y: origin.y + gy, z: origin.z + gz },
      true,
    );
    const w = body.angvel();
    const [sx, sy, sz] = clampTransverseSpin([w.x, w.y, w.z], STICK_TIP_AXIS, MAX_SPIN);
    body.setAngvel({ x: sx, y: sy, z: sz }, true);
  });

  // Air forces, applied at every physics step (not every rendered frame).
  useBeforePhysicsStep(() => {
    const body = rigidBodyRef.current;
    if (!body || phaseRef.current !== "rolling") return;
    // Planted in the sand: nothing moves any more.
    if (sandStateRef.current === "planted") return;
    if (sandStateRef.current === "flying") {
      // The stick reaches the sand: stopped dead, or planted if an end hits steeply and fast.
      const sand = resolveSandImpact(body, RigidBodyType.Fixed, PHYSICS_TIMESTEP);
      if (sand !== "none") sandStateRef.current = sand;
      if (sand === "planted") return;
    }
    // Rapier has no rolling resistance: raise the damping once the stick lies on the lane.
    const t = body.translation();
    body.setAngularDamping(
      groundedAngularDamping(t.y, body.linvel().y, STICK_ANGULAR_DAMPING, STICK_GROUND_ANGULAR_DAMPING),
    );
    applyStickAerodynamics(body, PHYSICS_TIMESTEP);
  });

  useFrame(() => {
    if (phaseRef.current === "resting") {
      // Reset the stick to its resting pose if it has moved or rotated.
      const body = rigidBodyRef.current;
      if (body) {
        const t = body.translation();
        const dx = t.x - rest[0];
        const dy = t.y - rest[1];
        const dz = t.z - rest[2];
        const q = body.rotation();
        const twisted =
          Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) + Math.abs(1 - q.w) > 1e-4;
        if (dx * dx + dy * dy + dz * dz > 0.0001 || twisted) {
          body.setTranslation(
            { x: rest[0], y: rest[1], z: rest[2] },
            true,
          );
          body.setRotation(IDENTITY_ROTATION, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
      return;
    }
    if (phaseRef.current !== "rolling") return;
    const body = rigidBodyRef.current;
    if (!body) return;

    const now = performance.now();
    const elapsed = now - rollingSinceRef.current;

    const t = body.translation();
    const linvel = body.linvel();
    const angvel = body.angvel();

    const isOutOfPlay = isStickOutOfPlay([t.x, t.y, t.z], {
      minY: OUT_OF_PLAY_MIN_Y,
      maxAbsX: BEACH_HALF_WIDTH + OUT_OF_PLAY_EDGE_MARGIN,
      minZ: -BEACH_HALF_LENGTH - OUT_OF_PLAY_EDGE_MARGIN,
    });
    const isSlow =
      isOutOfPlay ||
      isStickSettled(
        [linvel.x, linvel.y, linvel.z],
        [angvel.x, angvel.y, angvel.z],
        rotateByQuaternion(body.rotation(), STICK_TIP_AXIS),
        { radius: STICK_RADIUS, halfLength: STICK_LENGTH / 2 },
        STICK_SETTLE_SPEED,
      );

    if (isSlow) {
      settledSinceRef.current ??= now;
    } else {
      settledSinceRef.current = null;
    }

    const settledLongEnough =
      settledSinceRef.current !== null && now - settledSinceRef.current > SETTLE_DURATION_MS;

    const rollEnded = shouldEndRoll({
      pinsSettled: arePinsSettled(),
      ballSettledLongEnough: settledLongEnough,
      elapsedMs: elapsed,
      maxRollDurationMs: MAX_ROLL_DURATION_MS,
      absoluteMaxRollDurationMs: ABSOLUTE_MAX_ROLL_DURATION_MS,
    });

    if (!rollEnded) {
      endDetectedAtRef.current = null;
    } else if (elapsed < ABSOLUTE_MAX_ROLL_DURATION_MS) {
      // If the roll has ended but the absolute max duration hasn't been reached,
      endDetectedAtRef.current ??= now;
      if (now - endDetectedAtRef.current < ROLL_END_GRACE_MS) {
        return;
      }
    }

    if (rollEnded) {
      //Same precaution as in Ball.tsx: disable continuous collision detection (CCD) before teleporting back, otherwise continuous sweep might go through the lane.
      body.enableCcd(false);
      pendingReleaseRef.current = null;
      sandStateRef.current = "flying";
      body.setAngularDamping(STICK_ANGULAR_DAMPING);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setTranslation(
        { x: rest[0], y: rest[1], z: rest[2] },
        true,
      );
      // Reset the stick's rotation to the identity quaternion to ensure it starts the next round correctly.
      body.setRotation(IDENTITY_ROTATION, true);
      body.setBodyType(RigidBodyType.Fixed, true);
      setPhase("resting");
      // Call the onSettled callback to notify that the stick has come to rest.
      onSettled();
    }
  });

  const bodyType = phase === "held" ? "kinematicPosition" : phase === "resting" ? "fixed" : "dynamic";
  const { mass, comX, axialInertia, transverseInertia } = STICK_MASS_PROPERTIES;

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={rest}
      type={bodyType}
      colliders={false}
      linearDamping={STICK_LINEAR_DAMPING}
      angularDamping={STICK_ANGULAR_DAMPING}
      contactSkin={0.01}
      // Enable continuous collision detection (CCD) only while the stick is rolling to prevent it from tunneling through other objects.
      ccd={phase === "rolling"}
    >
      {/*
        The mass properties are set to match the stick's physical characteristics, ensuring realistic behavior during collisions and rotations.
      */}
      <CapsuleCollider
        args={[STICK_HALF_HEIGHT, STICK_RADIUS]}
        rotation={[0, 0, Math.PI / 2]}
        friction={STICK_FRICTION}
        frictionCombineRule={CoefficientCombineRule.Max}
        restitution={STICK_RESTITUTION}
        restitutionCombineRule={CoefficientCombineRule.Min}
        massProperties={{
          mass,
          centerOfMass: { x: 0, y: -comX, z: 0 },
          principalAngularInertia: { x: transverseInertia, y: axialInertia, z: transverseInertia },
          angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
        }}
      />
      <primitive
        object={clonedScene}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={abortDrag}
        onLostPointerCapture={abortDrag}
      />
      {canThrow && phase === "resting" && (
        <mesh scale={[1, 1, 1]}>
          <boxGeometry args={[STICK_LENGTH * 1.15, STICK_RADIUS * 3.2, STICK_RADIUS * 3.2]} />
          <meshBasicMaterial color="#c99a3e" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
    </RigidBody>
  );
}
