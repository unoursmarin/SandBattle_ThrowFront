import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { Pin } from "./Pin";
import type { PinBodyPose, PinHandle } from "./pinController";
import { applyReplayResult, countStanding, resetRackToTarget, retireFallenPins, snapshotPins } from "./rackLogic";
import { buildPinPositions, PIN_POSITIONS } from "./pinPositions";
import type { LaneLayout } from "./laneSizes";
import type { PinPose } from "@/lib/api/schemas";
import { PIN_OFF_LANE_MARGIN } from "./sceneConstants";

export interface PinRackHandle {
  // The nyumber of pin standing 
  countStanding(): number;
  retireFallenPins(): void;
  /** The pins right now, by index: what a replay of the throw about to happen starts from. */
  snapshotPins(): PinPose[];
  /** Hides the whole rack while a throw is replayed; `showAfterReplay` brings it back as it was (another player's throw, or a replay cut short). */
  hideForReplay(): void;
  showAfterReplay(): void;
  /**
   * What a replayed throw left of the rack (see settleRack), by index: the pins still in play are put
   * on their own spots, upright, and the ones that fell leave the game, like after any roll.
   */
  applyReplayResult(poses: readonly PinBodyPose[]): void;
}

/**
 * Rack of 15 pins at each changes we compare it with the actual value of pins standing.
 * The pins here are INERT: their poses are set by code (a fresh frame, or where a replayed throw
 * left them), never by physics. The physics of a throw is played in a private world (see replayWorld.ts),
 * so nothing in this scene can knock a pin over by itself.
 */
export const PinRack = memo(forwardRef<PinRackHandle, { pinsStanding: number; rollSequence: number; layout?: LaneLayout }>(function PinRack(
  { pinsStanding, rollSequence, layout },
  ref,
) {
  // 
  // Out of that we don't count anymore.
  const positions = useMemo(() => (layout ? buildPinPositions(layout) : PIN_POSITIONS), [layout]);
  const bounds = useMemo(
    () =>
      layout
        ? {
            maxAbsX: layout.gutterOuterHalfWidth + PIN_OFF_LANE_MARGIN,
            maxAbsZ: layout.laneHalfLength + PIN_OFF_LANE_MARGIN,
            minY: -1,
          }
        : undefined,
    [layout],
  );
  const pinRefs = useRef<(PinHandle | null)[]>([]);

  useImperativeHandle(ref, () => ({
    countStanding: () => countStanding(pinRefs.current),
    retireFallenPins: () => retireFallenPins(pinRefs.current),
    snapshotPins: () => snapshotPins(pinRefs.current),
    hideForReplay: () => pinRefs.current.forEach((pin) => pin?.hideForReplay()),
    showAfterReplay: () => pinRefs.current.forEach((pin) => pin?.showAfterReplay()),
    applyReplayResult: (poses) => applyReplayResult(pinRefs.current, poses),
  }));

  useEffect(() => {
    resetRackToTarget(pinRefs.current, pinsStanding, positions.length);
    // The pins are read from the refs at the given time.
  }, [pinsStanding, rollSequence]);

  return (
    <group>
      {positions.map((position, index) => (
        <Pin
          key={index}
          ref={(handle) => {
            pinRefs.current[index] = handle;
          }}
          position={position}
          bounds={bounds}
        />
      ))}
    </group>
  );
}));
