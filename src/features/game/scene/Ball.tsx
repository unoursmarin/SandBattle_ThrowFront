import { useEffect, useMemo, useRef, useState } from "react";
import { CoefficientCombineRule, RigidBodyType } from "@dimforge/rapier3d-compat";
import { useGLTF } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { BallCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Plane, Vector3 } from "three";

import {
  BALL_RADIUS,
  GUTTER_BOTTOM_Y,
} from "./sceneConstants";
import type { LaneLayout } from "./laneSizes";
import { decelerateSpeed, shouldEndRoll } from "./ballRollLogic";

const BALL_MODEL_URL = "/models/bowling_ball.glb";
useGLTF.preload(BALL_MODEL_URL);
const MAX_DRAG_RADIUS = 0.4;
const MAX_VELOCITY_SAMPLE_RADIUS = 12;
const MAX_THROW_SPEED = 12; // m/s — avoid absurd throws
// Specifically damps the LATERAL component (vx) of the gesture, not vz: over
// the 4.2 m between release and the head pin row, a lateral drift of just a few % of the total speed is enough to completely miss the head pin.
const LATERAL_GESTURE_DAMPING = 0.4;
const MIN_THROW_SPEED = 0.6; // below this, the ball is considered not really thrown
const STOP_ZONE_MARGIN = 0.5; // m — margin after the last row before applying deceleration
const STOP_ZONE_DECELERATION = 8; // m/s² (deceleration rate in the stop zone)
const VELOCITY_HISTORY_MS = 120; 
const SETTLE_LINEAR_THRESHOLD = 0.05;
const SETTLE_ANGULAR_THRESHOLD = 1;
const SETTLE_DURATION_MS = 300;
const ROLL_END_GRACE_MS = 3000;
const MAX_ROLL_DURATION_MS = 14000;
const ABSOLUTE_MAX_ROLL_DURATION_MS = 22000;
const GUTTER_REST_Y = GUTTER_BOTTOM_Y + BALL_RADIUS;
const HEIGHT_FOLLOW_PER_SECOND = 12;

type Phase = "resting" | "held" | "rolling";

type PointerSample = { x: number; z: number; t: number };

/**
 * Ball component representing the physical ball in the game.
 * Handles interaction, rolling, and settling logic.
 */
