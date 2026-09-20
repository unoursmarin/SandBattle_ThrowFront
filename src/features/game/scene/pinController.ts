
// The rack's pins and their behavior are controlled here.
import { PIN_SPAWN_Y_OFFSET } from "./sceneConstants";
import { isPinOutOfPlay } from "./pinSettleLogic";

export type PinBodyPose = {
  enabled: boolean;
  position: [number, number, number];
  rotation: [number, number, number, number];
};

export interface PinHandle {
  // Determines if the pin is considered out of play.
  isOutOfPlay(): boolean;
  // Raises pin to its original position, resets velocities, and reintegrates it into the game (see `retire`). 
  reset(): void;
  // Instantly lays the pin down (synchronization of a remote throw, see PinRack), then removes it (see `retire`). 
  forceDown(): void;
  // Where the pin is right now, and whether it is still in the game (not retired).
  pose(): PinBodyPose;
  // Hides the pin while a replay of another player's throw is shown (reversible, unlike `retire`). 
  hideForReplay(): void;
  // Brings back a pin hidden by `hideForReplay`, exactly as it was (a retired pin stays retired). 
  showAfterReplay(): void;
  // Puts the pin where a replay of THIS player's own throw left it, at rest (or retires it if it was already out). 
  restoreFromReplay(pose: PinBodyPose): void;
  // Removes the pin from the game for the rest of the round: disabled (no more collision) and
  // hidden. Reversed by `reset()` at the beginning of the next round (fresh rack). 
  retire(): void;
}

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

// The subset of a Rapier rigid body a pin uses (structural: no dependency on Rapier). 
export type PinBody = {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  translation(): Vec3;
  rotation(): Quat;
  setTranslation(v: Vec3, wakeUp: boolean): void;
  setRotation(q: Quat, wakeUp: boolean): void;
  setLinvel(v: Vec3, wakeUp: boolean): void;
  setAngvel(v: Vec3, wakeUp: boolean): void;
};

// What shows the pin (its mesh).
export type PinView = { visible: boolean };

export type PinBounds = { maxAbsX: number; maxAbsZ: number; minY: number };

const IDENTITY_ROTATION: Quat = { x: 0, y: 0, z: 0, w: 1 };
// A pin laid down (~78° about X): what `forceDown` shows before retiring it.
const LYING_ANGLE = Math.PI / 2.3;
const LYING_ROTATION: Quat = { x: Math.sin(LYING_ANGLE / 2), y: 0, z: 0, w: Math.cos(LYING_ANGLE / 2) };
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export function createPinController(options: {
  // The pin's body, read at every call (it does not exist before the physics world does).
  getBody: () => PinBody | null;
  view: PinView;
  // The pin's own spot on the lane.
  spot: readonly [number, number, number];
  bounds: PinBounds;
}): PinHandle {
  const { getBody, view, spot, bounds } = options;
  // Was the pin in the game when a replay hid it? (a retired pin must stay retired)
  let shownBeforeReplay = false;

  function placeOnSpot(body: PinBody, rotation: Quat): void {
    body.setTranslation({ x: spot[0], y: spot[1] + PIN_SPAWN_Y_OFFSET, z: spot[2] }, true);
    body.setRotation(rotation, true);
    body.setLinvel(ZERO, true);
    body.setAngvel(ZERO, true);
  }

  function retireBody(body: PinBody): void {
    body.setEnabled(false);
    view.visible = false;
  }

  return {
    isOutOfPlay() {
      const body = getBody();
      if (!body) return false;
      const q = body.rotation();
      return isPinOutOfPlay(
        {
          // A pin hidden by a replay is still in the game; a retired one (disabled for good) is not.
          inGame: body.isEnabled() || shownBeforeReplay,
          upDot: 1 - 2 * (q.x * q.x + q.z * q.z),
          position: body.translation(),
        },
        bounds,
      );
    },
    reset() {
      const body = getBody();
      if (!body) return;
      placeOnSpot(body, IDENTITY_ROTATION);
      body.setEnabled(true);
      shownBeforeReplay = false;
      view.visible = true;
    },
    forceDown() {
      const body = getBody();
      if (!body) return;
      body.setEnabled(true); // the body must be active to be moved before it is retired
      placeOnSpot(body, LYING_ROTATION);
      shownBeforeReplay = false;
      retireBody(body);
    },
    retire() {
      const body = getBody();
      if (!body) return;
      shownBeforeReplay = false;
      retireBody(body);
    },
    pose() {
      const body = getBody();
      if (!body) return { enabled: false, position: [0, 0, 0], rotation: [0, 0, 0, 1] };
      const t = body.translation();
      const q = body.rotation();
      return { enabled: body.isEnabled(), position: [t.x, t.y, t.z], rotation: [q.x, q.y, q.z, q.w] };
    },
    hideForReplay() {
      const body = getBody();
      if (!body) return;
      // Hiding twice must not forget that the pin was in the game (the second time it is already disabled).
      shownBeforeReplay = shownBeforeReplay || body.isEnabled();
      retireBody(body);
    },
    restoreFromReplay(pose) {
      const body = getBody();
      if (!body) return;
      shownBeforeReplay = false;
      if (!pose.enabled) {
        retireBody(body);
        return;
      }
      body.setEnabled(true);
      body.setTranslation({ x: pose.position[0], y: pose.position[1], z: pose.position[2] }, true);
      body.setRotation({ x: pose.rotation[0], y: pose.rotation[1], z: pose.rotation[2], w: pose.rotation[3] }, true);
      body.setLinvel(ZERO, true);
      body.setAngvel(ZERO, true);
      view.visible = true;
    },
    showAfterReplay() {
      const body = getBody();
      if (!body || !shownBeforeReplay) return;
      shownBeforeReplay = false;
      body.setEnabled(true);
      view.visible = true;
    },
  };
}
