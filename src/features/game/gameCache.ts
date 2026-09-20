import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { GameSessionSnapshot, RollUpdateEvent } from "@/lib/api/schemas";

// Merge a RollUpdateEvent into the cached GameSessionSnapshot. This is a helper for applyRollUpdate.
export function mergeRollUpdate(
  previous: GameSessionSnapshot | undefined,
  event: RollUpdateEvent,
): GameSessionSnapshot | undefined {
  if (!previous) return undefined;
  const hasPlayer = previous.players.some((p) => p.playerId === event.player.playerId);
  const players = hasPlayer
    ? previous.players.map((p) => (p.playerId === event.player.playerId ? event.player : p))
    : [...previous.players, event.player];

  return {
    ...previous,
    gameId: event.gameId,
    status: event.sessionCompleted ? "COMPLETED" : previous.status,
    currentPlayerId: event.nextPlayerId,
    players,
  };
}

// Applies a roll update to the cached game session, using mergeRollUpdate to integrate the event.
export function applyRollUpdate(
  queryClient: Pick<QueryClient, "getQueryData" | "setQueryData" | "invalidateQueries">,
  queryKey: QueryKey,
  event: RollUpdateEvent,
): void {
  if (queryClient.getQueryData<GameSessionSnapshot>(queryKey)) {
    queryClient.setQueryData<GameSessionSnapshot>(queryKey, (prev) => mergeRollUpdate(prev, event));
  } else {
    void queryClient.invalidateQueries({ queryKey });
  }
}
