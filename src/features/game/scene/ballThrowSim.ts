import { BALL_RADIUS, GUTTER_BOTTOM_Y } from "./sceneConstants";
import type { LaneLayout } from "./laneSizes";
import { decelerateSpeed } from "./ballRollLogic";
import { PHYSICS_TIMESTEP } from "./stickThrowSim";

export const BALL_STOP_ZONE_DECELERATION = 8; // m/s² — rate of the deceleration in the stop zone
const STOP_ZONE_MARGIN = 0.5; // m — margin after the last row before the deceleration applies
const HEIGHT_FOLLOW_PER_SECOND = 12;
const GUTTER_REST_Y = GUTTER_BOTTOM_Y + BALL_RADIUS;
const HEIGHT_EPSILON = 1e-5;

// What the layout of the lane says about how the ball rolls on it. 
export type BallTrack = {
  // Beyond this z (towards the pins) the ball is slowed down. 
  stopZoneZ: number;
  // Height of the ball's centre when it rolls at lateral position `x`: on the lane, or in a gutter. 
  restHeight: (x: number) => number;
};

export function ballTrackFor(layout: LaneLayout): BallTrack {
  return {
    stopZoneZ: layout.pinTipRowZ - (layout.pinRowSizes.length - 1) * layout.pinRowSpacing - STOP_ZONE_MARGIN,
    restHeight: (x) => (Math.abs(x) <= layout.laneHalfWidth ? layout.ballRest[1] : GUTTER_REST_Y),
  };
}

// Rolling without slipping: ω = (n × v) / r with n = (0, 1, 0). 
export function ballRollingSpin(vx: number, vz: number): { x: number; y: number; z: number } {
  const speed = Math.hypot(vx, vz);
  if (speed <= 0) return { x: 0, y: 0, z: 0 };
  const angularSpeed = speed / BALL_RADIUS;
  return { x: (vz / speed) * angularSpeed, y: 0, z: (-vx / speed) * angularSpeed };
}

export type BallSimBody = {
  translation(): { x: number; y: number; z: number };
  linvel(): { x: number; y: number; z: number };
  setTranslation(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setLinvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setAngvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
};

/** The release: the gesture's horizontal velocity, and the spin of a ball that rolls. */
export function launchBall(body: BallSimBody, vx: number, vz: number): void {
  body.setLinvel({ x: vx, y: 0, z: vz }, true);
  if (Math.hypot(vx, vz) > 0) body.setAngvel(ballRollingSpin(vx, vz), true);
}

// Before every physics step of a rolling ball: the manual deceleration once it is past the last
// row (the roll without slipping is preserved: ω = v / r stays true), then its height, which
// follows the lane (or a gutter) by hand.
export function ballBeforeStep(body: BallSimBody, track: BallTrack): void {
  const t = body.translation();
  const linvel = body.linvel();
  const currentSpeed = Math.hypot(linvel.x, linvel.z);
  const speed = decelerateSpeed(currentSpeed, t.z <= track.stopZoneZ, BALL_STOP_ZONE_DECELERATION, PHYSICS_TIMESTEP);
  if (speed !== currentSpeed && currentSpeed > 0) {
    const scale = speed / currentSpeed;
    const vx = linvel.x * scale;
    const vz = linvel.z * scale;
    body.setLinvel({ x: vx, y: 0, z: vz }, true);
    body.setAngvel(ballRollingSpin(vx, vz), true);
  }

  const targetY = track.restHeight(t.x);
  const newY = targetY + (t.y - targetY) * Math.exp(-HEIGHT_FOLLOW_PER_SECOND * PHYSICS_TIMESTEP);
  if (Math.abs(newY - t.y) > HEIGHT_EPSILON) {
    body.setTranslation({ x: t.x, y: newY, z: t.z }, true);
  }
}
