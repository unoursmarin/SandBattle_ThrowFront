import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { rollUpdateEventSchema, type GameSessionSnapshot, type RollUpdateEvent, type StompEvent } from "@/lib/api/schemas";
import { useStompReconnectResync, useStompSubscription } from "@/lib/stomp/useStompSubscription";

import { gameQueryKey } from "./useGameQuery";
import { mergeRollUpdate } from "./gameCache";

/** /topic/games/{id} is homogeneous: only rollRegistered events. */
export function useGameStompEvents(gameId: string): void {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    (event: StompEvent<RollUpdateEvent>) => {
      queryClient.setQueryData<GameSessionSnapshot>(gameQueryKey(gameId), (prev) =>
        mergeRollUpdate(prev, event.payload),
      );
    },
    [gameId, queryClient],
  );

  useStompSubscription(`/topic/games/${gameId}`, rollUpdateEventSchema, handleEvent);
  useStompReconnectResync(gameQueryKey(gameId));
}
