import { describe, expect, it } from "vitest";
import {
  clampMagnitude,
  clampTransverseSpin,
  computeRotationalDamping,
  centerOfPressure,
  groundedAngularDamping,
  computeAnisotropicDrag,
  dragImpulse,
  meanDragPerMass,
  projectedArea,
  releaseSnapOffsetY,
  rotateByQuaternion,
  type DragParams,
} from "../../src/features/game/scene/stickAerodynamics";

const PARAMS: DragParams = { airDensity: 1.2, dragCoefficient: 1, tipArea: 0.004, sideArea: 0.04 };
const AXIS: [number, number, number] = [1, 0, 0];

describe("projectedArea", () => {
  it("de pointe (v ∥ axe) : section minimale, dans les deux sens", () => {
    expect(projectedArea(1, PARAMS)).toBeCloseTo(PARAMS.tipArea, 9);
    expect(projectedArea(-1, PARAMS)).toBeCloseTo(PARAMS.tipArea, 9);
  });

  it("de profil (v ⟂ axe) : section maximale", () => {
    expect(projectedArea(0, PARAMS)).toBeCloseTo(PARAMS.sideArea, 9);
  });

  it("croît de façon monotone entre les deux", () => {
    const a30 = projectedArea(Math.cos(Math.PI / 6), PARAMS);
    const a60 = projectedArea(Math.cos(Math.PI / 3), PARAMS);
    expect(a30).toBeGreaterThan(PARAMS.tipArea);
    expect(a60).toBeGreaterThan(a30);
    expect(a60).toBeLessThan(PARAMS.sideArea);
  });
});

describe("computeAnisotropicDrag", () => {
  it("nulle sans vitesse ou sans axe exploitable", () => {
    expect(computeAnisotropicDrag([0, 0, 0], AXIS, PARAMS)).toEqual([0, 0, 0]);
    expect(computeAnisotropicDrag([0, 0, -5], [0, 0, 0], PARAMS)).toEqual([0, 0, 0]);
  });

  it("s'oppose à la vitesse : F = −½ρ·Cd·A·v²·v̂", () => {
    const [fx, fy, fz] = computeAnisotropicDrag([0, 0, -10], AXIS, PARAMS); // de profil
    expect(fx).toBeCloseTo(0, 9);
    expect(fy).toBeCloseTo(0, 9);
    expect(fz).toBeCloseTo(0.5 * 1.2 * 1 * 0.04 * 100, 6);
  });

  it("freine bien plus de profil que de pointe (rapport = rapport des aires)", () => {
    const side = computeAnisotropicDrag([0, 0, -10], AXIS, PARAMS);
    const tip = computeAnisotropicDrag([10, 0, 0], AXIS, PARAMS);
    expect(Math.hypot(...side) / Math.hypot(...tip)).toBeCloseTo(PARAMS.sideArea / PARAMS.tipArea, 6);
  });

  it("croît avec le carré de la vitesse", () => {
    const slow = Math.hypot(...computeAnisotropicDrag([0, 0, -5], AXIS, PARAMS));
    const fast = Math.hypot(...computeAnisotropicDrag([0, 0, -10], AXIS, PARAMS));
    expect(fast / slow).toBeCloseTo(4, 6);
  });

  it("ne dépend pas de la norme de l'axe fourni", () => {
    const a = computeAnisotropicDrag([3, 1, -4], [1, 0, 0], PARAMS);
    const b = computeAnisotropicDrag([3, 1, -4], [7, 0, 0], PARAMS);
    expect(b[0]).toBeCloseTo(a[0], 9);
    expect(b[2]).toBeCloseTo(a[2], 9);
  });
});

describe("dragImpulse", () => {
  it("vaut F·Δt tant que l'effet reste petit", () => {
    const f = computeAnisotropicDrag([0, 0, -10], AXIS, PARAMS);
    const j = dragImpulse([0, 0, -10], AXIS, PARAMS, 0.3, 1 / 60);
    expect(j[2]).toBeCloseTo(f[2] / 60, 9);
  });

  it("ne peut jamais inverser la vitesse (garde-fou d'intégration explicite)", () => {
    const heavyDrag: DragParams = { ...PARAMS, airDensity: 5000 };
    const mass = 0.3;
    const j = dragImpulse([0, 0, -10], AXIS, heavyDrag, mass, 1 / 60);
    expect(Math.abs(j[2])).toBeLessThanOrEqual(0.9 * mass * 10 + 1e-9);
    expect(j[2]).toBeGreaterThan(0); // s'oppose toujours (v_z < 0 → impulsion > 0)
  });
});

