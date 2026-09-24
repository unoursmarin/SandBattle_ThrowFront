import { lobbyMembershipDtoSchema, type LobbyMembershipDto } from "@/lib/api/schemas";
import { isLaneSize, type LaneSize } from "@/features/game/scene/laneSizes";
import { isProjectileType, type ProjectileType } from "@/features/game/scene/projectileTypes";

// Persists the session token per lobby in `sessionStorage`.
function storageKey(lobbyId: string): string {
  return `sandbatlle.session.${lobbyId}`;
}

export function saveMembership(lobbyId: string, membership: LobbyMembershipDto): void {
  try {
    sessionStorage.setItem(storageKey(lobbyId), JSON.stringify(membership));
  } catch {
    // Storage unavailable (private browsing, quota exceeded): silent degradation.
  }
}

export function loadMembership(lobbyId: string): LobbyMembershipDto | null {
  try {
    const raw = sessionStorage.getItem(storageKey(lobbyId));
    if (!raw) return null;
    const result = lobbyMembershipDtoSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function clearMembership(lobbyId: string): void {
  try {
    sessionStorage.removeItem(storageKey(lobbyId));
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

// The session token remains valid from the lobby join until the end of the game
// (PlayerGameState reuses the token from the LobbyMember), but playerId != memberId:
// we republish the token under a key scoped to the game at the moment of the
// lobby -> game transition, so that the game screen (route /game/:gameId, without
// knowledge of the lobbyId) can find it after a reload.
function gameStorageKey(gameId: string): string {
  return `sandbatlle.session.game.${gameId}`;
}

export function saveGameSessionToken(gameId: string, sessionToken: string): void {
  try {
    sessionStorage.setItem(gameStorageKey(gameId), sessionToken);
  } catch {
    // Silent degradation (see saveMembership).
  }
}

export function loadGameSessionToken(gameId: string): string | null {
  try {
    return sessionStorage.getItem(gameStorageKey(gameId));
  } catch {
    return null;
  }
}

// Key for storing the player's chosen projectile type in sessionStorage.
const PROJECTILE_CHOICE_KEY = "sandbatlle.projectileChoice";
/** What the lobby preselects for the host (a UI preference, unrelated to the fallback for a game with no settings). */
const DEFAULT_PROJECTILE: ProjectileType = "stick";

export function saveProjectileChoice(choice: ProjectileType): void {
  try {
    sessionStorage.setItem(PROJECTILE_CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // Silent degradation (see saveMembership).
  }
}

export function loadProjectileChoice(): ProjectileType {
  try {
    const raw = sessionStorage.getItem(PROJECTILE_CHOICE_KEY);
    if (!raw) return DEFAULT_PROJECTILE;
    const parsed: unknown = JSON.parse(raw);
    return isProjectileType(parsed) ? parsed : DEFAULT_PROJECTILE;
  } catch {
    return DEFAULT_PROJECTILE;
  }
}

// Length of the lane chosen in the lobby.
const LANE_SIZE_KEY = "sandbatlle.laneSize";

export function saveLaneSize(size: LaneSize): void {
  try {
    sessionStorage.setItem(LANE_SIZE_KEY, JSON.stringify(size));
  } catch {
    // Silent degradation (see saveMembership).
  }
}

export function loadLaneSize(): LaneSize {
  try {
    const raw = sessionStorage.getItem(LANE_SIZE_KEY);
    if (!raw) return "small";
    const parsed: unknown = JSON.parse(raw);
    return isLaneSize(parsed) ? parsed : "small";
  } catch {
    return "small";
  }
}
