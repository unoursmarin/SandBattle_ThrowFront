import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  applyTumble,
  clampSpeed,
  computeAngularSpeed,
  computeReleaseVelocity,
  computeTumbleAxis,
  integrateFlightStep,
  sampleTrajectoryPoints,
} from "../../src/lib/throw/stickThrowMath";

function sample(x: number, y: number, z: number, timeMs: number) {
  return { position: new Vector3(x, y, z), timeMs };
}

describe("computeReleaseVelocity", () => {
  it("v0 = (P_récent − P_ancien) / Δt", () => {
    const samples = [sample(0, 0, 0, 0), sample(1, 0, 0, 100)];
    const velocity = computeReleaseVelocity(samples);
    expect(velocity.x).toBeCloseTo(10, 5);
    expect(velocity.y).toBe(0);
    expect(velocity.z).toBe(0);
  });

  it("zéro sans historique exploitable", () => {
    expect(computeReleaseVelocity([]).length()).toBe(0);
    expect(computeReleaseVelocity([sample(1, 2, 3, 0)]).length()).toBe(0);
  });

  it("borne Δt contre le relâcher instantané (jamais de vitesse infinie)", () => {
    const samples = [sample(0, 0, 0, 0), sample(1, 0, 0, 0)];
    expect(computeReleaseVelocity(samples).x).toBeCloseTo(60, 5);
  });
});

describe("clampSpeed", () => {
  it("plafonne sans changer la direction", () => {
    const velocity = clampSpeed(new Vector3(0, 0, -20), 14);
    expect(velocity.length()).toBeCloseTo(14, 5);
    expect(velocity.z).toBeLessThan(0);
  });

  it("laisse passer les gestes normaux", () => {
    expect(clampSpeed(new Vector3(0, 2, -6), 14).length()).toBeCloseTo(Math.hypot(2, 6), 5);
  });
});

describe("computeTumbleAxis", () => {
  it("tungage AVANT pour un lancer vers −Z : axe (−1,0,0)", () => {
    // RÉGRESSION : l'axe inverse (+X) ferait basculer le haut du bâton vers
    // le joueur (tungage arrière). Vérifié à la main : rotation autour de
    // −X amène +Y vers −Z (loi de la main droite).
    const { axis, horizontalSpeed } = computeTumbleAxis(new Vector3(0, 1, -6));
    expect(axis.x).toBeCloseTo(-1, 5);
    expect(axis.y).toBeCloseTo(0, 5);
    expect(axis.z).toBeCloseTo(0, 5);
    expect(horizontalSpeed).toBeCloseTo(6, 5);
  });

  it("repli sur +X pour un lancer purement vertical", () => {
    const { axis, horizontalSpeed } = computeTumbleAxis(new Vector3(0, 5, 0));
    expect(axis.x).toBe(1);
    expect(horizontalSpeed).toBe(0);
  });
});

describe("computeAngularSpeed", () => {
  it("ω = |v| / bras de levier, plafonnée", () => {
    expect(computeAngularSpeed(9, 0.3, 40)).toBeCloseTo(30, 5);
    expect(computeAngularSpeed(20, 0.3, 14)).toBe(14);
  });

  it("zéro sans vitesse ou sans bras de levier", () => {
    expect(computeAngularSpeed(0, 0.3, 14)).toBe(0);
    expect(computeAngularSpeed(9, 0, 14)).toBe(0);
  });
});

describe("sampleTrajectoryPoints", () => {
  it("chute verticale : descend et se cale pile au sol", () => {
    const points = sampleTrajectoryPoints(new Vector3(0, 1, 0), new Vector3(), 9.81, 0);
    expect(points.length).toBeGreaterThan(2);
    const last = points[points.length - 1];
    expect(last[1]).toBe(0);
    for (const [, y] of points) expect(y).toBeGreaterThanOrEqual(0);
  });

  it("lob vers l'avant : apex au-dessus du départ, portée positive", () => {
    const points = sampleTrajectoryPoints(new Vector3(0, 1, 0), new Vector3(0, 2.45, -7), 9.81, 0.035);
    const apex = Math.max(...points.map(([, y]) => y));
    expect(apex).toBeGreaterThan(1.2);
    const last = points[points.length - 1];
    expect(last[1]).toBe(0.035);
    expect(last[2]).toBeLessThan(0);
  });

  it("jamais plus de `count` points", () => {
    const points = sampleTrajectoryPoints(new Vector3(0, 100, 0), new Vector3(), 9.81, 0, 10);
    expect(points).toHaveLength(10);
  });
});

describe("integrateFlightStep + applyTumble", () => {
  it("la gravité creuse la trajectoire à l'horizontale constante", () => {
    const position = new Vector3(0, 1, 0);
    const velocity = new Vector3(0, 0, -7);
    integrateFlightStep(position, velocity, 9.81, 1 / 60);
    expect(velocity.y).toBeCloseTo(-9.81 / 60, 5);
    expect(position.z).toBeCloseTo(-7 / 60, 5);
  });

  it("le tungage tourne le quaternion autour de l'axe (pas de dérive d'échelle)", () => {
    const quaternion = new Quaternion();
    applyTumble(quaternion, new Vector3(-1, 0, 0), Math.PI, 0.5);
    // 90° autour de −X : +Y → −Z.
    const up = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    expect(up.x).toBeCloseTo(0, 5);
    expect(up.y).toBeCloseTo(0, 5);
    expect(up.z).toBeCloseTo(-1, 5);
    expect(quaternion.length()).toBeCloseTo(1, 5);
  });
});
