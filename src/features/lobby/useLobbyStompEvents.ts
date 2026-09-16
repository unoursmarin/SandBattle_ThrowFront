import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  gameStartedPayloadSchema,
  lobbySnapshotSchema,
  looseStompEnvelopeSchema,
  type LobbySnapshot,
} from "@/lib/api/schemas";
import { useRawStompSubscription, useStompReconnectResync } from "@/lib/stomp/useStompSubscription";

import { lobbyQueryKey } from "./useLobbyQuery";

//Events within the lobby
export function useLobbyStompEvents(lobbyId: string, onGameStarted: (gameSessionId: string) => void): void {
  const queryClient = useQueryClient();

  const handleMessage = useCallback(
    (raw: unknown) => {
      const envelope = looseStompEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        console.warn("Événement de lobby illisible ignoré", envelope.error);
        return;
      }

      if (envelope.data.type === "gameStarted") {
        const payload = gameStartedPayloadSchema.safeParse(envelope.data.payload);
        if (payload.success) {
          onGameStarted(payload.data.gameSessionId);
        }
        return;
      }

      const snapshot = lobbySnapshotSchema.safeParse(envelope.data.payload);
      if (snapshot.success) {
        queryClient.setQueryData<LobbySnapshot>(lobbyQueryKey(lobbyId), snapshot.data);
      }
    },
    [lobbyId, onGameStarted, queryClient],
  );

  useRawStompSubscription(`/topic/lobbies/${lobbyId}`, handleMessage);
  useStompReconnectResync(lobbyQueryKey(lobbyId));
}
