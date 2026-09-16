import type { z } from "zod";

import { looseApiResponseSchema } from "./schemas";

/**
 * Erreur applicative portant le code stable renvoyé par le backend
 * (voir docs/architecture/api-integration.md) : l'UI décide sur `code`,
 * jamais sur `message` (texte humain, sujet à changer).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface ApiFetchOptions<T extends z.ZodTypeAny> {
  method?: "GET" | "POST";
  body?: unknown;
  sessionToken?: string;
  dataSchema: T;
}

export async function apiFetch<T extends z.ZodTypeAny>(
  path: string,
  options: ApiFetchOptions<T>,
): Promise<z.infer<T>> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.sessionToken ? { "X-Session-Token": options.sessionToken } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const rawBody = await response.text();

  if (!response.ok || rawBody.length === 0) {
    throw new ApiError(
      "SERVER_UNREACHABLE",
      "Impossible de contacter le serveur. Réessayez dans un instant.",
      response.status,
    );
  }

  const json: unknown = JSON.parse(rawBody);
  const envelope = looseApiResponseSchema.parse(json);

  if (!envelope.success) {
    const error = envelope.error ?? { code: "UNKNOWN_ERROR", message: "Erreur inconnue" };
    throw new ApiError(error.code, error.message, response.status);
  }

  // `data` n'est `null` en cas de succès que pour les endpoints "Void"
  // (ex. leave) : le schéma appelant doit alors être `z.null()`.
  return options.dataSchema.parse(envelope.data) as z.infer<T>;
}
