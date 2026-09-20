import type { World } from "@dimforge/rapier3d-compat";
import type { PinPose } from "@/lib/api/schemas";
import type { LaneLayout } from "../scene/laneSizes";
import { STICK_LENGTH, STICK_RADIUS, STICK_SETTLE_SPEED, STICK_TIP_AXIS } from "../scene/sceneConstants";
import { rotateByQuaternion } from "../scene/stickAerodynamics";
import { isStickSettled } from "../scene/stickThrowLogic";
import {
  pendingFromLaunch,
  stickAfterFirstStep,
  stickBeforeStep,
  type SandState,
  type StickLaunch,
} from "../scene/stickThrowSim";
import { isOnGround } from "./groundContact";
import { buildReplayWorld, type RapierModule } from "./replayWorld";
import { ThrowReplay, type ProjectileStrategy } from "./throwReplay";

/** Replay of a stick throw: one step, the launch impulse, then sand, rolling resistance and air at every step. */
export class StickReplay extends ThrowReplay {
  constructor(rapier: RapierModule, layout: LaneLayout, rack: readonly PinPose[], launch: StickLaunch) {
    let sand: SandState = "flying";
    let world: World | null = null;
    const strategy: ProjectileStrategy = {
      start: (w, stick) => {
        world = w;
        stick.setTranslation({ x: launch.origin[0], y: launch.origin[1], z: launch.origin[2] }, true);
        stick.setLinvel({ x: 0, y: 0, z: 0 }, true);
        stick.setAngvel({ x: 0, y: 0, z: 0 }, true);
        // Right after it is placed, applyImpulse* is a silent no-op: one step first, then the throw.
        world.step();
        stickAfterFirstStep(stick, pendingFromLaunch(launch));
      },
      beforeStep: (stick) => {
        sand = stickBeforeStep(stick, sand, world !== null && isOnGround(world, stick));
      },
      isSettled: (stick) => {
        const v = stick.linvel();
        const w = stick.angvel();
        return isStickSettled(
          [v.x, v.y, v.z],
          [w.x, w.y, w.z],
          rotateByQuaternion(stick.rotation(), STICK_TIP_AXIS),
          { radius: STICK_RADIUS, halfLength: STICK_LENGTH / 2 },
          STICK_SETTLE_SPEED,
        );
      },
    };
    super(buildReplayWorld(rapier, layout, "stick", rack), strategy);
  }
}
