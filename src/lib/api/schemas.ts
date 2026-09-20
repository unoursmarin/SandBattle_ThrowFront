import { z } from "zod";

// Mirror of the backend DTOs (see telemis-bowling/docs/architecture/api-rest.md and websocket-stomp.md)
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
export const projectileTypeSchema = z.enum(["ball", "stick"]);
export const laneSizeSchema = z.enum(["small", "medium", "large"]);
export type ProjectileSetting = z.infer<typeof projectileTypeSchema>;
export type LaneSizeSetting = z.infer<typeof laneSizeSchema>;

export const gameSessionSnapshotSchema = z.object({
  gameId: z.string().uuid(),
  status: gameSessionStatusSchema,
  currentPlayerId: z.string().uuid().nullable(),
  players: z.array(playerStateSnapshotSchema),
  // Chosen by the host, the same for every player. The defaults are what a game WAS before these settings
  // existed (an older backend sends none): they are not the lobby's preselection .
  projectile: projectileTypeSchema.default("ball"),
  laneSize: laneSizeSchema.default("medium"),
});
export type GameSessionSnapshot = z.infer<typeof gameSessionSnapshotSchema>;

export const rollUpdateEventSchema = z.object({
  gameId: z.string().uuid(),
  player: playerStateSnapshotSchema,
  nextPlayerId: z.string().uuid().nullable(),
  sessionCompleted: z.boolean(),
});
export type RollUpdateEvent = z.infer<typeof rollUpdateEventSchema>;


const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const quatSchema = z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() });

export const pinPoseSchema = z.object({
  index: z.number().int().min(0).max(14),
  standing: z.boolean(),
  position: vec3Schema,
  rotation: quatSchema,
});
export type PinPose = z.infer<typeof pinPoseSchema>;

export const throwLaunchSchema = z.object({
  projectile: projectileTypeSchema,
  laneSize: laneSizeSchema,
  origin: vec3Schema,
  velocity: vec3Schema,
  gripOffset: z.number().nullable(),
  rack: z.array(pinPoseSchema),
});
export type ThrowLaunchPayload = z.infer<typeof throwLaunchSchema>;

export const throwSnapshotSchema = z.object({
  throwId: z.string().uuid(),
  gameId: z.string().uuid(),
  playerId: z.string().uuid(),
  attemptIndex: z.number().int(),
  frameNumber: z.number().int(),
  status: z.enum(["STARTED", "COMPLETED"]),
  pinsFelled: z.number().int().nullable(),
  launch: throwLaunchSchema,
  startedAtEpochMs: z.number(),
});
export type ThrowSnapshot = z.infer<typeof throwSnapshotSchema>;

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

export const looseApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  error: apiErrorSchema.nullable(),
});
export type ApiResponse<T> = { success: boolean; data: T | null; error: ApiErrorPayload | null };

export const looseStompEnvelopeSchema = z.object({
  type: z.string(),
  id: z.string().uuid(),
  payload: z.unknown(),
  timestamp: z.string(),
});
export type StompEvent<T> = { type: string; id: string; payload: T; timestamp: string };
