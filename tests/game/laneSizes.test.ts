import { beforeEach, describe, expect, it } from "vitest";
import { BALL_RADIUS, PIN_HEIGHT, STICK_REST_HEIGHT } from "../../src/features/game/scene/sceneConstants";
import {
  getLaneLayout,
  isLaneSize,
  LANE_LAYOUTS,
  LANE_SIZES,
} from "../../src/features/game/scene/laneSizes";
import { buildPinPositions } from "../../src/features/game/scene/pinPositions";
import { loadLaneSize, saveLaneSize } from "../../src/lib/session/sessionStorage";
import { installMemorySessionStorage } from "./memorySessionStorage";

describe("isLaneSize", () => {
  it("accepte small, medium et large", () => {
    expect(isLaneSize("small")).toBe(true);
    expect(isLaneSize("medium")).toBe(true);
    expect(isLaneSize("large")).toBe(true);
  });

  it("rejette toute autre valeur", () => {
    expect(isLaneSize("huge")).toBe(false);
    expect(isLaneSize(null)).toBe(false);
    expect(isLaneSize(undefined)).toBe(false);
  });
});

describe("getLaneLayout", () => {
  it("retombe sur la petite piste face à une valeur inconnue", () => {
    expect(getLaneLayout("huge")).toBe(LANE_LAYOUTS.small);
    expect(getLaneLayout(null)).toBe(LANE_LAYOUTS.small);
  });
});

describe("invariants géométriques des trois tailles", () => {
  for (const size of LANE_SIZES) {
    describe(size, () => {
      const layout = LANE_LAYOUTS[size];

      it("le râtelier tient sur la piste (longueur)", () => {
        const lastRowZ = layout.pinTipRowZ - (layout.pinRowSizes.length - 1) * layout.pinRowSpacing;
        expect(lastRowZ).toBeGreaterThan(-layout.laneHalfLength);
      });

      it("le râtelier tient sur la piste (largeur, dernière rangée)", () => {
        const lastRowCount = layout.pinRowSizes[layout.pinRowSizes.length - 1];
        const halfRowWidth = ((lastRowCount - 1) * layout.pinLateralSpacing) / 2;
        expect(halfRowWidth).toBeLessThan(layout.laneHalfWidth);
      });

      it("buildPinPositions produit 15 quilles toutes sur la piste", () => {
        const positions = buildPinPositions(layout);
        expect(positions).toHaveLength(15);
        for (const [x, , z] of positions) {
          expect(Math.abs(x)).toBeLessThan(layout.laneHalfWidth);
          expect(z).toBeGreaterThan(-layout.laneHalfLength);
          expect(z).toBeLessThan(layout.laneHalfLength);
        }
      });

      it("les gouttières encadrent la piste et le listel reste en retrait", () => {
        expect(layout.gutterOuterHalfWidth).toBeGreaterThan(layout.laneHalfWidth);
        expect(layout.trimInnerHalfWidth).toBeLessThan(layout.laneHalfWidth);
        expect(layout.trimInnerHalfWidth).toBeGreaterThan(0);
      });

      it("les positions de repos sont sur la piste, côté lancer", () => {
        for (const rest of [layout.ballRest, layout.stickRest]) {
          expect(rest[0]).toBe(0);
          expect(rest[2]).toBeGreaterThan(0);
          expect(rest[2]).toBeLessThan(layout.laneHalfLength);
        }
        expect(layout.ballRest[1]).toBe(BALL_RADIUS);
      });

      it("le bâton part de haut (hauteur de main, au-dessus des quilles)", () => {
        expect(layout.stickRest[1]).toBe(STICK_REST_HEIGHT);
        expect(layout.stickRest[1]).toBeGreaterThan(PIN_HEIGHT);
      });

      it("la grotte est derrière le bout de piste", () => {
        expect(layout.cavePosition[2]).toBeLessThan(-layout.laneHalfLength);
      });
    });
  }
});

describe("laneSize (sessionStorage)", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installMemorySessionStorage();
  });

  it("retourne small par défaut sans choix préalable", () => {
    expect(loadLaneSize()).toBe("small");
  });

  it("persiste chaque taille (roundtrip)", () => {
    for (const size of LANE_SIZES) {
      saveLaneSize(size);
      expect(loadLaneSize()).toBe(size);
    }
  });

  it("retombe sur small face à une valeur corrompue", () => {
    store.set("telemis.laneSize", JSON.stringify("huge"));
    expect(loadLaneSize()).toBe("small");
  });
});
