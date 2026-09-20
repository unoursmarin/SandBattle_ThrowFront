import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { awaitThrowId, THROW_ID_WAIT_MS } from "../../src/features/game/replay/pendingThrow";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("awaitThrowId", () => {
  it("sans lancer en cours d'enregistrement : pas de throwId, sans attendre", async () => {
    await expect(awaitThrowId(null)).resolves.toBeUndefined();
  });

  it("le POST a déjà répondu : le throwId est celui du serveur", async () => {
    await expect(awaitThrowId(Promise.resolve("t-1"))).resolves.toBe("t-1");
  });

  it("RÉGRESSION : le POST répond après la fin du rejeu, mais dans le délai : le roll attend et garde son throwId", async () => {
    let answer!: (id: string) => void;
    const pending = new Promise<string>((resolve) => (answer = resolve));
    const result = awaitThrowId(pending);
    await vi.advanceTimersByTimeAsync(THROW_ID_WAIT_MS - 100);
    answer("t-slow");
    await expect(result).resolves.toBe("t-slow");
  });

  it("le POST est trop lent : le roll part sans throwId au bout du délai", async () => {
    const result = awaitThrowId(new Promise<string>(() => undefined));
    await vi.advanceTimersByTimeAsync(THROW_ID_WAIT_MS);
    await expect(result).resolves.toBeUndefined();
  });

  it("le POST a échoué (null) : le roll part sans throwId, immédiatement", async () => {
    await expect(awaitThrowId(Promise.resolve(null))).resolves.toBeUndefined();
  });

  it("ne laisse aucun minuteur derrière lui quand le POST répond", async () => {
    await awaitThrowId(Promise.resolve("t-1"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
