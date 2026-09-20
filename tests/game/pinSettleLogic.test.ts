import { describe, expect, it } from "vitest";
import {
  FALLEN_UP_DOT_THRESHOLD,
  isPinOutOfPlay,
  isPositionOffLane,
  planRackReset,
} from "../../src/features/game/scene/pinSettleLogic";

describe("planRackReset", () => {
  const TOTAL_PINS = 15;

  it("ne fait rien si le compte physique correspond déjà à la cible", () => {
    expect(planRackReset(7, 7, TOTAL_PINS)).toEqual({ type: "noop" });
  });

  it("redresse tout uniquement pour un râtelier réellement plein", () => {
    expect(planRackReset(0, TOTAL_PINS, TOTAL_PINS)).toEqual({ type: "resetAll" });
  });

  it("RÉGRESSION : ne redresse jamais tout le râtelier pour une cible partielle, même si elle dépasse le compte actuel", () => {

    // This ensures that only the necessary pins are reset, avoiding unnecessary full rack resets.
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
   // The pin is laterally ejected beyond the lane boundaries.
    expect(isPositionOffLane({ x: 2, y: 0.5, z: -1.6 }, BOUNDS)).toBe(true);
  });

  it("détecte aussi une sortie en profondeur (z) ou une chute sous le monde (y)", () => {
    expect(isPositionOffLane({ x: 0, y: 0.1, z: -10 }, BOUNDS)).toBe(true);
    expect(isPositionOffLane({ x: 0, y: -5, z: -1.6 }, BOUNDS)).toBe(true);
  });
});

describe("isPinOutOfPlay", () => {
  const BOUNDS = { maxAbsX: 1.045, maxAbsZ: 4, minY: -1 };
  const standing = { inGame: true, upDot: 1, position: { x: 0, y: 0.1, z: -1.6 } };

  it("une quille en jeu, droite, sur la piste, est debout", () => {
    expect(isPinOutOfPlay(standing, BOUNDS)).toBe(false);
  });

  it("RÉGRESSION : une quille retirée du jeu n'est pas comptée debout, même restée droite sur sa case", () => {
    // The pin has been removed from play without being moved (it retains its pre-throw upright pose): judging it solely on its geometry would count it as standing, and the rack would no longer match the server's pin count.
    expect(isPinOutOfPlay({ ...standing, inGame: false }, BOUNDS)).toBe(true);
  });

  it("une quille inclinée au-delà du seuil est tombée, en deçà elle est debout", () => {
    expect(isPinOutOfPlay({ ...standing, upDot: FALLEN_UP_DOT_THRESHOLD - 0.01 }, BOUNDS)).toBe(true);
    expect(isPinOutOfPlay({ ...standing, upDot: FALLEN_UP_DOT_THRESHOLD + 0.01 }, BOUNDS)).toBe(false);
  });

  it("une quille hors de la zone de jeu est sortie du jeu même droite", () => {
    expect(isPinOutOfPlay({ ...standing, position: { x: 2, y: 0.1, z: -1.6 } }, BOUNDS)).toBe(true);
  });
});

describe("râtelier remis au tour suivant", () => {
  const BOUNDS = { maxAbsX: 1.045, maxAbsZ: 4, minY: -1 };
  const upright = { upDot: 1, position: { x: 0, y: 0.1, z: -1.6 } };
  const countStanding = (pins: { inGame: boolean }[]) => pins.filter((p) => !isPinOutOfPlay({ ...upright, ...p }, BOUNDS)).length;

  it("RÉGRESSION : après un strike (15 quilles retirées, restées droites), le nouveau frame remet les 15 quilles", () => {
    const afterStrike = Array.from({ length: 15 }, () => ({ inGame: false }));
    // Counted from the pins' geometry alone this was 15: "nothing to do", and the rack stayed empty.
    expect(countStanding(afterStrike)).toBe(0);
    expect(planRackReset(countStanding(afterStrike), 15, 15)).toEqual({ type: "resetAll" });
  });

  it("après un lancer partiel, le compte est celui des survivantes et le râtelier n'est pas retouché", () => {
    const pins = Array.from({ length: 15 }, (_, i) => ({ inGame: i < 6 }));
    expect(countStanding(pins)).toBe(6);
    expect(planRackReset(countStanding(pins), 6, 15)).toEqual({ type: "noop" });
  });
});
