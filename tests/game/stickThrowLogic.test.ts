import { describe, expect, it } from "vitest";
import {
  clampToSphere,
  dragTargetCenter,
  isStickSettled,
  projectOntoAxis,
  solveAerialVelocity,
} from "../../src/features/game/scene/stickThrowLogic";

describe("solveAerialVelocity", () => {
  it("zéro sans vitesse ni distance (geste annulé, lâcher vers l'arrière)", () => {
    expect(solveAerialVelocity(1, 4.2, 0, 0.15, 9.81, -2, 7.5)).toBe(0);
    expect(solveAerialVelocity(1, 0, 7, 0.15, 9.81, -2, 7.5)).toBe(0);
    expect(solveAerialVelocity(1, -1, 7, 0.15, 9.81, -2, 7.5)).toBe(0);
  });

  it("traverse exactement le point visé (petite piste, lancer franc)", () => {
    const releaseY = 1.0;
    const distance = 4.2;
    const hSpeed = 7;
    const vy = solveAerialVelocity(releaseY, distance, hSpeed, 0.15, 9.81, -2, 7.5);
    const flightTime = distance / hSpeed;
    const heightAtRack = releaseY + vy * flightTime - 0.5 * 9.81 * flightTime * flightTime;
    expect(heightAtRack).toBeCloseTo(0.15, 5);
  });

  it("un lancer franc part tendu, un lancer doux part en cloche", () => {
    const flat = solveAerialVelocity(1.0, 4.2, 12, 0.15, 9.81, -2, 7.5);
    const lobbed = solveAerialVelocity(1.0, 4.2, 5, 0.15, 9.81, -2, 7.5);
    expect(flat).toBeLessThan(lobbed);
    expect(flat).toBeLessThanOrEqual(0.5);
  });

  it("plafonne les gestes trop mous pour porter (retombée honnête avant les quilles)", () => {
    const vy = solveAerialVelocity(1.0, 9.4, 3, 0.15, 9.81, -2, 7.5);
    expect(vy).toBe(7.5);
    // The actual range with the ceiling: below the rack (9.4 m).
    const flightTime = (vy + Math.sqrt(vy * vy + 2 * 9.81 * (1.0 - 0.035))) / 9.81;
    expect(flightTime * 3).toBeLessThan(9.4);
  });
});

describe("solveAerialVelocity avec traînée", () => {
  // Integrates the projectile motion with drag to estimate the height at the rack.
  function heightAtRack(vy0: number, hSpeed: number, distance: number, c: number, releaseY = 1.0): number {
    let s = 0;
    let y = releaseY;
    let vh = hSpeed;
    let vy = vy0;
    const dt = 1 / 2000;
    for (let i = 0; i < 40000 && s < distance; i += 1) {
      const speed = Math.hypot(vh, vy);
      vh -= c * speed * vh * dt;
      vy -= (9.81 + c * speed * vy) * dt;
      s += vh * dt;
      y += vy * dt;
    }
    return y;
  }

  it("dragPerMass = 0 : identique à la parabole analytique", () => {
    expect(solveAerialVelocity(1.0, 4.2, 7, 0.15, 9.81, -2, 7.5, 0)).toBeCloseTo(
      solveAerialVelocity(1.0, 4.2, 7, 0.15, 9.81, -2, 7.5),
      9,
    );
  });

  it("compense la traînée : plus de portance qu'en vol libre, et passe bien à hauteur de frappe", () => {
    const c = 0.05;
    const free = solveAerialVelocity(1.0, 4.2, 7, 0.15, 9.81, -2, 7.5);
    const dragged = solveAerialVelocity(1.0, 4.2, 7, 0.15, 9.81, -2, 7.5, c);
    expect(dragged).toBeGreaterThan(free);
    // The height at the rack is computed using the independent integration to verify the solver's accuracy.
    expect(Math.abs(heightAtRack(dragged, 7, 4.2, c) - 0.15)).toBeLessThan(0.03);
  });

  it("reste borné par [minVy, maxVy], même avec une traînée énorme", () => {
    const vy = solveAerialVelocity(1.0, 9.4, 3, 0.15, 9.81, -2, 7.5, 5);
    expect(vy).toBeLessThanOrEqual(7.5);
    expect(vy).toBeGreaterThanOrEqual(-2);
  });
});

