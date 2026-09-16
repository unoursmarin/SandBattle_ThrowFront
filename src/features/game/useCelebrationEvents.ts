import { useEffect, useRef, useState } from "react";

import type { PlayerStateSnapshot } from "@/lib/api/schemas";

import type { CelebrationEvent } from "./scene/Confetti";

// Detects spare/strike/game completion transitions for this player (`me`),
export function useCelebrationEvents(me: PlayerStateSnapshot | undefined): CelebrationEvent | null {
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  const seenFramesRef = useRef<Set<number> | null>(null);
  const seenCompleteRef = useRef(false);

  useEffect(() => {
    if (!me) return;

    if (seenFramesRef.current === null) {
      seenFramesRef.current = new Set(
        me.frames.filter((frame) => frame.status === "STRIKE" || frame.status === "SPARE").map((frame) => frame.number),
      );
      seenCompleteRef.current = me.complete;
      return;
    }

    let nextCelebration: CelebrationEvent | null = null;
    for (const frame of me.frames) {
      if (frame.status !== "STRIKE" && frame.status !== "SPARE") continue;
      if (seenFramesRef.current.has(frame.number)) continue;
      seenFramesRef.current.add(frame.number);
      nextCelebration = { kind: frame.status === "STRIKE" ? "strike" : "spare", key: Date.now() };
    }

    if (me.complete && !seenCompleteRef.current) {
      seenCompleteRef.current = true;
      nextCelebration = { kind: "gameComplete", key: Date.now() };
    }

    if (nextCelebration) setCelebration(nextCelebration);
  }, [me]);

  return celebration;
}
