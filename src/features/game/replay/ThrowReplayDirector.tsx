import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { Group } from "three";
import { BALL_MODEL_URL } from "../scene/Ball";
import { PIN_MODEL_URL } from "../scene/Pin";
import type { PinRackHandle } from "../scene/PinRack";
const STICK_MODEL_URL = "/models/throwing_stick.glb";
import type { LaneLayout, LaneSize } from "../scene/laneSizes";
import type { ProjectileType } from "../scene/projectileTypes";
import { BALL_RADIUS } from "../scene/sceneConstants";
import { BallReplay } from "./ballReplay";
import { StickReplay } from "./stickReplay";
import type { ThrowReplay } from "./throwReplay";
import { toStickLaunch } from "./replayTypes";
import type { ReplayInput } from "./throwPayload";
import { pinsFelled, settleRack } from "./replayOutcome";
import type { PinReplayPose } from "./throwReplay";
import type { PinPose } from "@/lib/api/schemas";

const PIN_COUNT = 15;
/** The final resting pose stays on screen this long before the scene is given back. */
const HOLD_AFTER_REST_MS = 700;
/** A late frame simulates at most this many steps (~130 ms of throw): the burst of a long stall would freeze the frame. */
const MAX_STEPS_PER_FRAME = 8;
/** Beyond this lag the playback gives up catching up and carries on from where it is (the outcome is unchanged: it depends on the steps, not the clock). */
const MAX_LAG_SECONDS = 0.25;

type Session = {
  replay: ThrowReplay;
  startedAt: number;
  endedAt: number | null;
  input: ReplayInput;
  /** The rack when the throw started: what the score is measured against. */
  startPins: PinReplayPose[];
};

