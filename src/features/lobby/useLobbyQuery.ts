import { useQuery } from "@tanstack/react-query";

import { getLobby } from "@/lib/api/endpoints";

export function lobbyQueryKey(lobbyId: string) {
  return ["lobby", lobbyId] as const;
}

export function useLobbyQuery(lobbyId: string) {
  return useQuery({
    queryKey: lobbyQueryKey(lobbyId),
    queryFn: () => getLobby(lobbyId),
  });
}
