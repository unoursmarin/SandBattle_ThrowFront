import { useEffect, useMemo, useRef, useState } from "react";
import { CoefficientCombineRule, RigidBodyType } from "@dimforge/rapier3d-compat";
import { useGLTF } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { BallCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Plane, Vector3 } from "three";

import { BALL_RADIUS } from "./sceneConstants";
import type { LaneLayout } from "./laneSizes";
import type { ThrowCapture } from "../replay/replayTypes";

export const BALL_MODEL_URL = "/models/bowling_ball.glb";
useGLTF.preload(BALL_MODEL_URL);
const MAX_DRAG_RADIUS = 0.4;
const MAX_VELOCITY_SAMPLE_RADIUS = 12;
const MAX_THROW_SPEED = 12; // m/s — avoid absurd throws
// Specifically damps the LATERAL component (vx) of the gesture, not vz: over
// the 4.2 m between release and the head pin row, a lateral drift of just a few % of the total speed is enough to completely miss the head pin.
const LATERAL_GESTURE_DAMPING = 0.4;
const MIN_THROW_SPEED = 0.6; // below this, the ball is considered not really thrown
const VELOCITY_HISTORY_MS = 120;

// "replaying": the throw is played in a private world (see ThrowReplayDirector): the ball waits, hidden, at rest.
type Phase = "resting" | "held" | "replaying";

type PointerSample = { x: number; z: number; t: number };

/**
 * The ball: grabbed, dragged, released. What happens after the release is not simulated : the
 * gesture is turned into the launch variables (position, velocity) and handed to the scene, which
 * plays the throw in a private world, the same one on every client
 */
export function Ball({
  canThrow,
  onDragChange,
  layout,
  onThrowLaunched,
  hidden = false,
  finishToken,
}: {
  canThrow: boolean;
  onDragChange: (isDragging: boolean) => void;
  // Track Dimension corresponding to the current lane layout
  layout: LaneLayout;
  // The ball was released: how it was launched. The scene plays the throw. 
  onThrowLaunched: (capture: ThrowCapture) => void;
  // Another player's throw is being replayed: hide this projectile meanwhile. 
  hidden?: boolean;
  // Changes when the replay of this ball's throw is over: the ball comes back to hand. 
  finishToken?: number;
}) {
  const { scene } = useGLTF(BALL_MODEL_URL);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [phase, setPhaseState] = useState<Phase>("resting");
  const historyRef = useRef<PointerSample[]>([]);
  // The handlers below read phaseRef.current rather than the React state `phase` where they must be current at once.
  const phaseRef = useRef<Phase>("resting");
  function setPhase(next: Phase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  // Those values are derived from the layout and are used to determine the resting position and sliding plane for the ball.
  const rest = layout.ballRest;
  const dragPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), -rest[1]), [rest]);

  // cursor signals whether the ball is interactable (grabable) or not.
  useEffect(() => {
    if (!canThrow && document.body.style.cursor === "grab") {
      document.body.style.cursor = "auto";
    }
  }, [canThrow]);

  // Unmounted mid-drag: give the camera controls and the cursor back.
  useEffect(
    () => () => {
      if (phaseRef.current === "held") {
        onDragChange(false);
        document.body.style.cursor = "auto";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
    // Imperative for the same reason as release/stop
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

  // The ball goes back to hand: at rest, not moving, out of the way of the replay.
  function parkAtRest() {
    const body = rigidBodyRef.current;
    if (!body) return;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation({ x: rest[0], y: rest[1], z: rest[2] }, true);
    body.setBodyType(RigidBodyType.Fixed, true);
  }

  // The gesture was taken away (touch cancelled, capture lost): put the ball back instead of
  // staying "held" for ever, with the camera controls disabled.
  function abortDrag() {
    if (phaseRef.current !== "held") return;
    historyRef.current = [];
    onDragChange(false);
    document.body.style.cursor = "auto";
    parkAtRest();
    setPhase("resting");
  }

  // Handle the pointer up event, which signifies the end of a drag gesture.
  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (phase !== "held") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    // Leave "held" BEFORE releasing the capture: releasing fires lostpointercapture, which abortDrag() must not mistake for a lost gesture.
    setPhase("replaying");
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

    const origin = body?.translation() ?? { x: rest[0], y: rest[1], z: rest[2] };
    parkAtRest();
    // A ball released without a real gesture is still a roll (of 0 pins): the throw is played all the same.
    onThrowLaunched({
      projectile: "ball",
      launch: { origin: [origin.x, origin.y, origin.z], velocity: [vx, 0, vz], gripOffset: null },
    });
  }

  // The replay is over: the ball is in hand again.
  useEffect(() => {
    if (phaseRef.current === "replaying") setPhase("resting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishToken]);

  useFrame(() => {
    if (phaseRef.current !== "resting") return;
    // Safeguard: the ball must remain EXACTLY at its resting position
    const body = rigidBodyRef.current;
    if (!body) return;
    const t = body.translation();
    const dx = t.x - rest[0];
    const dy = t.y - rest[1];
    const dz = t.z - rest[2];
    if (dx * dx + dy * dy + dz * dz > 0.0001) {
      body.setTranslation({ x: rest[0], y: rest[1], z: rest[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  const bodyType = phase === "held" ? "kinematicPosition" : "fixed";

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
        visible={!hidden && phase !== "replaying"}
        position={[0, -BALL_RADIUS, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={abortDrag}
        onLostPointerCapture={abortDrag}
      />
      {/* Always mounted, only shown when grabbable: unmounting it disposes its shader, which is recompiled (a stall) at every throw. */}
      <mesh scale={1.18} visible={canThrow && phase === "resting"}>
        <sphereGeometry args={[BALL_RADIUS, 24, 24]} />
        <meshBasicMaterial color="#c99a3e" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </RigidBody>
  );
}