/** The rack the throw started from, as the poses the score is measured against (a pin the rack does not mention is out). */
function rackAsPoses(rack: readonly PinPose[]): PinReplayPose[] {
  return Array.from({ length: PIN_COUNT }, (_, index) => {
    const pin = rack.find((p) => p.index === index);
    if (!pin) return { enabled: false, position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const { position: p, rotation: q } = pin;
    return { enabled: pin.standing, position: [p.x, p.y, p.z], rotation: [q.x, q.y, q.z, q.w] };
  });
}

/** How a replay ended. `felled` and `finalPins` are what the thrower's scene needs to score and continue. */
export type ReplayResult = {
  throwId: string;
  own: boolean;
  /** Pins knocked out of play by this throw; null if the replay could not be played. */
  felled: number | null;
  /** Where every pin ended up, by index (empty if the replay could not be played). */
  finalPins: PinReplayPose[];
};


// Directs the replay of a throw, managing the visual representation of pins and the projectile according to the recorded physics simulation.
export function ThrowReplayDirector({
  input,
  projectileType,
  laneSize,
  layout,
  pinRackRef,
  onActiveChange,
  onFinished,
}: {
  input: ReplayInput | null;
  projectileType: ProjectileType;
  laneSize: LaneSize;
  layout: LaneLayout;
  pinRackRef: RefObject<PinRackHandle | null>;
  /** True while a replay is on screen: the scene hides its own projectile. */
  onActiveChange: (active: boolean) => void;
  /** The replay is over (or could not be played). */
  onFinished: (result: ReplayResult) => void;
}) {
  const { rapier } = useRapier();
  const pinModel = useGLTF(PIN_MODEL_URL);
  const projectileModel = useGLTF(projectileType === "stick" ? STICK_MODEL_URL : BALL_MODEL_URL);
  const pinMeshes = useMemo(() => Array.from({ length: PIN_COUNT }, () => pinModel.scene.clone(true)), [pinModel.scene]);
  const projectileMesh = useMemo(() => projectileModel.scene.clone(true), [projectileModel.scene]);
  const pinGroups = useRef<(Group | null)[]>([]);
  const projectileGroup = useRef<Group>(null);
  const sessionRef = useRef<Session | null>(null);
  const callbacksRef = useRef({ onActiveChange, onFinished });
  useEffect(() => {
    callbacksRef.current = { onActiveChange, onFinished };
  });

  function showActors(visible: boolean) {
    if (projectileGroup.current) projectileGroup.current.visible = visible;
    pinGroups.current.forEach((group) => {
      if (group) group.visible = visible;
    });
  }

  function endSession(notify: boolean) {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    const rawPins = session.replay.pinPoses();
    // The score is read off the pins as they came to rest; the next roll starts from the survivors set upright.
    const felled = pinsFelled(session.startPins, rawPins, layout);
    const finalPins = settleRack(rawPins, layout);
    const result: ReplayResult = {
      throwId: session.input.throwId,
      own: session.input.own,
      felled,
      finalPins,
    };
    session.replay.dispose();
    showActors(false);
    // The local rack is updated only if the throw belongs to the local player and the result should be applied.
    if (session.input.own && notify) pinRackRef.current?.applyReplayResult(finalPins);
    else pinRackRef.current?.showAfterReplay();
    callbacksRef.current.onActiveChange(false);
    if (notify) callbacksRef.current.onFinished(result);
  }

  useEffect(() => {
    if (!input) return;
    try {
      if (input.projectile !== projectileType || input.laneSize !== laneSize) {
        throw new Error("le lancer vient d'une autre configuration (projectile ou piste)");
      }
      const replay: ThrowReplay =
        input.projectile === "stick"
          ? new StickReplay(rapier, layout, input.rack, toStickLaunch(input.launch))
          : new BallReplay(rapier, layout, input.rack, input.launch);
      sessionRef.current = {
        replay,
        startedAt: performance.now(),
        endedAt: null,
        input,
        startPins: rackAsPoses(input.rack),
      };
      pinRackRef.current?.hideForReplay();
      callbacksRef.current.onActiveChange(true);
    } catch (error) {
      // A replay is a bonus: whatever goes wrong, the game goes on without it.
      console.warn("Rejeu du lancer abandonné :", error);
      pinRackRef.current?.showAfterReplay();
      callbacksRef.current.onFinished({ throwId: input.throwId, own: input.own, felled: null, finalPins: [] });
    }
    return () => endSession(false);
    // A new throw (new id) restarts everything; the other inputs are fixed for the whole game.
  }, [input]);

  useFrame(() => {
    const session = sessionRef.current;
    if (!session) return;
    const now = performance.now();
    const elapsed = (now - session.startedAt) / 1000;
    session.replay.advanceTo(elapsed, MAX_STEPS_PER_FRAME);
    const lag = session.replay.lagBehind(elapsed);
    if (lag > MAX_LAG_SECONDS) session.startedAt += (lag - MAX_LAG_SECONDS) * 1000;

    const projectile = session.replay.projectilePose();
    if (projectileGroup.current) {
      projectileGroup.current.position.set(...projectile.position);
      projectileGroup.current.quaternion.set(...projectile.rotation);
    }
    session.replay.pinPoses().forEach((pose, index) => {
      const group = pinGroups.current[index];
      if (!group) return;
      group.visible = pose.enabled;
      group.position.set(...pose.position);
      group.quaternion.set(...pose.rotation);
    });
    if (projectileGroup.current) projectileGroup.current.visible = true;

    if (session.replay.finished) {
      session.endedAt ??= now;
      if (now - session.endedAt >= HOLD_AFTER_REST_MS) endSession(true);
    }
  });

  return (
    <group>
      {pinMeshes.map((mesh, index) => (
        <group
          key={index}
          ref={(group) => {
            pinGroups.current[index] = group;
          }}
          visible={false}
        >
          <primitive object={mesh} />
        </group>
      ))}
      <group ref={projectileGroup} visible={false}>
        <primitive object={projectileMesh} position={projectileType === "ball" ? [0, -BALL_RADIUS, 0] : [0, 0, 0]} />
      </group>
    </group>
  );
}
