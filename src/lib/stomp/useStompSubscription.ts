import { useCallback, useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { z } from "zod";

import { looseStompEnvelopeSchema, type StompEvent } from "../api/schemas";
import { stompMessages$, stompReconnected$ } from "./client";

/**
 * S'abonne à une destination STOMP et transmet le corps brut (JSON déjà
 * parsé) de chaque message. Réservée aux destinations qui portent des
 * événements de formes différentes (ex. /topic/lobbies/{id}) : le
 * discriminant `type` doit être vérifié par l'appelant avant de valider le
 * payload avec le bon schéma. Pour une destination homogène, préférer
 * {@link useStompSubscription}.
 */
export function useRawStompSubscription(destination: string, onMessage: (body: unknown) => void): void {
  useEffect(() => {
    const subscription = stompMessages$(destination).subscribe((message) => {
      try {
        onMessage(JSON.parse(message.body));
      } catch (error) {
        console.warn(`Message STOMP illisible ignoré sur ${destination}`, error);
      }
    });
    return () => subscription.unsubscribe();
  }, [destination, onMessage]);
}

/**
 * S'abonne à une destination STOMP homogène (un seul type d'événement) et
 * valide chaque message via Zod avant de le transmettre (voir
 * docs/architecture/state-management.md) : un message qui ne valide pas est
 * journalisé et ignoré plutôt que de planter l'UI. `onEvent` doit être
 * stable (useCallback) pour éviter de resouscrire à chaque rendu.
 *
 * Validation en deux temps (enveloppe à forme fixe, puis payload) — voir la
 * note en tête de src/lib/api/schemas.ts.
 */
export function useStompSubscription<T extends z.ZodTypeAny>(
  destination: string,
  payloadSchema: T,
  onEvent: (event: StompEvent<z.infer<T>>) => void,
): void {
  useRawStompSubscription(
    destination,
    useCallback(
      (raw: unknown) => {
        const envelope = looseStompEnvelopeSchema.safeParse(raw);
        if (!envelope.success) {
          console.warn(`Message STOMP invalide ignoré sur ${destination}`, envelope.error);
          return;
        }
        const payload = payloadSchema.safeParse(envelope.data.payload);
        if (!payload.success) {
          console.warn(`Payload STOMP invalide ignoré sur ${destination}`, payload.error);
          return;
        }
        onEvent({ ...envelope.data, payload: payload.data as z.infer<T> });
      },
      [destination, payloadSchema, onEvent],
    ),
  );
}

/**
 * Resynchronise `queryKey` via un re-fetch REST à chaque reconnexion STOMP
 * (voir docs/architecture/state-management.md — "Resynchronisation après
 * reconnexion") : les messages manqués pendant la coupure ne sont jamais
 * rejoués, seul un `GET` frais garantit la cohérence du cache.
 */
export function useStompReconnectResync(queryKey: QueryKey): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscription = stompReconnected$().subscribe(() => {
      void queryClient.invalidateQueries({ queryKey });
    });
    return () => subscription.unsubscribe();
  }, [queryClient, queryKey]);
}
