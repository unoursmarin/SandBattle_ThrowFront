import type { PinPose } from "@/lib/api/schemas";
import { ballBeforeStep, ballTrackFor, launchBall } from "../scene/ballThrowSim";
import type { LaneLayout } from "../scene/laneSizes";
import { BALL_RADIUS } from "../scene/sceneConstants";
import { buildReplayWorld, type RapierModule } from "./replayWorld";
import { ThrowReplay, type ProjectileStrategy } from "./throwReplay";

// Same thresholds as a rolling ball has always used: slower than this is at rest.
const SETTLE_LINEAR_THRESHOLD = 0.05;
const SETTLE_ANGULAR_THRESHOLD = 1;

// Replay of a ball throw: the release velocity, then the deceleration and height at every step.
export class BallReplay extends ThrowReplay {
  constructor(
    rapier: RapierModule,
    layout: LaneLayout,
    rack: readonly PinPose[],
    launch: { origin: readonly [number, number, number]; velocity: readonly [number, number, number] },
  ) {
    const track = ballTrackFor(layout);
    const strategy: ProjectileStrategy = {
      start: (_world, ball) => {
        ball.setTranslation({ x: launch.origin[0], y: launch.origin[1], z: launch.origin[2] }, true);
        launchBall(ball, launch.velocity[0], launch.velocity[2]);
      },
      beforeStep: (ball) => ballBeforeStep(ball, track),
      isSettled: (ball) => {
        const v = ball.linvel();
        const speed = Math.hypot(v.x, v.z);
        return speed < SETTLE_LINEAR_THRESHOLD && speed / BALL_RADIUS < SETTLE_ANGULAR_THRESHOLD;
      },
    };
    super(buildReplayWorld(rapier, layout, "ball", rack), strategy);
  }
}
