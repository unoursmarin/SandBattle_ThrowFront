import type { LaneSize } from "../scene/laneSizes";
import type { ProjectileType } from "../scene/projectileTypes";
import type { PinPose, ThrowLaunchPayload, ThrowSnapshot } from "@/lib/api/schemas";
import type { LaunchVariables, ThrowCapture } from "./replayTypes";

export type CapturedThrow = {
  capture: ThrowCapture;
  // The pins at the release: poses, and whether each is still in the game. 
  rack: PinPose[];
  laneSize: LaneSize;
};

export function buildThrowLaunchPayload(thrown: CapturedThrow): ThrowLaunchPayload {
  const { launch } = thrown.capture;
  return {
    projectile: thrown.capture.projectile,
    laneSize: thrown.laneSize,
    origin: { x: launch.origin[0], y: launch.origin[1], z: launch.origin[2] },
    velocity: { x: launch.velocity[0], y: launch.velocity[1], z: launch.velocity[2] },
    gripOffset: launch.gripOffset,
    rack: thrown.rack,
  };
}

/** Everything a replay needs, read back from a throw the server relayed (or captured by the thrower's own scene). */
export type ReplayInput = {
  throwId: string;
  playerId: string;
  projectile: ProjectileType;
  laneSize: LaneSize;
  launch: LaunchVariables;
  // The rack at the release, by pin index. 
  rack: PinPose[];
  // The thrower's own replay: it also decides the score and gives the rack its next state. 
  own: boolean;
};

// `null` when the server relayed no rack (nothing to start the replay from). 
export function replayInputFromSnapshot(snapshot: ThrowSnapshot): ReplayInput | null {
  const { launch } = snapshot;
  if (launch.rack.length === 0) return null;
  return {
    throwId: snapshot.throwId,
    playerId: snapshot.playerId,
    projectile: launch.projectile,
    laneSize: launch.laneSize,
    launch: {
      origin: [launch.origin.x, launch.origin.y, launch.origin.z],
      velocity: [launch.velocity.x, launch.velocity.y, launch.velocity.z],
      gripOffset: launch.gripOffset,
    },
    rack: launch.rack,
    own: false,
  };
}
