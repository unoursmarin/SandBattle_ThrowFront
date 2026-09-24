import { beforeEach, describe, expect, it } from "vitest";
import { isProjectileType } from "../../src/features/game/scene/projectileTypes";
import { loadProjectileChoice, saveProjectileChoice } from "../../src/lib/session/sessionStorage";
import { installMemorySessionStorage } from "./memorySessionStorage";

describe("isProjectileType", () => {
  it("accepte ball et stick", () => {
    expect(isProjectileType("ball")).toBe(true);
    expect(isProjectileType("stick")).toBe(true);
  });

  it("rejette toute autre valeur", () => {
    expect(isProjectileType("disc")).toBe(false);
    expect(isProjectileType(null)).toBe(false);
    expect(isProjectileType(undefined)).toBe(false);
    expect(isProjectileType(42)).toBe(false);
  });
});

describe("projectileChoice (sessionStorage)", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installMemorySessionStorage();
  });

  it("retourne stick par défaut sans choix préalable", () => {
    expect(loadProjectileChoice()).toBe("stick");
  });

  it("persiste le bâton puis la boule (roundtrip)", () => {
    saveProjectileChoice("stick");
    expect(loadProjectileChoice()).toBe("stick");
    saveProjectileChoice("ball");
    expect(loadProjectileChoice()).toBe("ball");
  });

  it("retombe sur stick face à une valeur corrompue", () => {
    store.set("sandbatlle.projectileChoice", JSON.stringify("disc"));
    expect(loadProjectileChoice()).toBe("stick");
  });
});
