import { describe, expect, it } from "vitest";
import {
  classifySandImpact,
  lowestPointY,
  type SandImpactConfig,
} from "../../src/features/game/scene/stickSandImpact";

// Small round numbers: surface at y = 0, capsule of half-height 0.25 and radius 0.05.
const CFG: SandImpactConfig = {
  surfaceY: 0,
  halfHeight: 0.25,
  radius: 0.05,
  skin: 0.005,
  plantMinTilt: 0.5,
  plantMinSpeed: 1,
  depthPerSpeed: 0.04,
  maxEmbeddedLength: 0.25,
};
const DT = 1 / 60;
const FLAT: [number, number, number] = [1, 0, 0];
const VERTICAL: [number, number, number] = [0, 1, 0];
const s = Math.SQRT1_2;
const TILTED_45: [number, number, number] = [s, s, 0];

describe("lowestPointY", () => {
  it("à plat : le centre moins le rayon", () => {
    expect(lowestPointY(1, 0, CFG)).toBeCloseTo(0.95, 9);
  });

  it("debout : le centre moins la demi-hauteur et le rayon (bout en bas)", () => {
    expect(lowestPointY(1, 1, CFG)).toBeCloseTo(0.7, 9);
    expect(lowestPointY(1, -1, CFG)).toBeCloseTo(0.7, 9); // sens de l'axe indifférent
  });

  it("incliné : interpolation par |axe.y|", () => {
    expect(lowestPointY(1, s, CFG)).toBeCloseTo(1 - s * 0.25 - 0.05, 9);
  });
});

describe("classifySandImpact — pas de contact", () => {
  it("en l'air, loin du sable : none", () => {
    expect(classifySandImpact({ center: [0, 2, 0], axis: FLAT, velocity: [0, -3, 0], dt: DT }, CFG).kind).toBe("none");
  });

  it("qui monte, même proche du sable : none", () => {
    expect(classifySandImpact({ center: [0, 0.2, 0], axis: FLAT, velocity: [0, 2, 0], dt: DT }, CFG).kind).toBe("none");
  });

  it("le contact est anticipé sur UN pas, pas plus tôt", () => {
    // Point bas à 0,10 m, chute de 3 m/s → 0,05 m par pas : pas encore.
    expect(classifySandImpact({ center: [0, 0.15, 0], axis: FLAT, velocity: [0, -3, 0], dt: DT }, CFG).kind).toBe("none");
    // Point bas à 0,04 m : le prochain pas (−0,05) le fait toucher.
    expect(classifySandImpact({ center: [0, 0.09, 0], axis: FLAT, velocity: [0, -3, 0], dt: DT }, CFG).kind).not.toBe("none");
  });
});

describe("classifySandImpact — arrêt net (à plat)", () => {
  it("un bâton horizontal qui touche s'arrête, même très vite", () => {
    expect(classifySandImpact({ center: [0, 0.05, 0], axis: FLAT, velocity: [4, -6, 0], dt: DT }, CFG).kind).toBe("stop");
  });

  it("peu incliné (< seuil) : arrêt, pas de plantage", () => {
    const shallow: [number, number, number] = [Math.cos(0.3), Math.sin(0.3), 0]; // ~17°
    expect(classifySandImpact({ center: [0, 0.06, 0], axis: shallow, velocity: [0, -6, 0], dt: DT }, CFG).kind).toBe("stop");
  });

  it("incliné mais trop lent : arrêt, pas de plantage", () => {
    expect(classifySandImpact({ center: [0, 0.2, 0], axis: TILTED_45, velocity: [0, -0.5, 0], dt: DT }, CFG).kind).toBe("stop");
  });
});

describe("classifySandImpact — plantage (bout incliné et rapide)", () => {
  it("un bâton incliné à 45° et rapide se plante", () => {
    const r = classifySandImpact({ center: [0, 0.2, 0], axis: TILTED_45, velocity: [0, -4, 0], dt: DT }, CFG);
    expect(r.kind).toBe("plant");
  });

  it("le bout le plus bas finit sous la surface, à la profondeur attendue", () => {
    const r = classifySandImpact({ center: [0, 0.2, 0], axis: TILTED_45, velocity: [0, -4, 0], dt: DT }, CFG);
    if (r.kind !== "plant") throw new Error("attendu : plant");
    // 4 m/s × 0,04 = 0,16 m, sous le plafond 0,25·|axe.y| = 0,177 m.
    expect(lowestPointY(r.centerY, s, CFG)).toBeCloseTo(-0.16, 9);
  });

  it("la profondeur croît avec la vitesse d'impact", () => {
    const depth = (vy: number) => {
      const r = classifySandImpact({ center: [0, 0.2, 0], axis: TILTED_45, velocity: [0, vy, 0], dt: DT }, CFG);
      if (r.kind !== "plant") throw new Error("attendu : plant");
      return -lowestPointY(r.centerY, s, CFG);
    };
    expect(depth(-2)).toBeLessThan(depth(-3.5));
  });

  it("la longueur enterrée est plafonnée (jamais plus de maxEmbeddedLength de bâton)", () => {
    const r = classifySandImpact({ center: [0, 0.3, 0], axis: VERTICAL, velocity: [0, -30, 0], dt: DT }, CFG);
    if (r.kind !== "plant") throw new Error("attendu : plant");
    expect(-lowestPointY(r.centerY, 1, CFG)).toBeCloseTo(0.25, 9); // debout : profondeur = longueur
    const tilted = classifySandImpact({ center: [0, 0.3, 0], axis: TILTED_45, velocity: [0, -30, 0], dt: DT }, CFG);
    if (tilted.kind !== "plant") throw new Error("attendu : plant");
    expect(-lowestPointY(tilted.centerY, s, CFG) / s).toBeCloseTo(0.25, 9); // longueur le long de l'axe
  });

  it("une vitesse horizontale seule ne plante pas : c'est la vitesse VERTICALE d'impact qui compte", () => {
    expect(classifySandImpact({ center: [0, 0.2, 0], axis: TILTED_45, velocity: [8, -0.4, 0], dt: DT }, CFG).kind).toBe("stop");
  });
});

