import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createLobby, joinLobby, leaveLobby, setReady, startGame } from "@/lib/api/endpoints";
import type { LobbySnapshot } from "@/lib/api/schemas";

import { lobbyQueryKey } from "./useLobbyQuery";

export function useCreateLobbyMutation() {
  return useMutation({
    mutationFn: (displayName: string) => createLobby(displayName),
  });
}

export function useJoinLobbyMutation(lobbyId: string) {
  return useMutation({
    mutationFn: (displayName: string) => joinLobby(lobbyId, displayName),
  });
}

export function useSetReadyMutation(lobbyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { sessionToken: string; ready: boolean }) =>
      setReady(lobbyId, args.sessionToken, args.ready),
    onSuccess: (snapshot) => {
      queryClient.setQueryData<LobbySnapshot>(lobbyQueryKey(lobbyId), snapshot);
    },
  });
}

export function useLeaveLobbyMutation(lobbyId: string) {
  return useMutation({
    mutationFn: (sessionToken: string) => leaveLobby(lobbyId, sessionToken),
  });
}

export function useStartGameMutation(lobbyId: string) {
  return useMutation({
    mutationFn: (sessionToken: string) => startGame(lobbyId, sessionToken),
  });
}
