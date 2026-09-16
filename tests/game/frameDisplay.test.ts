import { describe, expect, it } from "vitest";
import { frameRollSymbols, lastConfirmedRollPinsFelled } from "../../src/features/game/frameDisplay";
import type { FrameSnapshot } from "@/lib/api/schemas";

function frame(overrides: Partial<FrameSnapshot>): FrameSnapshot {
  return { number: 1, rolls: [], status: "IN_PROGRESS", score: 0, ...overrides };
}

describe("frameRollSymbols", () => {
  it("affiche X pour un strike (15 quilles au 1er lancer)", () => {
    expect(frameRollSymbols([15])).toEqual(["X"]);
  });

  it("affiche / pour un spare classique (2e lancer vide le reste)", () => {
    expect(frameRollSymbols([12, 3])).toEqual(["12", "/"]);
  });

  it("RÉGRESSION : un 1er lancer à 0 puis un 2e qui vide tout est un spare, jamais un strike", () => {
    // Le PDF de l'énoncé est explicite : un strike n'existe QUE si les 15
    // quilles tombent au premier lancer précisément — voir
    // docs/architecture/Exercice Java-Web (1).pdf et docs/adr/0002. Avant
    // ce correctif, `standing` valait encore 15 après un 1er lancer à 0
    // (rien n'a été décrémenté), donc un 2e lancer à 15 était affiché à
    // tort comme "X".
    expect(frameRollSymbols([0, 15])).toEqual(["0", "/"]);
  });

  it("un spare sur le 3e lancer reste correctement affiché", () => {
    expect(frameRollSymbols([12, 0, 3])).toEqual(["12", "0", "/"]);
  });
});

describe("lastConfirmedRollPinsFelled", () => {
  it("renvoie null tant qu'aucun lancer n'a été effectué", () => {
    expect(lastConfirmedRollPinsFelled([frame({ number: 1, rolls: [] })])).toBeNull();
  });

  it("renvoie le dernier lancer de la dernière frame ayant des lancers", () => {
    // Régression : ce résultat doit venir de l'état serveur confirmé
    // (`FrameSnapshot.rolls`), jamais d'une valeur optimiste calculée côté
    // client au moment du lancer — voir docs/adr/0005-decompte-quilles-immobiles.md.
    const frames = [
      frame({ number: 1, rolls: [7, 3] }),
      frame({ number: 2, rolls: [8] }),
      frame({ number: 3, rolls: [] }),
    ];
    expect(lastConfirmedRollPinsFelled(frames)).toBe(8);
  });

  it("ignore l'ordre d'arrivée des frames dans le tableau (trie par numéro)", () => {
    const frames = [frame({ number: 3, rolls: [4] }), frame({ number: 1, rolls: [9, 1] })];
    expect(lastConfirmedRollPinsFelled(frames)).toBe(4);
  });
});
