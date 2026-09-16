import { useQuery } from "@tanstack/react-query";

import { getGame, whoAmI } from "@/lib/api/endpoints";

export function gameQueryKey(gameId: string) {
  return ["game", gameId] as const;
}

export function useGameQuery(gameId: string) {
  return useQuery({
    queryKey: gameQueryKey(gameId),
    queryFn: () => getGame(gameId),
  });
}

export function useWhoAmIQuery(gameId: string, sessionToken: string | null) {
  return useQuery({
    queryKey: ["game", gameId, "me", sessionToken],
    queryFn: () => whoAmI(gameId, sessionToken as string),
    enabled: sessionToken !== null,
    staleTime: Infinity, // the player's identity in a game never changes
  });
}
