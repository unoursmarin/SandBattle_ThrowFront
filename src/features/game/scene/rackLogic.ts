// What the rack does with its 15 pins: count the ones that stand, put them back for the next roll,  take a snapshot for a throw.
import type { PinPose } from "@/lib/api/schemas";
import type { PinBodyPose, PinHandle } from "./pinController";
import { planRackReset } from "./pinSettleLogic";

// A slot of the rack: `null` until the pin has mounted.
export type RackPins = readonly (PinHandle | null)[];

// Pins that still stand: not retired, not fallen, not off the lane.
export function countStanding(pins: RackPins): number {
  return pins.reduce((count, pin) => count + (pin && !pin.isOutOfPlay() ? 1 : 0), 0);
}

// Takes out of the game the pins that fell or left the lane. 
export function retireFallenPins(pins: RackPins): void {
  pins.forEach((pin) => {
    if (pin?.isOutOfPlay()) pin.retire();
  });
}

// The pins right now, by index: what a replay of the throw about to happen starts from. 
export function snapshotPins(pins: RackPins): PinPose[] {
  return pins.flatMap((pin, index) => {
    if (!pin) return [];
    const { enabled, position: p, rotation: q } = pin.pose();
    return [{ index, standing: enabled, position: { x: p[0], y: p[1], z: p[2] }, rotation: { x: q[0], y: q[1], z: q[2], w: q[3] } }];
  });
}

// Puts each pin where a replayed throw left it
export function applyReplayResult(pins: RackPins, poses: readonly PinBodyPose[]): void {
  pins.forEach((pin, index) => {
    if (pin && poses[index]) pin.restoreFromReplay(poses[index]);
  });
  retireFallenPins(pins);
}


// Rack reset logic: decides which pins to reset and which to lay down based on the target standing count.
export function resetRackToTarget(pins: RackPins, target: number, totalPins: number): void {
  const plan = planRackReset(countStanding(pins), target, totalPins);
  if (plan.type === "noop") return;
  if (plan.type === "resetAll") {
    pins.forEach((pin) => pin?.reset());
    return;
  }
  pins.forEach((pin, index) => {
    if (index < plan.standCount) pin?.reset();
    else pin?.forceDown();
  });
}