// A tumbling stick hits the sand with its END, which does not move like its centre: the vertical speed of the
// lowest point is v.y + (ω × r).y, r being the vector from the centre to that point.
describe("classifySandImpact — la rotation compte", () => {
  const TILTED_60: [number, number, number] = [0.5, Math.sqrt(3) / 2, 0];
  // Lowest end at ~3.5 mm above the surface: touching within the next step.
  const AT_THE_SAND: [number, number, number] = [0, 0.27, 0];
  // ω about Z of 16 rad/s moves the lowest end of this 60° stick DOWN by 16 · 0.125 = 2 m/s (−16: UP by 2 m/s).
  const SPIN_DOWN: [number, number, number] = [0, 0, 16];
  const SPIN_UP: [number, number, number] = [0, 0, -16];

  it("sans rotation, le résultat est celui de la vitesse du centre (inchangé)", () => {
    const base = { center: AT_THE_SAND, axis: TILTED_60, velocity: [0, -0.5, 0] as [number, number, number], dt: DT };
    expect(classifySandImpact(base, CFG).kind).toBe("stop");
    expect(classifySandImpact({ ...base, angularVelocity: [0, 0, 0] }, CFG).kind).toBe("stop");
  });

  it("le bout qui pique vers le sable en tournant se plante, même si le centre tombe lentement", () => {
    // Centre à 0,5 m/s (trop lent pour planter), mais le bout descend à 2,5 m/s.
    const impact = classifySandImpact({ center: AT_THE_SAND, axis: TILTED_60, velocity: [0, -0.5, 0], angularVelocity: SPIN_DOWN, dt: DT }, CFG);
    expect(impact.kind).toBe("plant");
  });

  it("le bout qui remonte en tournant ne se plante pas, même si le centre tombe vite", () => {
    // Centre à 1,5 m/s (assez pour planter), mais le bout remonte : pas d'impact vertical.
    const impact = classifySandImpact({ center: AT_THE_SAND, axis: TILTED_60, velocity: [0, -1.5, 0], angularVelocity: SPIN_UP, dt: DT }, CFG);
    expect(impact.kind).toBe("stop");
  });

  it("le contact est anticipé avec la vitesse du bout, pas celle du centre", () => {
    const high: [number, number, number] = [0, 0.3, 0]; // lowest end ~3.4 cm above the surface
    expect(classifySandImpact({ center: high, axis: TILTED_60, velocity: [0, 0, 0], dt: DT }, CFG).kind).toBe("none");
    expect(classifySandImpact({ center: high, axis: TILTED_60, velocity: [0, 0, 0], angularVelocity: SPIN_DOWN, dt: DT }, CFG).kind).not.toBe("none");
  });

  it("une rotation autour de la verticale ne change rien (elle ne déplace pas le bout verticalement)", () => {
    const base = { center: AT_THE_SAND, axis: TILTED_60, velocity: [0, -0.5, 0] as [number, number, number], dt: DT };
    expect(classifySandImpact({ ...base, angularVelocity: [0, 20, 0] }, CFG)).toEqual(classifySandImpact(base, CFG));
  });

  it("à plat, une rotation bout sur bout fait piquer le bout le plus bas : c'est lui qui compte", () => {
    // Axe horizontal : les deux bouts sont à la même hauteur ; l'un descend, l'autre monte. Le plus rapide vers le bas décide.
    // Point bas à 2 cm ; les bouts vont à ±5 m/s (20 rad/s · 0,25 m) : celui qui descend touche au prochain pas.
    const base = { center: [0, 0.07, 0] as [number, number, number], axis: FLAT, velocity: [0, 0, 0] as [number, number, number], dt: DT };
    expect(classifySandImpact(base, CFG).kind).toBe("none"); // sans rotation, rien ne bouge
    expect(classifySandImpact({ ...base, angularVelocity: [0, 0, 20] }, CFG).kind).not.toBe("none");
    expect(classifySandImpact({ ...base, angularVelocity: [0, 0, -20] }, CFG).kind).not.toBe("none"); // l'autre bout, même chose
  });
});
