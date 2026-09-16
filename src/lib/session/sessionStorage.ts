import { lobbyMembershipDtoSchema, type LobbyMembershipDto } from "@/lib/api/schemas";
import { isLaneSize, type LaneSize } from "@/features/game/scene/laneSizes";
import { isProjectileType, type ProjectileType } from "@/features/game/scene/projectileTypes";

/**
 * Persiste le jeton de session par lobby en `sessionStorage` (voir
 * docs/architecture/api-integration.md) : jamais en cookie, jamais envoyé
 * ailleurs qu'en en-tête X-Session-Token vers le backend.
 *
 * `sessionStorage`, pas `localStorage` : ce dernier est partagé entre tous
 * les onglets d'une même origine. Deux joueurs distincts dans deux onglets
 * du même navigateur (constaté en test manuel — deux personnes qui jouent
 * l'une contre l'autre sur le même ordinateur, un scénario réel pour ce
 * produit) écrivent alors sous la MÊME clé (`telemis.session.<lobbyId>`) :
 * le second `setItem` écrase le jeton du premier, et l'écran de jeu de
 * chacun peut se retrouver à lire le jeton de l'autre joueur — un vrai
 * mélange d'identité, pas un détail cosmétique. `sessionStorage` isole
 * chaque onglet nativement (aucune clé à faire porter cette isolation) tout
 * en survivant à un rechargement de page dans CE même onglet, qui reste le
 * vrai besoin (voir `saveGameSessionToken` plus bas) — jamais un partage
 * intentionnel entre onglets, qui n'a pas de cas d'usage ici.
 */

function storageKey(lobbyId: string): string {
  return `telemis.session.${lobbyId}`;
}

export function saveMembership(lobbyId: string, membership: LobbyMembershipDto): void {
  try {
    sessionStorage.setItem(storageKey(lobbyId), JSON.stringify(membership));
  } catch {
    // Stockage indisponible (navigation privée, quota) : dégradation
    // silencieuse, le joueur devra simplement rejoindre à nouveau si le
    // rechargement de page perd le jeton en mémoire.
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
    // Rien à faire si le stockage est indisponible.
  }
}

/**
 * Le jeton de session reste valide de la jointure du lobby jusqu'à la fin
 * de la partie (PlayerGameState réutilise le jeton du LobbyMember), mais
 * playerId != memberId : on republie le jeton sous une clé scopée à la
 * partie au moment de la transition lobby -> partie, pour que l'écran de
 * jeu (route /game/:gameId, sans connaissance du lobbyId) puisse le
 * retrouver après un rechargement.
 */
function gameStorageKey(gameId: string): string {
  return `telemis.session.game.${gameId}`;
}

export function saveGameSessionToken(gameId: string, sessionToken: string): void {
  try {
    sessionStorage.setItem(gameStorageKey(gameId), sessionToken);
  } catch {
    // Dégradation silencieuse (voir saveMembership).
  }
}

export function loadGameSessionToken(gameId: string): string | null {
  try {
    return sessionStorage.getItem(gameStorageKey(gameId));
  } catch {
    return null;
  }
}

/**
 * Objet de lancer choisi en lobby (boule vs bâton, voir projectileTypes.ts) :
 * même `sessionStorage` que le membership (isolation par onglet — deux
 * joueurs sur la même machine gardent chacun leur choix), mais clé GLOBALE
 * (pas scopée au lobby : le choix suit le joueur d'une partie à l'autre).
 * Purement client : le serveur ne reçoit que le nombre de quilles tombées.
 */
const PROJECTILE_CHOICE_KEY = "telemis.projectileChoice";

export function saveProjectileChoice(choice: ProjectileType): void {
  try {
    sessionStorage.setItem(PROJECTILE_CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // Dégradation silencieuse (voir saveMembership).
  }
}

export function loadProjectileChoice(): ProjectileType {
  try {
    const raw = sessionStorage.getItem(PROJECTILE_CHOICE_KEY);
    if (!raw) return "ball";
    const parsed: unknown = JSON.parse(raw);
    return isProjectileType(parsed) ? parsed : "ball";
  } catch {
    return "ball";
  }
}

/**
 * Taille de piste choisie en lobby (voir laneSizes.ts) : même persistance
 * `sessionStorage` globale que le projectile — suit le joueur d'une partie
 * à l'autre, purement client.
 */
const LANE_SIZE_KEY = "telemis.laneSize";

export function saveLaneSize(size: LaneSize): void {
  try {
    sessionStorage.setItem(LANE_SIZE_KEY, JSON.stringify(size));
  } catch {
    // Dégradation silencieuse (voir saveMembership).
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