describe("clampToSphere", () => {
  it("laisse passer les points intérieurs intacts", () => {
    expect(clampToSphere([0, 0.6, 2.6], [0.1, 0.7, 2.5], 0.4)).toEqual([0.1, 0.7, 2.5]);
  });

  it("replaque sur la sphère en conservant la direction (x/y/z libres)", () => {
    const [x, y, z] = clampToSphere([0, 0.6, 2.6], [0, 1.6, 2.6], 0.4);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(1.0, 5);
    expect(z).toBeCloseTo(2.6, 5);
  });
});

describe("dragTargetCenter", () => {
  const rest: [number, number, number] = [0, 0.6, 2.6];

  it("le point saisi reste sous le pointeur : centre = pointeur − bras de levier", () => {
    // Saisi à 0,2 m du centre : le centre ne saute pas sous le curseur.
    const center = dragTargetCenter([0.1, 0.7, 2.5], [0.2, 0, 0], rest, 1);
    expect(center[0]).toBeCloseTo(-0.1, 5);
    expect(center[1]).toBeCloseTo(0.7, 5);
    expect(center[2]).toBeCloseTo(2.5, 5);
  });

  it("saisie au centre : le centre suit exactement le pointeur", () => {
    expect(dragTargetCenter([0.1, 0.7, 2.5], [0, 0, 0], rest, 1)).toEqual([0.1, 0.7, 2.5]);
  });

  it("borne le CENTRE (pas le pointeur) dans la sphère de saisie", () => {
    const center = dragTargetCenter([0, 2.6, 2.6], [0.2, 0, 0], rest, 0.4);
    const dist = Math.hypot(center[0] - rest[0], center[1] - rest[1], center[2] - rest[2]);
    expect(dist).toBeCloseTo(0.4, 5);
  });
});

describe("isStickSettled", () => {
  const T = 0.05;
  const AXIS: [number, number, number] = [1, 0, 0];
  const settled = (v: [number, number, number], w: [number, number, number]) =>
    isStickSettled(v, w, AXIS, { radius: 0.035, halfLength: 0.3 }, T);

  it("immobile : au repos", () => {
    expect(settled([0, 0, 0], [0, 0, 0])).toBe(true);
  });

  it("encore en vol ou en glissade : pas au repos (vitesse 3D, y compris verticale)", () => {
    expect(settled([0, 0, -1], [0, 0, 0])).toBe(false);
    expect(settled([0, 2, 0], [0, 0, 0])).toBe(false);
  });

  it("roule encore autour de son axe : la vitesse de peau |ω|·r compte (20 rad/s × 3,5 cm = 0,7 m/s)", () => {
    expect(settled([0, 0, 0], [-20, 0, 0])).toBe(false);
  });

  it("rampement résiduel d'un roulement quasi fini : au repos", () => {
    expect(settled([0, 0, -0.04], [-1, 0, 0])).toBe(true);
  });

  it("pivote encore (lacet/tangage) : la POINTE bouge à ω·L/2, pas à ω·r", () => {
    // 0,5 rad/s de lacet : la peau ne bouge qu'à 1,7 cm/s mais la pointe à 15 cm/s.
    expect(settled([0, 0, 0], [0, 0.5, 0])).toBe(false);
    expect(settled([0, 0, 0], [0, 0, 0.5])).toBe(false);
  });

  it("pivote presque plus : la pointe rampe sous le seuil, au repos", () => {
    expect(settled([0, 0, 0], [0, 0.1, 0])).toBe(true);
  });
});

describe("projectOntoAxis", () => {
  it("ramène un point de saisie sur la SURFACE du bâton à son axe (le doigt enserre le bâton)", () => {
    // Saisi à 0,2 m du centre, mais 3 cm au-dessus/à côté de l'axe (surface du capsule).
    const [x, y, z] = projectOntoAxis([0.2, 0.02, 0.03], [1, 0, 0]);
    expect(x).toBeCloseTo(0.2, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it("indépendant de la norme de l'axe, et de son sens", () => {
    expect(projectOntoAxis([0.2, 0.02, 0.03], [5, 0, 0])[0]).toBeCloseTo(0.2, 9);
    expect(projectOntoAxis([0.2, 0.02, 0.03], [-1, 0, 0])[0]).toBeCloseTo(0.2, 9);
  });

  it("axe nul : pas de projection possible, on renvoie l'origine", () => {
    expect(projectOntoAxis([0.2, 0.02, 0.03], [0, 0, 0])).toEqual([0, 0, 0]);
  });
});
