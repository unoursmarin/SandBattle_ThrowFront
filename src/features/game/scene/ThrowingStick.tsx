import { useEffect, useMemo, useRef, useState } from "react";
import { CoefficientCombineRule, RigidBodyType } from "@dimforge/rapier3d-compat";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Plane, Vector3 } from "three";

import {
  STICK_HALF_HEIGHT,
  STICK_LENGTH,
  STICK_RADIUS,
} from "./sceneConstants";
import type { LaneLayout } from "./laneSizes";
import { shouldEndRoll } from "./ballRollLogic";
import {
  clampToSphere,
  computeImpulseSpin,
  integrateBallisticStep,
  solveAerialVelocity,
  stickGroundY,
} from "./stickThrowLogic";

const STICK_MODEL_URL = "/models/throwing_stick.glb";
useGLTF.preload(STICK_MODEL_URL);

const MAX_DRAG_RADIUS = 0.6;
const MAX_THROW_SPEED = 12; // m/s
const LATERAL_GESTURE_DAMPING = 0.4;
const MIN_THROW_SPEED = 0.6;
const VELOCITY_HISTORY_MS = 120;
const SETTLE_LINEAR_THRESHOLD = 0.05;
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const SETTLE_DURATION_MS = 300;
const ROLL_END_GRACE_MS = 3000;
const MAX_ROLL_DURATION_MS = 14000;
const ABSOLUTE_MAX_ROLL_DURATION_MS = 22000;
const STICK_GRAVITY = 9.81; // m/s²  
const STICK_STRIKE_HEIGHT = 0.15; // m  
const MAX_LOB = 7.5; // m/s — 
const MIN_LOB_VY = -2; // m/s — a throw can go down
const MAX_SPIN = 12; // rad/s

type Phase = "resting" | "held" | "rolling";

type PointerSample = { x: number; z: number; t: number };

// Throwing stick : caught in kinematic position thrown with velocitybased 
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
  // State of the throw (parabolic throw)
  const flightRef = useRef<{ vy: number; landed: boolean }>({ vy: 0, landed: true });
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
  // Offset from the center of mass to the grab point (lever arm for the impulse).
  const grabOffsetRef = useRef<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (!canThrow && document.body.style.cursor === "grab") {
      document.body.style.cursor = "auto";
    }
  }, [canThrow]);

  // Projects the pointer onto the drag plane and then clamps it within the grab sphere.
  function dragPoint(event: ThreeEvent<PointerEvent>): Vector3 | null {
    const plane = dragPlaneRef.current;
    if (!plane) return null;
    const hit = new Vector3();
    if (!event.ray.intersectPlane(plane, hit)) return null;
    const [x, y, z] = clampToSphere(rest, [hit.x, hit.y, hit.z], MAX_DRAG_RADIUS);
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
    // Lever arm for the impulse: grab point minus center of mass.
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

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (phase !== "held") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
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

    setPhase("rolling");
    rollingSinceRef.current = performance.now();
    settledSinceRef.current = null;

    if (body) {
      body.setBodyType(RigidBodyType.KinematicVelocityBased, true);
      body.enableCcd(true);
      body.setLinvel({ x: vx, y: 0, z: vz }, true);
      // Horizontal speed for the aerial throw calculation.
      const hSpeed = Math.hypot(vx, vz);
      const release = body.translation();
      const vy =
        hSpeed <= 0
          ? 0
          : solveAerialVelocity(
              release.y,
              release.z - layout.pinTipRowZ,
              hSpeed,
              STICK_STRIKE_HEIGHT,
              STICK_GRAVITY,
              MIN_LOB_VY,
              MAX_LOB,
            );
      flightRef.current = { vy, landed: hSpeed <= 0 };
      // Compute the spin imparted by the impulse: r × v0 with
      // I = m·L²/12 — the direction and magnitude come from where the stick is held.
      const spin = computeImpulseSpin(grabOffsetRef.current, [vx, vy, vz], STICK_LENGTH, MAX_SPIN);
      if (spin.axis) {
        const [ax, ay, az] = spin.axis;
        body.setAngvel(
          { x: ax * spin.angularSpeed, y: ay * spin.angularSpeed, z: az * spin.angularSpeed },
          true,
        );
      } else {
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  useFrame((_state, delta) => {
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
    const flight = flightRef.current;

    if (!flight.landed) {
      // Integrate the stick's ballistic motion for this frame.
      const step = integrateBallisticStep(
        { y: t.y, vy: flight.vy, landed: false },
        stickGroundY(layout, t.x),
        STICK_GRAVITY,
        delta,
      );
      flight.vy = step.vy;
      flight.landed = step.landed;
      body.setTranslation({ x: t.x, y: step.y, z: t.z }, true);
      if (step.landed) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    const linvel = body.linvel();
    const linSpeed = Math.hypot(linvel.x, linvel.z);

    const isSlow = flight.landed && linSpeed < SETTLE_LINEAR_THRESHOLD;

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
      flight.vy = 0;
      flight.landed = true;
      //Same precaution as in Ball.tsx: disable CCD before teleporting back, otherwise continuous sweep might go through the lane.
      body.enableCcd(false);
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

  const bodyType = phase === "held" ? "kinematicPosition" : phase === "resting" ? "fixed" : "kinematicVelocity";

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={rest}
      type={bodyType}
      colliders={false}
      friction={0.2}
      frictionCombineRule={CoefficientCombineRule.Min}
      restitution={0}
      restitutionCombineRule={CoefficientCombineRule.Min}
      contactSkin={0.01}
      ccd={false}
    >
          
      <CapsuleCollider args={[STICK_HALF_HEIGHT, STICK_RADIUS]} rotation={[0, 0, Math.PI / 2]} />
      <primitive
        object={clonedScene}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
