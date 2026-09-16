import { z } from "zod";

/**
 * Miroir des DTO backend (voir telemis-bowling/docs/architecture/api-rest.md
 * et websocket-stomp.md). Un seul endroit décrit la forme de chaque DTO ;
 * les types TypeScript en sont dérivés (`z.infer`), jamais dupliqués à la main.
 *
 * L'enveloppe générique (`ApiResponse<T>`, `StompEvent<T>`) est validée en
 * deux temps plutôt que via un schéma Zod paramétré par un type générique :
 * composer `z.object({ data: T.nullable() })` pour un `T extends
 * z.ZodTypeAny` produit une inférence de type incorrecte avec cette version
 * de Zod (le champ générique disparaît du type inféré). On valide donc
 * d'abord l'enveloppe à forme fixe (`data`/`payload` en `unknown`), puis le
 * contenu générique séparément avec son propre schéma.
 */

export const frameStatusSchema = z.enum(["IN_PROGRESS", "OPEN", "SPARE", "STRIKE"]);
export type FrameStatus = z.infer<typeof frameStatusSchema>;

export const gameSessionStatusSchema = z.enum(["IN_PROGRESS", "COMPLETED", "ABANDONED"]);
export type GameSessionStatus = z.infer<typeof gameSessionStatusSchema>;

export const lobbyStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "ABANDONED"]);
export type LobbyStatus = z.infer<typeof lobbyStatusSchema>;

export const frameSnapshotSchema = z.object({
  number: z.number().int(),
  rolls: z.array(z.number().int()),
  status: frameStatusSchema,
  score: z.number().int(),
});
export type FrameSnapshot = z.infer<typeof frameSnapshotSchema>;

export const playerStateSnapshotSchema = z.object({
  playerId: z.string().uuid(),
  displayName: z.string(),
  frames: z.array(frameSnapshotSchema),
  totalScore: z.number().int(),
  complete: z.boolean(),
});
export type PlayerStateSnapshot = z.infer<typeof playerStateSnapshotSchema>;

export const gameSessionSnapshotSchema = z.object({
  gameId: z.string().uuid(),
  status: gameSessionStatusSchema,
  currentPlayerId: z.string().uuid().nullable(),
  players: z.array(playerStateSnapshotSchema),
});
export type GameSessionSnapshot = z.infer<typeof gameSessionSnapshotSchema>;

export const rollUpdateEventSchema = z.object({
  gameId: z.string().uuid(),
  player: playerStateSnapshotSchema,
  nextPlayerId: z.string().uuid().nullable(),
  sessionCompleted: z.boolean(),
});
export type RollUpdateEvent = z.infer<typeof rollUpdateEventSchema>;

export const gameStartedPayloadSchema = z.object({
  gameSessionId: z.string().uuid(),
});
export type GameStartedPayload = z.infer<typeof gameStartedPayloadSchema>;

export const mePayloadSchema = z.object({
  playerId: z.string().uuid(),
  displayName: z.string(),
});
export type MePayload = z.infer<typeof mePayloadSchema>;

export const lobbyMemberSnapshotSchema = z.object({
  memberId: z.string().uuid(),
  displayName: z.string(),
  ready: z.boolean(),
});
export type LobbyMemberSnapshot = z.infer<typeof lobbyMemberSnapshotSchema>;

export const lobbySnapshotSchema = z.object({
  lobbyId: z.string().uuid(),
  status: lobbyStatusSchema,
  hostMemberId: z.string().uuid().nullable(),
  gameSessionId: z.string().uuid().nullable(),
  members: z.array(lobbyMemberSnapshotSchema),
});
export type LobbySnapshot = z.infer<typeof lobbySnapshotSchema>;

export const lobbyMembershipDtoSchema = z.object({
  lobbyId: z.string().uuid(),
  memberId: z.string().uuid(),
  displayName: z.string(),
  sessionToken: z.string().uuid(),
});
export type LobbyMembershipDto = z.infer<typeof lobbyMembershipDtoSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;

/** Enveloppe REST à forme fixe (voir note en tête de fichier) : `data` est validé séparément. */
export const looseApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  error: apiErrorSchema.nullable(),
});
export type ApiResponse<T> = { success: boolean; data: T | null; error: ApiErrorPayload | null };

/** Enveloppe STOMP à forme fixe (voir note en tête de fichier) : `payload` est validé séparément. */
export const looseStompEnvelopeSchema = z.object({
  type: z.string(),
  id: z.string().uuid(),
  payload: z.unknown(),
  timestamp: z.string(),
});
export type StompEvent<T> = { type: string; id: string; payload: T; timestamp: string };
