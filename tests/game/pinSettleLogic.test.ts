import { describe, expect, it } from "vitest";
import {
  hasBeenStableLongEnough,
  isPositionOffLane,
  planRackReset,
  updateStableSince,
} from "../../src/features/game/scene/pinSettleLogic";

describe("updateStableSince / hasBeenStableLongEnough", () => {
  it("ne considère pas stable un instantané isolé", () => {
    // Régression : une quille qui oscille peut traverser un instant de
    // vélocité quasi nulle en plein milieu de son mouvement — un seul
    // échantillon "stable" ne doit jamais suffire à figer le compte (voir
    // docs/adr/0005-decompte-quilles-immobiles.md).
    const stableSince = updateStableSince(null, true, 1000);
    expect(hasBeenStableLongEnough(stableSince, 1000, 700)).toBe(false);
  });

  it("devient stable seulement après la durée soutenue exigée", () => {
    let stableSince: number | null = null;
    stableSince = updateStableSince(stableSince, true, 1000);
    expect(hasBeenStableLongEnough(stableSince, 1500, 700)).toBe(false);
    expect(hasBeenStableLongEnough(stableSince, 1701, 700)).toBe(true);
  });

  it("toute interruption remet le minuteur à zéro", () => {
    // Le scénario exact du bug rapporté : une quille bouge encore un peu
    // (rebond) après un premier instant de calme — le minuteur ne doit pas
    // avoir mémorisé ce premier instant.
    let stableSince: number | null = updateStableSince(null, true, 1000);
    stableSince = updateStableSince(stableSince, false, 1200); // la quille rebondit
    expect(stableSince).toBeNull();
    stableSince = updateStableSince(stableSince, true, 1300);
    expect(hasBeenStableLongEnough(stableSince, 1900, 700)).toBe(false);
    expect(hasBeenStableLongEnough(stableSince, 2001, 700)).toBe(true);
  });
});

describe("planRackReset", () => {
  const TOTAL_PINS = 15;

  it("ne fait rien si le compte physique correspond déjà à la cible", () => {
    expect(planRackReset(7, 7, TOTAL_PINS)).toEqual({ type: "noop" });
  });

  it("redresse tout uniquement pour un râtelier réellement plein", () => {
    expect(planRackReset(0, TOTAL_PINS, TOTAL_PINS)).toEqual({ type: "resetAll" });
  });

  it("RÉGRESSION : ne redresse jamais tout le râtelier pour une cible partielle, même si elle dépasse le compte actuel", () => {
    // C'est exactement le bug rapporté : un sous-comptage transitoire (une
    // quille qui finit de basculer un instant trop tard) fait lire
    // `currentlyStanding` plus bas que la cible serveur — sans cette règle,
    // l'ancienne heuristique (`target > currentlyStanding`) redressait TOUT
    // le râtelier, y compris des quilles légitimement tombées.
    expect(planRackReset(6, 8, TOTAL_PINS)).toEqual({ type: "resetPartial", standCount: 8 });
  });

  it("gère aussi le cas normal d'un lancer distant (cible sous le compte actuel)", () => {
    expect(planRackReset(TOTAL_PINS, 10, TOTAL_PINS)).toEqual({ type: "resetPartial", standCount: 10 });
  });
});

describe("isPositionOffLane", () => {
  const BOUNDS = { maxAbsX: 1.045, maxAbsZ: 4, minY: -1 };

  it("une position sur la piste n'est jamais hors piste", () => {
    expect(isPositionOffLane({ x: 0, y: 0.1, z: -1.6 }, BOUNDS)).toBe(false);
  });

  it("RÉGRESSION : une quille éjectée latéralement doit être détectée hors piste", () => {
    // C'est le bug rapporté : une quille percutée assez fort pour quitter la
    // piste tout en restant orientée "debout" ne doit plus être comptée
    // comme encore debout — voir docs/adr/0006-quille-hors-piste-comptee-debout.md.
    expect(isPositionOffLane({ x: 2, y: 0.5, z: -1.6 }, BOUNDS)).toBe(true);
  });

  it("détecte aussi une sortie en profondeur (z) ou une chute sous le monde (y)", () => {
    expect(isPositionOffLane({ x: 0, y: 0.1, z: -10 }, BOUNDS)).toBe(true);
    expect(isPositionOffLane({ x: 0, y: -5, z: -1.6 }, BOUNDS)).toBe(true);
  });
});
