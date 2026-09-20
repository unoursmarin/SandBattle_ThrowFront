import {
  looseStompEnvelopeSchema,
  rollUpdateEventSchema,
  throwSnapshotSchema,
  type RollUpdateEvent,
  type ThrowSnapshot,
} from "@/lib/api/schemas";

export type GameMessageHandlers = {
  //  A roll is registered: updates the score.
  applyRoll: (event: RollUpdateEvent) => void;
  //  A projectile was released: `snapshot` holds the launch, to replay.
  onThrowStarted: (snapshot: ThrowSnapshot) => void;
  //  While it returns true, rolls are held back instead of applied, so that a throw is SEEN (replayed)
  //  before its result is shown. `flushDeferred` releases them.  
  shouldDeferRolls: () => boolean;
};

// Creates a router for game messages, dispatching them to the appropriate handlers.
export function createGameMessageRouter(handlers: GameMessageHandlers) {
  let deferred: RollUpdateEvent[] = [];

  return {
    handle(raw: unknown): void {
      const envelope = looseStompEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        console.warn("Message STOMP invalide ignoré", envelope.error);
        return;
      }
      if (envelope.data.type === "rollRegistered") {
        const payload = rollUpdateEventSchema.safeParse(envelope.data.payload);
        if (!payload.success) {
          console.warn("Payload rollRegistered invalide ignoré", payload.error);
          return;
        }
        if (handlers.shouldDeferRolls()) deferred.push(payload.data);
        else handlers.applyRoll(payload.data);
      } else if (envelope.data.type === "throwStarted") {
        const payload = throwSnapshotSchema.safeParse(envelope.data.payload);
        if (!payload.success) {
          console.warn("Payload throwStarted invalide ignoré", payload.error);
          return;
        }
        handlers.onThrowStarted(payload.data);
      }
    },

    // Applies the deferred roll events, in the order they arrived.
    flushDeferred(): void {
      const events = deferred;
      deferred = [];
      events.forEach(handlers.applyRoll);
    },
  };
}
