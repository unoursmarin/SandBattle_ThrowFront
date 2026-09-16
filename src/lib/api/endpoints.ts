import { z } from "zod";

import { apiFetch } from "./client";
import {
  gameSessionSnapshotSchema,
  gameStartedPayloadSchema,
  lobbyMembershipDtoSchema,
  lobbySnapshotSchema,
  mePayloadSchema,
  rollUpdateEventSchema,
} from "./schemas";

export function createLobby(displayName: string) {
  return apiFetch("/lobbies", {
    method: "POST",
    body: { displayName },
    dataSchema: lobbyMembershipDtoSchema,
  });
}

export function joinLobby(lobbyId: string, displayName: string) {
  return apiFetch(`/lobbies/${lobbyId}/join`, {
    method: "POST",
    body: { displayName },
    dataSchema: lobbyMembershipDtoSchema,
  });
}

export function getLobby(lobbyId: string) {
  return apiFetch(`/lobbies/${lobbyId}`, { dataSchema: lobbySnapshotSchema });
}

export function setReady(lobbyId: string, sessionToken: string, ready: boolean) {
  return apiFetch(`/lobbies/${lobbyId}/ready`, {
    method: "POST",
    body: { ready },
    sessionToken,
    dataSchema: lobbySnapshotSchema,
  });
}

export function leaveLobby(lobbyId: string, sessionToken: string) {
  return apiFetch(`/lobbies/${lobbyId}/leave`, {
    method: "POST",
    sessionToken,
    dataSchema: z.null(),
  });
}

export function startGame(lobbyId: string, sessionToken: string) {
  return apiFetch(`/lobbies/${lobbyId}/start`, {
    method: "POST",
    sessionToken,
    dataSchema: gameStartedPayloadSchema,
  });
}

export function getGame(gameId: string) {
  return apiFetch(`/games/${gameId}`, { dataSchema: gameSessionSnapshotSchema });
}

export function whoAmI(gameId: string, sessionToken: string) {
  return apiFetch(`/games/${gameId}/me`, { sessionToken, dataSchema: mePayloadSchema });
}

export function submitRoll(gameId: string, sessionToken: string, pins: number) {
  return apiFetch(`/games/${gameId}/rolls`, {
    method: "POST",
    body: { pins },
    sessionToken,
    dataSchema: rollUpdateEventSchema,
  });
}
