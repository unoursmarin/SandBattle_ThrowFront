import { useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { RollUpdateEvent, ThrowSnapshot } from "@/lib/api/schemas";
import { useRawStompSubscription, useStompReconnectResync } from "@/lib/stomp/useStompSubscription";

import { createGameMessageRouter } from "./gameMessageRouter";
import { gameQueryKey } from "./useGameQuery";
import { applyRollUpdate } from "./gameCache";

export type GameStompOptions = {
  //  a player just released a projectile: `snapshot` holds the launch, to replay. 
  onThrowStarted?: (snapshot: ThrowSnapshot) => void;
  // scores are held back until setted true by   `flushDeferredRolls` releases them. 
  shouldDeferRolls?: () => boolean;
};

export function useGameStompEvents(gameId: string, options: GameStompOptions = {}): { flushDeferredRolls: () => void } {
  const queryClient = useQueryClient();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const router = useMemo(
    () =>
      createGameMessageRouter({
        applyRoll: (event: RollUpdateEvent) => applyRollUpdate(queryClient, gameQueryKey(gameId), event),
        onThrowStarted: (snapshot) => optionsRef.current.onThrowStarted?.(snapshot),
        shouldDeferRolls: () => optionsRef.current.shouldDeferRolls?.() ?? false,
      }),
    [gameId, queryClient],
  );

  useRawStompSubscription(`/topic/games/${gameId}`, router.handle);
  useStompReconnectResync(gameQueryKey(gameId));
  return { flushDeferredRolls: useCallback(() => router.flushDeferred(), [router]) };
}
