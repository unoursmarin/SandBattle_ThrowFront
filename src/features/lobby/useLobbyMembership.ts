import { useCallback, useState } from "react";

import type { LobbyMembershipDto } from "@/lib/api/schemas";
import { clearMembership, loadMembership, saveMembership } from "@/lib/session/sessionStorage";

/**
 * Identité du joueur courant pour un lobby donné (memberId + jeton de
 * session), persistée en localStorage pour survivre à un rechargement.
 */
export function useLobbyMembership(lobbyId: string) {
  const [membership, setMembershipState] = useState<LobbyMembershipDto | null>(() =>
    loadMembership(lobbyId),
  );

  const setMembership = useCallback(
    (dto: LobbyMembershipDto) => {
      saveMembership(lobbyId, dto);
      setMembershipState(dto);
    },
    [lobbyId],
  );

  const clear = useCallback(() => {
    clearMembership(lobbyId);
    setMembershipState(null);
  }, [lobbyId]);

  return { membership, setMembership, clear };
}
