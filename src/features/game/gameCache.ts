import type { GameSessionSnapshot, RollUpdateEvent } from "@/lib/api/schemas";

// Merges a RollUpdateEvent into the cached GameSessionSnapshot. This handles updates
// from both REST mutation responses and STOMP `rollRegistered` messages.
export function mergeRollUpdate(
  previous: GameSessionSnapshot | undefined,
  event: RollUpdateEvent,
): GameSessionSnapshot {
  const players = previous?.players ?? [];
  const hasPlayer = players.some((p) => p.playerId === event.player.playerId);
  const updatedPlayers = hasPlayer
    ? players.map((p) => (p.playerId === event.player.playerId ? event.player : p))
    : [...players, event.player];

  return {
    gameId: event.gameId,
    status: event.sessionCompleted ? "COMPLETED" : (previous?.status ?? "IN_PROGRESS"),
    currentPlayerId: event.nextPlayerId,
    players: updatedPlayers,
  };
}
