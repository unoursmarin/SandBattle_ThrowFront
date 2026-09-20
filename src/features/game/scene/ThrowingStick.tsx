import { useEffect, useMemo, useRef, useState } from "react";
import { RigidBodyType } from "@dimforge/rapier3d-compat";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Plane, Vector3 } from "three";

import { STICK_HALF_HEIGHT, STICK_LENGTH, STICK_RADIUS } from "./sceneConstants";
import type { LaneLayout } from "./laneSizes";
import { meanDragPerMass, STICK_DRAG_PARAMS } from "./stickAerodynamics";
import { STICK_MASS_PROPERTIES } from "./stickMassProperties";
import { MAX_THROW_SPEED } from "./stickThrowSim";
import type { ThrowCapture } from "../replay/replayTypes";
import { dragTargetCenter, solveAerialVelocity } from "./stickThrowLogic";

export const STICK_MODEL_URL = "/models/throwing_stick.glb";
useGLTF.preload(STICK_MODEL_URL);

const MAX_DRAG_RADIUS = 0.6;
const LATERAL_GESTURE_DAMPING = 0.4;
const MIN_THROW_SPEED = 0.6;
const VELOCITY_HISTORY_MS = 120;
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const STICK_GRAVITY = 9.81; // m/s² — same as the replay world's gravity, used to aim the lob
const STICK_STRIKE_HEIGHT = 0.15; // m
const MAX_LOB = 7.5; // m/s
const MIN_LOB_VY = -2; // m/s — a throw can go down
/** Drag anticipated when aiming the lob (mean cross-section, see meanDragPerMass). */
const AIM_DRAG_PER_MASS = meanDragPerMass(STICK_DRAG_PARAMS, STICK_MASS_PROPERTIES.mass);

// "replaying": the throw is played in a private world (see ThrowReplayDirector): the stick waits, hidden, at rest.
type Phase = "resting" | "held" | "replaying";

type PointerSample = { x: number; z: number; t: number };

/**
 * The throwing stick: grabbed, dragged (a kinematic body: the grabbed point follows the pointer),
 * released. What happens AFTER the release is not simulated here: the gesture is turned into the
 * launch variables (position, velocity, where it was held) and handed to the scene, which plays the
 * throw in a private world, the same one on every client (see replayWorld.ts).
 */
export function ThrowingStick({
  canThrow,
  onDragChange,
  layout,
  onThrowLaunched,
  hidden = false,
  finishToken,
}: {
  canThrow: boolean;
  onDragChange: (isDragging: boolean) => void;
  /** Dimension of the current lane cf laneSizes.ts). */
  layout: LaneLayout;
  /** The stick was released: how it was launched. The scene plays the throw. */
  onThrowLaunched: (capture: ThrowCapture) => void;
  /** Another player's throw is being replayed: hide this projectile meanwhile. */
  hidden?: boolean;
  /** Changes when the replay of this stick's throw is over: the stick comes back to hand. */
  finishToken?: number;
}) {
  const { scene } = useGLTF(STICK_MODEL_URL);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [phase, setPhaseState] = useState<Phase>("resting");
  const historyRef = useRef<PointerSample[]>([]);
  // The handlers read phaseRef.current where they must be current at once, same idea as in Ball.tsx
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
  // Offset from the body origin (geometric center) to the grab point: keeps the grabbed point under the pointer while dragging, and is where the stick is held along its axis at the release.
  const grabOffsetRef = useRef<[number, number, number]>([0, 0, 0]);

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
    const [x, y, z] = dragTargetCenter([hit.x, hit.y, hit.z], grabOffsetRef.current, rest, MAX_DRAG_RADIUS);
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

  // The stick goes back to hand: at rest, not moving, out of the way of the replay.
  function parkAtRest() {
    const body = rigidBodyRef.current;
    if (!body) return;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation({ x: rest[0], y: rest[1], z: rest[2] }, true);
    body.setRotation(IDENTITY_ROTATION, true);
    body.setBodyType(RigidBodyType.Fixed, true);
  }

  // The gesture was taken away (touch cancelled, capture lost): put the stick back instead of
  // staying "held" for ever, with the camera controls disabled and no roll ever completing.
  function abortDrag() {
    if (phaseRef.current !== "held") return;
    historyRef.current = [];
    onDragChange(false);
    document.body.style.cursor = "auto";
    parkAtRest();
    setPhase("resting");
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (phase !== "held") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    // Leave "held" BEFORE releasing the capture: releasing fires lostpointercapture, which
    // abortDrag() must not mistake for a lost gesture.
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
    // No gesture (or too soft): the stick is simply dropped where it was released.
    const hSpeed = Math.hypot(vx, vz);
    const vy =
      hSpeed > 0
        ? solveAerialVelocity(
            origin.y,
            origin.z - layout.pinTipRowZ,
            hSpeed,
            STICK_STRIKE_HEIGHT,
            STICK_GRAVITY,
            MIN_LOB_VY,
            MAX_LOB,
            AIM_DRAG_PER_MASS,
          )
        : 0;
    parkAtRest();
    // A stick dropped without a real gesture is still a roll (of 0 pins): the throw is played all the same.
    onThrowLaunched({
      projectile: "stick",
      launch: {
        origin: [origin.x, origin.y, origin.z],
        velocity: [vx, vy, vz],
        // Where it was held along its axis (the hand encircles the stick: see pendingFromLaunch).
        gripOffset: grabOffsetRef.current[0],
      },
    });
  }

  // The replay is over: the stick is in hand again.
  useEffect(() => {
    if (phaseRef.current === "replaying") setPhase("resting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishToken]);

  useFrame(() => {
    if (phaseRef.current !== "resting") return;
    // Reset the stick to its resting pose if it has moved or rotated.
    const body = rigidBodyRef.current;
    if (!body) return;
    const t = body.translation();
    const dx = t.x - rest[0];
    const dy = t.y - rest[1];
    const dz = t.z - rest[2];
    const q = body.rotation();
    const twisted = Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) + Math.abs(1 - q.w) > 1e-4;
    if (dx * dx + dy * dy + dz * dz > 0.0001 || twisted) {
      body.setTranslation({ x: rest[0], y: rest[1], z: rest[2] }, true);
      body.setRotation(IDENTITY_ROTATION, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  const bodyType = phase === "held" ? "kinematicPosition" : "fixed";

  return (
    <RigidBody ref={rigidBodyRef} position={rest} type={bodyType} colliders={false} contactSkin={0.01} ccd={false}>
      {/* The capsule axis is the collider's local Y, i.e. the body's −X. Only used to grab the stick. */}
      <CapsuleCollider args={[STICK_HALF_HEIGHT, STICK_RADIUS]} rotation={[0, 0, Math.PI / 2]} />
      <primitive
        object={clonedScene}
        visible={!hidden && phase !== "replaying"}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={abortDrag}
        onLostPointerCapture={abortDrag}
      />
      {/* Always mounted, only shown when grabbable: unmounting it disposes its shader, which is recompiled (a stall) at every throw. */}
      <mesh visible={canThrow && phase === "resting"}>
        <boxGeometry args={[STICK_LENGTH * 1.15, STICK_RADIUS * 3.2, STICK_RADIUS * 3.2]} />
        <meshBasicMaterial color="#c99a3e" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </RigidBody>
  );
}
