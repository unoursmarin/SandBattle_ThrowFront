import { describe, expect, it } from "vitest";
import { decelerateSpeed, shouldEndRoll } from "../../src/features/game/scene/ballRollLogic";

describe("decelerateSpeed", () => {
  it("ne change rien tant que la boule n'a pas atteint la zone d'arrêt", () => {
    // RÉGRESSION : l'ancienne décroissance exponentielle ralentissait la
    // boule dès le lancer, plafonnant sa distance totale parcourable à
    // `vitesse_initiale / taux` — un lancer un peu lent pouvait ne jamais
    // atteindre le râtelier. Avant la zone d'arrêt, la vitesse doit rester
    // strictement inchangée (voir docs/adr/0007).
    expect(decelerateSpeed(0.8, false, 8, 1)).toBe(0.8);
  });

  it("décélère à taux constant une fois dans la zone d'arrêt", () => {
    expect(decelerateSpeed(4, true, 8, 0.1)).toBeCloseTo(3.2, 5);
  });

  it("ne descend jamais sous zéro", () => {
    expect(decelerateSpeed(0.3, true, 8, 1)).toBe(0);
  });

  it("une vitesse déjà nulle reste nulle", () => {
    expect(decelerateSpeed(0, true, 8, 1)).toBe(0);
  });
});

describe("shouldEndRoll", () => {
  const BASE = { maxRollDurationMs: 14000, absoluteMaxRollDurationMs: 22000 };

  it("ne termine jamais le lancer tant que les quilles bougent encore", () => {
    // C'est exactement le bug rapporté : une boule lente qui vient de
    // s'arrêter ne doit pas clore le tour si des quilles sont encore en
    // train de tomber (voir docs/adr/0007).
    expect(
      shouldEndRoll({ pinsSettled: false, ballSettledLongEnough: true, elapsedMs: 5000, ...BASE }),
    ).toBe(false);
  });

  it("termine normalement quand la boule ET les quilles sont stables", () => {
    expect(
      shouldEndRoll({ pinsSettled: true, ballSettledLongEnough: true, elapsedMs: 3000, ...BASE }),
    ).toBe(true);
  });

  it("le filet de sécurité (maxRollDurationMs) ne contourne que la lenteur de la boule, jamais les quilles", () => {
    expect(
      shouldEndRoll({ pinsSettled: false, ballSettledLongEnough: false, elapsedMs: 15000, ...BASE }),
    ).toBe(false);
    expect(
      shouldEndRoll({ pinsSettled: true, ballSettledLongEnough: false, elapsedMs: 15000, ...BASE }),
    ).toBe(true);
  });

  it("le dernier recours absolu contourne même les quilles", () => {
    expect(
      shouldEndRoll({ pinsSettled: false, ballSettledLongEnough: false, elapsedMs: 23000, ...BASE }),
    ).toBe(true);
  });

  it("ne termine pas avant que la boule ait été lente assez longtemps ni que le filet de sécurité soit atteint", () => {
    expect(
      shouldEndRoll({ pinsSettled: true, ballSettledLongEnough: false, elapsedMs: 3000, ...BASE }),
    ).toBe(false);
  });
});