export function Ball({
  canThrow,
  onDragChange,
  onSettled,
  arePinsSettled,
  layout,
}: {
  canThrow: boolean;
  onDragChange: (isDragging: boolean) => void;
  onSettled: () => void;
  //Read each frame whether the pins are settled or not.
  arePinsSettled: () => boolean;
  // Track Dimension corresponding to the current lane layout 
  layout: LaneLayout;
}) {
  const { scene } = useGLTF(BALL_MODEL_URL);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [phase, setPhaseState] = useState<Phase>("resting");
  const historyRef = useRef<PointerSample[]>([]);
  const settledSinceRef = useRef<number | null>(null);
  const endDetectedAtRef = useRef<number | null>(null);
  const rollingSinceRef = useRef(0);
// useFrame reads phaseRef.current rather than the React state `phase` and is called on every frame.
  const phaseRef = useRef<Phase>("resting");
  function setPhase(next: Phase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  // Those values are derived from the layout and are used to determine the resting position, sliding plane, and stop zone for the ball.
  const rest = layout.ballRest;
  const dragPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), -rest[1]), [rest]);
  const stopZoneZ = useMemo(
    () =>
      layout.pinTipRowZ - (layout.pinRowSizes.length - 1) * layout.pinRowSpacing - STOP_ZONE_MARGIN,
    [layout],
  );
  function restHeightFor(x: number): number {
    return Math.abs(x) <= layout.laneHalfWidth ? rest[1] : GUTTER_REST_Y;
  }

  // cursor signals whether the ball is interactable (grabable) or not.
  useEffect(() => {
    if (!canThrow && document.body.style.cursor === "grab") {
      document.body.style.cursor = "auto";
    }
  }, [canThrow]);

  
  // Projects the pointer on the plan of sliding and returns both clamped and raw points.
  function projectPointer(event: ThreeEvent<PointerEvent>): { clamped: Vector3; raw: Vector3 } | null {
    const point = new Vector3();
    if (!event.ray.intersectPlane(dragPlane, point)) {
      return null;
    }
    const dx = point.x - rest[0];
    const dz = point.z - rest[2];
    const distance = Math.hypot(dx, dz);

    const raw = point.clone();
    if (distance > MAX_VELOCITY_SAMPLE_RADIUS) {
      const rawScale = MAX_VELOCITY_SAMPLE_RADIUS / distance;
      raw.x = rest[0] + dx * rawScale;
      raw.z = rest[2] + dz * rawScale;
    }

    const clamped = point.clone();
    if (distance > MAX_DRAG_RADIUS) {
      const scale = MAX_DRAG_RADIUS / distance;
      clamped.x = rest[0] + dx * scale;
      clamped.z = rest[2] + dz * scale;
    }

    return { clamped, raw };
  }

  // Handle the pointer over event, which changes the cursor to indicate the ball is interactable.
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
    // OrbitControls listens to the same native DOM events on the same
    event.nativeEvent.stopImmediatePropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    historyRef.current = [];
    setPhase("held");
    onDragChange(true);
    document.body.style.cursor = "grabbing";
    // Imperative for the same reason as release/stop (see below):
    // the body is still `Fixed` until React recommits the reactive `type` prop,
    // and `setNextKinematicTranslation` on a `Fixed` body is ignored by Rapier —
    // the ball would not follow the pointer during the very first drag events.
    rigidBodyRef.current?.setBodyType(RigidBodyType.KinematicPositionBased, true);
  }

  // Handle the pointer move event, which updates the ball's position as it is dragged.
  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    if (phase !== "held") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const projected = projectPointer(event);
    const body = rigidBodyRef.current;
    if (!projected || !body) return;

    body.setNextKinematicTranslation({
      x: projected.clamped.x,
      y: rest[1],
      z: projected.clamped.z,
    });

    const now = performance.now();
    const history = historyRef.current;
    history.push({ x: projected.raw.x, z: projected.raw.z, t: now });
    while (history.length > 0 && now - history[0].t > VELOCITY_HISTORY_MS) {
      history.shift();
    }
  }

  // Handle the pointer up event, which signifies the end of a drag gesture.
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
      // KinematicVelocityBased, not Dynamic: the ball pushes the pins but cannot be deflected/slowed down by them.
      body.setBodyType(RigidBodyType.KinematicVelocityBased, true);
      body.enableCcd(true);
      body.setLinvel({ x: vx, y: 0, z: vz }, true);
      const finalSpeed = Math.hypot(vx, vz);
      if (finalSpeed > 0) {
        //  roll without slipping: ω = (n × v) / r, n =  normal srfc (0,1,0)
        const angularSpeed = finalSpeed / BALL_RADIUS;
        body.setAngvel({ x: (vz / finalSpeed) * angularSpeed, y: 0, z: (-vx / finalSpeed) * angularSpeed }, true);
      }
    }
  }

  useFrame((_state, delta) => {
    if (phaseRef.current === "resting") {
      // Safeguard: the ball must remain EXACTLY at its resting position
      const body = rigidBodyRef.current;
      if (body) {
        const t = body.translation();
        const dx = t.x - rest[0];
        const dy = t.y - rest[1];
        const dz = t.z - rest[2];
        if (dx * dx + dy * dy + dz * dz > 0.0001) {
          body.setTranslation(
            { x: rest[0], y: rest[1], z: rest[2] },
            true,
          );
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

    // Manual deceleration in two zones (see the comment in
    // decelerateSpeed for details).
    const t = body.translation();
    const inStopZone = t.z <= stopZoneZ;
    const linvel = body.linvel();
    const currentLinSpeed = Math.hypot(linvel.x, linvel.z);
    const linSpeed = decelerateSpeed(currentLinSpeed, inStopZone, STOP_ZONE_DECELERATION, delta);
    if (linSpeed !== currentLinSpeed && currentLinSpeed > 0) {
      const scale = linSpeed / currentLinSpeed;
      body.setLinvel({ x: linvel.x * scale, y: 0, z: linvel.z * scale }, true);
      // Roll without slipping preserved throughout deceleration:
      // ω = v / BALL_RADIUS remains true at all times (see the derivation
      // in handlePointerUp), never an angular slowdown independent of linear speed.
      const angularSpeed = linSpeed / BALL_RADIUS;
      const ux = linvel.x / currentLinSpeed;
      const uz = linvel.z / currentLinSpeed;
      body.setAngvel(linSpeed > 0 ? { x: uz * angularSpeed, y: 0, z: -ux * angularSpeed } : { x: 0, y: 0, z: 0 }, true);
    }
    const angSpeed = linSpeed / BALL_RADIUS;

   // Height fully manually controlled (see HEIGHT_FOLLOW_PER_SECOND):
    const targetY = restHeightFor(t.x);
    const heightDecay = Math.exp(-HEIGHT_FOLLOW_PER_SECOND * delta);
    const newY = targetY + (t.y - targetY) * heightDecay;
    if (Math.abs(newY - t.y) > 1e-5) {
      body.setTranslation({ x: t.x, y: newY, z: t.z }, true);
    }

    const isSlow = linSpeed < SETTLE_LINEAR_THRESHOLD && angSpeed < SETTLE_ANGULAR_THRESHOLD;

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
      // Delay before considering the roll ended: the closure (scoring, teleport, next turn)
      endDetectedAtRef.current ??= now;
      if (now - endDetectedAtRef.current < ROLL_END_GRACE_MS) {
        return;
      }
    }

    if (rollEnded) {
      body.enableCcd(false);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setTranslation(
        { x: rest[0], y: rest[1], z: rest[2] },
        true,
      );
      body.setBodyType(RigidBodyType.Fixed, true);
      setPhase("resting");
      // Same treatment as with ThrowingStick.tsx — the ball is already parked at its rest position before the scoring chain runs, so a failure downstream never leaves the ball out of position for the next frame.
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
      <BallCollider args={[BALL_RADIUS]} />
      <primitive
        object={clonedScene}
        position={[0, -BALL_RADIUS, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {canThrow && phase === "resting" && (
        <mesh scale={1.18}>
          <sphereGeometry args={[BALL_RADIUS, 24, 24]} />
          <meshBasicMaterial color="#c99a3e" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
    </RigidBody>
  );
}