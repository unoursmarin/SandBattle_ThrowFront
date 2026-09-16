import { useCallback, useState } from "react";

import { loadLaneSize, saveLaneSize } from "@/lib/session/sessionStorage";
import type { LaneSize } from "@/features/game/scene/laneSizes";

// Use hook for managing the current player's lane size
export function useLaneSize() {
  const [size, setSizeState] = useState<LaneSize>(() => loadLaneSize());

  const setSize = useCallback((next: LaneSize) => {
    saveLaneSize(next);
    setSizeState(next);
  }, []);

  return { size, setSize };
}
