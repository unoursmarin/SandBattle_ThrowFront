import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { Pin, type PinHandle } from "./Pin";
import { buildPinPositions, PIN_POSITIONS } from "./pinPositions";
import type { LaneLayout } from "./laneSizes";
import { hasBeenStableLongEnough, planRackReset, updateStableSince } from "./pinSettleLogic";

// A pin can wimble after being touched
const PIN_SETTLE_DURATION_MS = 400;

export interface PinRackHandle {
  // The nyumber of pin standing 
  countStanding(): number;
  //  No pin are standing anymore 
  arePinsSettled(): boolean;
  retireFallenPins(): void;
}

/**
 * Rack of 15 pins at each changes we compare it with the actual value of pins standing. 
 */
export const PinRack = forwardRef<PinRackHandle, { pinsStanding: number; rollSequence: number; layout?: LaneLayout }>(function PinRack(
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
            maxAbsX: layout.gutterOuterHalfWidth + 0.3,
            maxAbsZ: layout.laneHalfLength + 1,
            minY: -1,
          }
        : undefined,
    [layout],
  );
  const pinRefs = useRef<(PinHandle | null)[]>([]);
  //Since when all the pins are stable 
  const allPinsStableSinceRef = useRef<number | null>(null);

  // Fallen or out of place = Out. 
  function countStanding(): number {
    return pinRefs.current.reduce((count, pin) => count + (pin && !pin.isOutOfPlay() ? 1 : 0), 0);
  }


  function isPinSettled(pin: PinHandle): boolean {
    return pin.isFallen() || !pin.isMoving() || pin.isOffLane();
  }

  useFrame(() => {
    const allSettled = pinRefs.current.every((pin) => !pin || isPinSettled(pin));
    allPinsStableSinceRef.current = updateStableSince(allPinsStableSinceRef.current, allSettled, performance.now());
  });

  function arePinsSettled(): boolean {
    return hasBeenStableLongEnough(allPinsStableSinceRef.current, performance.now(), PIN_SETTLE_DURATION_MS);
  }

  function retireFallenPins(): void {
    pinRefs.current.forEach((pin) => {
      if (pin?.isOutOfPlay()) pin.retire();
    });
  }

  useImperativeHandle(ref, () => ({ countStanding, arePinsSettled, retireFallenPins }));

  // Brings back to position
  function resetRackToTarget(target: number) {
    const plan = planRackReset(countStanding(), target, positions.length);
    if (plan.type === "noop") return;
    if (plan.type === "resetAll") {
      pinRefs.current.forEach((pin) => pin?.reset());
      return;
    }
    pinRefs.current.forEach((pin, index) => {
      if (index < plan.standCount) pin?.reset();
      else pin?.forceDown();
    });
  }

  useEffect(() => {
    resetRackToTarget(pinsStanding);
    // `resetRackToTarget` reads reference at the given time
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
});
