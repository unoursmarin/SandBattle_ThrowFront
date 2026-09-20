import { describe, expect, it } from "vitest";
import { BALL_RADIUS } from "../../src/features/game/scene/sceneConstants";
import { getLaneLayout } from "../../src/features/game/scene/laneSizes";
import {
  BALL_STOP_ZONE_DECELERATION,
  ballBeforeStep,
  ballRollingSpin,
  ballTrackFor,
  launchBall,
  type BallSimBody,
} from "../../src/features/game/scene/ballThrowSim";
import { PHYSICS_TIMESTEP } from "../../src/features/game/scene/stickThrowSim";

function fakeBall(state: { x: number; y: number; z: number; vx: number; vz: number }) {
  const calls: string[] = [];
  const body: BallSimBody & { state: typeof state; calls: string[] } = {
    state,
    calls,
    translation: () => ({ x: state.x, y: state.y, z: state.z }),
    linvel: () => ({ x: state.vx, y: 0, z: state.vz }),
    setTranslation: (t) => {
      calls.push("setTranslation");
      state.x = t.x;
      state.y = t.y;
      state.z = t.z;
    },
    setLinvel: (v) => {
      calls.push("setLinvel");
      state.vx = v.x;
      state.vz = v.z;
    },
    setAngvel: () => {
      calls.push("setAngvel");
    },
  };
  return body;
}

const layout = getLaneLayout("medium");
const track = ballTrackFor(layout);

describe("ballTrackFor", () => {
  it("la zone d'arrêt commence une marge derrière la dernière rangée de quilles", () => {
    expect(track.stopZoneZ).toBeCloseTo(
      layout.pinTipRowZ - (layout.pinRowSizes.length - 1) * layout.pinRowSpacing - 0.5,
      9,
    );
  });

  it("la balle roule à la hauteur de la piste, ou du chenal quand elle est hors de la piste", () => {
    expect(track.restHeight(0)).toBe(layout.ballRest[1]);
    expect(track.restHeight(layout.laneHalfWidth + 0.05)).toBeLessThan(layout.ballRest[1]);
  });
});

describe("ballRollingSpin", () => {
  it("roulement sans glissement : ω = v / r, autour de l'axe horizontal perpendiculaire à la vitesse", () => {
    const w = ballRollingSpin(0, -6);
    expect(w.x).toBeCloseTo(-6 / BALL_RADIUS, 9);
    expect(w.y).toBe(0);
    expect(Math.abs(w.z)).toBeCloseTo(0, 9);
    const sideways = ballRollingSpin(3, 0);
    expect(sideways.z).toBeCloseTo(-3 / BALL_RADIUS, 9);
  });

  it("à l'arrêt, aucune rotation", () => {
    expect(ballRollingSpin(0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("launchBall", () => {
  it("donne la vitesse du geste (à plat) et la rotation de roulement", () => {
    const body = fakeBall({ x: 0, y: 0.108, z: 4, vx: 0, vz: 0 });
    launchBall(body, 1.5, -6);
    expect(body.state.vx).toBe(1.5);
    expect(body.state.vz).toBe(-6);
    expect(body.calls).toEqual(["setLinvel", "setAngvel"]);
  });

  it("sans vitesse (lancer avorté), ne touche à rien", () => {
    const body = fakeBall({ x: 0, y: 0.108, z: 4, vx: 0, vz: 0 });
    launchBall(body, 0, 0);
    expect(body.calls).toEqual(["setLinvel"]); // vitesse nulle explicite, pas de rotation
  });
});

describe("ballBeforeStep", () => {
  it("hors de la zone d'arrêt, la vitesse n'est pas modifiée", () => {
    const body = fakeBall({ x: 0, y: layout.ballRest[1], z: 0, vx: 0, vz: -6 });
    ballBeforeStep(body, track);
    expect(body.state.vz).toBe(-6);
    expect(body.calls).toEqual([]);
  });

  it("dans la zone d'arrêt, freine de 8 m/s² × un pas, sans changer de direction", () => {
    const body = fakeBall({ x: 0.3, y: layout.ballRest[1], z: track.stopZoneZ - 0.1, vx: 3, vz: -4 });
    ballBeforeStep(body, track);
    const speed = Math.hypot(body.state.vx, body.state.vz);
    expect(speed).toBeCloseTo(5 - BALL_STOP_ZONE_DECELERATION * PHYSICS_TIMESTEP, 9);
    expect(body.state.vx / body.state.vz).toBeCloseTo(3 / -4, 9);
  });

  it("finit par s'arrêter, sans jamais repartir en arrière", () => {
    const body = fakeBall({ x: 0, y: layout.ballRest[1], z: track.stopZoneZ - 0.1, vx: 0, vz: -1 });
    for (let i = 0; i < 60; i += 1) ballBeforeStep(body, track);
    expect(Math.abs(body.state.vz)).toBe(0);
  });

  it("le freinage suit le pas de physique, pas la cadence de rendu : N pas donnent toujours le même résultat", () => {
    const run = (steps: number) => {
      const body = fakeBall({ x: 0, y: layout.ballRest[1], z: track.stopZoneZ - 0.1, vx: 0, vz: -3 });
      for (let i = 0; i < steps; i += 1) ballBeforeStep(body, track);
      return body.state.vz;
    };
    expect(run(10)).toBe(run(10));
    expect(run(10)).toBeCloseTo(-3 + BALL_STOP_ZONE_DECELERATION * PHYSICS_TIMESTEP * 10, 9);
  });

  it("la hauteur rejoint celle de la piste en décroissant exponentiellement (12 /s)", () => {
    const rest = layout.ballRest[1];
    const body = fakeBall({ x: 0, y: rest + 0.2, z: 0, vx: 0, vz: -5 });
    ballBeforeStep(body, track);
    expect(body.state.y).toBeCloseTo(rest + 0.2 * Math.exp(-12 * PHYSICS_TIMESTEP), 9);
  });

  it("dans le chenal, la hauteur visée est celle du chenal", () => {
    const x = layout.laneHalfWidth + 0.1;
    const body = fakeBall({ x, y: layout.ballRest[1], z: 0, vx: 0, vz: -5 });
    ballBeforeStep(body, track);
    expect(body.state.y).toBeLessThan(layout.ballRest[1]);
  });

  it("ne bouge pas la balle quand elle est déjà à la bonne hauteur (à 1e-5 près)", () => {
    const body = fakeBall({ x: 0, y: layout.ballRest[1] + 5e-6, z: 0, vx: 0, vz: -5 });
    ballBeforeStep(body, track);
    expect(body.calls).not.toContain("setTranslation");
  });
});
