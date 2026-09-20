import type { StickLaunch } from "../scene/stickThrowSim";

// The variables that define a throw from the instant the projectile leaves the hand. */
export type LaunchVariables = {
  // Position of the projectile's centre at the release, m. */
  origin: readonly [number, number, number];
  // Launch velocity, m/s: the stick's includes its solved lob, the ball rolls flat (vy = 0). 
  velocity: readonly [number, number, number];
  // Stick only: where it was held along its axis, m from its centre. 
  gripOffset: number | null;
};

// What the scene captures at the instant of a release: the projectile and how it was launched. 
export type ThrowCapture = {
  projectile: "ball" | "stick";
  launch: LaunchVariables;
};

// A stick launch as `stickThrowSim` wants it. 
export function toStickLaunch(launch: LaunchVariables): StickLaunch {
  return { origin: launch.origin, velocity: launch.velocity, gripOffset: launch.gripOffset ?? 0 };
}
