import { useCallback, useState } from "react";

import { loadProjectileChoice, saveProjectileChoice } from "@/lib/session/sessionStorage";
import type { ProjectileType } from "@/features/game/scene/projectileTypes";

// Throwable object representing the current player's choice (ball vs stick), persisted in sessionStorage to survive reloads within the same tab.
export function useProjectileChoice() {
  const [choice, setChoiceState] = useState<ProjectileType>(() => loadProjectileChoice());

  const setChoice = useCallback((next: ProjectileType) => {
    saveProjectileChoice(next);
    setChoiceState(next);
  }, []);

  return { choice, setChoice };
}