describe("meanDragPerMass", () => {
  it("½·ρ·Cd·Ā/m avec Ā = moyenne des aires", () => {
    expect(meanDragPerMass(PARAMS, 0.3)).toBeCloseTo((0.5 * 1.2 * 1 * 0.022) / 0.3, 9);
  });
});

describe("rotateByQuaternion", () => {
  it("identité", () => {
    expect(rotateByQuaternion({ x: 0, y: 0, z: 0, w: 1 }, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("quart de tour autour de Y : +X → −Z", () => {
    const s = Math.SQRT1_2;
    const [x, y, z] = rotateByQuaternion({ x: 0, y: s, z: 0, w: s }, [1, 0, 0]);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-1, 9);
  });
});

describe("clampMagnitude", () => {
  it("laisse intact sous le plafond, replaque au-dessus en gardant la direction", () => {
    expect(clampMagnitude([1, 0, 0], 5)).toEqual([1, 0, 0]);
    const [x, y, z] = clampMagnitude([0, 30, 40], 10);
    expect(Math.hypot(x, y, z)).toBeCloseTo(10, 9);
    expect(y / z).toBeCloseTo(0.75, 9);
  });
});

describe("releaseSnapOffsetY", () => {
  it("produit exactement la vrille axiale visée à la vitesse de référence (τ = r·J, ω = τ/I)", () => {
    const inertia = 1.6e-4;
    const mass = 0.3;
    const speed = 12;
    const offset = releaseSnapOffsetY(4, inertia, mass, speed);
    expect((offset * mass * speed) / inertia).toBeCloseTo(4, 9);
  });

  it("zéro si la vitesse de référence est nulle (jamais de division par zéro)", () => {
    expect(releaseSnapOffsetY(4, 1.6e-4, 0.3, 0)).toBe(0);
  });
});

describe("centerOfPressure", () => {
  it("se place derrière le centre géométrique, le long de l'axe monde de la pointe", () => {
    expect(centerOfPressure([1, 2, 3], [0, 0, -1], 0.05)).toEqual([1, 2, 3.05]);
  });
});

describe("computeRotationalDamping", () => {
  it("freine la rotation transversale, proportionnellement à la vitesse de l'air", () => {
    const t = computeRotationalDamping([0, 3, 0], AXIS, 8, 0.002);
    expect(t[1]).toBeCloseTo(-0.002 * 8 * 3, 9);
    const twice = computeRotationalDamping([0, 3, 0], AXIS, 16, 0.002);
    expect(twice[1] / t[1]).toBeCloseTo(2, 9);
  });

  it("épargne la rotation autour de l'axe (l'effet gyroscopique de vrille axiale est conservé)", () => {
    expect(computeRotationalDamping([5, 0, 0], AXIS, 8, 0.002)).toEqual([0, 0, 0]);
  });

  it("nul en l'absence de vent relatif", () => {
    expect(computeRotationalDamping([0, 3, 0], AXIS, 0, 0.002)).toEqual([0, 0, 0]);
  });
});

describe("groundedAngularDamping", () => {
  it("en l'air, ou pas encore stabilisé après un impact : amortissement faible (la culbute n'est pas étouffée)", () => {
    expect(groundedAngularDamping(0.5, -3, 0.1, 2)).toBe(0.1);
    expect(groundedAngularDamping(0.034, -3, 0.1, 2)).toBe(0.1);
  });

  it("posé au sol et sans vitesse verticale : résistance au roulement", () => {
    expect(groundedAngularDamping(0.035, 0.01, 0.1, 2)).toBe(2);
  });
});

describe("clampTransverseSpin", () => {
  it("plafonne la vrille bout sur bout mais conserve le roulis axial (le snap n'est pas écrasé)", () => {
    // 45 rad/s de culbute + 4 rad/s de roulis autour de l'axe X.
    const [x, y, z] = clampTransverseSpin([-4, 27, 36], AXIS, 12);
    expect(x).toBeCloseTo(-4, 9);
    expect(Math.hypot(y, z)).toBeCloseTo(12, 9);
    expect(y / z).toBeCloseTo(27 / 36, 9);
  });

  it("laisse intact sous le plafond", () => {
    expect(clampTransverseSpin([-4, 3, 4], AXIS, 12)).toEqual([-4, 3, 4]);
  });

  it("indifférent à la norme de l'axe fourni", () => {
    expect(clampTransverseSpin([-4, 0, 36], [9, 0, 0], 12)[2]).toBeCloseTo(12, 9);
  });
});
