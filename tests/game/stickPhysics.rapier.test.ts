import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import {
  STICK_ANGULAR_DAMPING,
  STICK_FRICTION,
  STICK_LINEAR_DAMPING,
  STICK_RADIUS,
  SAND_SURFACE_Y,
  STICK_RESTITUTION,
  STICK_SETTLE_SPEED,
  STICK_SNAP_SPIN,
  STICK_GROUND_ANGULAR_DAMPING,
  STICK_HALF_HEIGHT,
  STICK_LENGTH,
  STICK_MASS,
  STICK_TIP_AXIS,
} from "../../src/features/game/scene/sceneConstants";
import { isStickSettled, projectOntoAxis, solveAerialVelocity } from "../../src/features/game/scene/stickThrowLogic";
import { lowestPointY } from "../../src/features/game/scene/stickSandImpact";
import { stickBeforeStep, type SandState } from "../../src/features/game/scene/stickThrowSim";
import { STICK_MASS_PROPERTIES } from "../../src/features/game/scene/stickMassProperties";
import {
  STICK_DRAG_PARAMS,
  applyStickAerodynamics,
  clampTransverseSpin,
  groundedAngularDamping,
  meanDragPerMass,
  releaseSnapOffsetY,
  rotateByQuaternion,
} from "../../src/features/game/scene/stickAerodynamics";

// Headless Rapier: the stick is built like in ThrowingStick.tsx (same constants), the drag is
// applied before every step exactly like useBeforePhysicsStep does.

const DT = 1 / 60;
const HALF_TURN_Y = (deg: number) => ({ x: 0, y: Math.sin((deg * Math.PI) / 360), z: 0, w: Math.cos((deg * Math.PI) / 360) });

function createStick(world: RAPIER.World, position: RAPIER.Vector, rotation: RAPIER.Rotation) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setLinearDamping(STICK_LINEAR_DAMPING)
      .setAngularDamping(STICK_ANGULAR_DAMPING)
      .setCcdEnabled(true),
  );
  // Collider-local frame: its Y axis (the capsule axis) is the body's −X, hence the −comX.
  const { mass, comX, axialInertia, transverseInertia } = STICK_MASS_PROPERTIES;
  world.createCollider(
    RAPIER.ColliderDesc.capsule(STICK_HALF_HEIGHT, STICK_RADIUS)
      .setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 })
      .setMassProperties(
        mass,
        { x: 0, y: -comX, z: 0 },
        { x: transverseInertia, y: axialInertia, z: transverseInertia },
        { x: 0, y: 0, z: 0, w: 1 },
      )
      .setFriction(STICK_FRICTION)
      .setRestitution(STICK_RESTITUTION)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max),
    body,
  );
  return body;
}

function createLane(world: RAPIER.World) {
  const lane = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.04, 20).setTranslation(0, -0.04, 0).setFriction(0.5), lane);
}

function stepWithDrag(world: RAPIER.World, body: RAPIER.RigidBody) {
  const t = body.translation();
  body.setAngularDamping(groundedAngularDamping(t.y, body.linvel().y, STICK_ANGULAR_DAMPING, STICK_GROUND_ANGULAR_DAMPING));
  applyStickAerodynamics(body, DT);
  world.step();
}

function tipAlignment(body: RAPIER.RigidBody): number {
  const v = body.linvel();
  const speed = Math.hypot(v.x, v.y, v.z);
  const [ax, ay, az] = rotateByQuaternion(body.rotation(), STICK_TIP_AXIS);
  return (ax * v.x + ay * v.y + az * v.z) / speed;
}

beforeAll(async () => {
  await RAPIER.init();
});

describe("stick — mass properties", () => {
  function inertiaAbout(axis: { x: number; y: number; z: number }) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const body = createStick(world, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    body.setAngularDamping(0);
    world.step();
    body.applyTorqueImpulse({ x: axis.x * 1e-3, y: axis.y * 1e-3, z: axis.z * 1e-3 }, true);
    const w = body.angvel();
    return { inertia: 1e-3 / Math.hypot(w.x, w.y, w.z), body };
  }

  it("Rapier applique bien nos propriétés de masse : masse, centre de masse avancé vers la pointe", () => {
    const { body } = inertiaAbout({ x: 1, y: 0, z: 0 });
    expect(body.mass()).toBeCloseTo(STICK_MASS, 4);
    expect(body.worldCom().x - body.translation().x).toBeCloseTo(STICK_MASS_PROPERTIES.comX, 4);
  });

  it("inertie mesurée : longitudinale (axe X) ≪ transverse (Y, Z)", () => {
    const axial = inertiaAbout({ x: 1, y: 0, z: 0 }).inertia;
    const yaw = inertiaAbout({ x: 0, y: 1, z: 0 }).inertia;
    const pitch = inertiaAbout({ x: 0, y: 0, z: 1 }).inertia;
    expect(axial).toBeCloseTo(STICK_MASS_PROPERTIES.axialInertia, 6);
    expect(yaw).toBeCloseTo(STICK_MASS_PROPERTIES.transverseInertia, 5);
    expect(pitch).toBeCloseTo(STICK_MASS_PROPERTIES.transverseInertia, 5);
    expect(yaw / axial).toBeGreaterThan(20);
  });
});

describe("stick — couple de redressement (effet javelot)", () => {
  it("de travers, la pointe vient s'aligner sur la trajectoire en ~1 s, sans aucune consigne d'orientation", () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const body = createStick(world, { x: 0, y: 1, z: 3 }, HALF_TURN_Y(-30)); // pointe à ~120° de la vitesse
    body.setLinvel({ x: 0, y: 0, z: -8 }, true);
    world.step();
    const before = tipAlignment(body);
    let best = before;
    for (let i = 0; i < 60; i += 1) {
      stepWithDrag(world, body);
      best = Math.max(best, tipAlignment(body));
    }
    expect(before).toBeLessThan(0);
    expect(best).toBeGreaterThan(0.95);
  });

  it("sans traînée, l'orientation reste figée (contre-épreuve)", () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const body = createStick(world, { x: 0, y: 1, z: 3 }, HALF_TURN_Y(-30));
    body.setLinvel({ x: 0, y: 0, z: -8 }, true);
    world.step();
    const before = tipAlignment(body);
    for (let i = 0; i < 90; i += 1) world.step();
    expect(tipAlignment(body)).toBeCloseTo(before, 3);
  });

  it("la traînée freine plus un bâton de profil qu'un bâton de pointe", () => {
    const speedAfter = (deg: number) => {
      const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      const body = createStick(world, { x: 0, y: 1, z: 3 }, HALF_TURN_Y(deg));
      body.setLinvel({ x: 0, y: 0, z: -8 }, true);
      // Une traînée seule, sans le temps de se réaligner : quelques pas.
      for (let i = 0; i < 6; i += 1) stepWithDrag(world, body);
      return Math.hypot(body.linvel().x, body.linvel().z);
    };
    // 0° : pointe (+X) perpendiculaire à v → profil ; 90° : pointe vers −Z → de pointe.
    expect(speedAfter(90)).toBeGreaterThan(speedAfter(0));
  });
});

describe("stick — lâcher par impulsion excentrée", () => {
  const MASS = STICK_MASS_PROPERTIES.mass;

  // One step before the impulse, like the game (which applies the throw after the first step).
  function release(grip: [number, number, number], velocity: [number, number, number]) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const body = createStick(world, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    body.setAngularDamping(0);
    world.step();
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const o = body.translation();
    body.applyImpulseAtPoint(
      { x: MASS * velocity[0], y: MASS * velocity[1], z: MASS * velocity[2] },
      { x: o.x + grip[0], y: o.y + grip[1], z: o.z + grip[2] },
      true,
    );
    return body;
  }
  const spin = (b: RAPIER.RigidBody) => b.angvel();

  it("impulsion au centre de masse : pure translation, v = J/m", () => {
    const body = release([STICK_MASS_PROPERTIES.comX, 0, 0], [0, 0, -7]);
    expect(body.linvel().z).toBeCloseTo(-7, 4);
    expect(Math.hypot(spin(body).x, spin(body).y, spin(body).z)).toBeLessThan(1e-3);
  });

  it("impulsion en bout de bâton : même vitesse linéaire, mais rotation « bout sur bout »", () => {
    const body = release([0.25, 0, 0], [0, 0, -7]);
    expect(body.linvel().z).toBeCloseTo(-7, 4);
    expect(Math.abs(spin(body).y)).toBeGreaterThan(20);
    expect(Math.abs(spin(body).x)).toBeLessThan(1); // pas de roulis parasite
  });

  it("saisie sur la SURFACE (3 cm de l'axe) ramenée sur l'axe : aucun roulis parasite", () => {
    const surface: [number, number, number] = [0.25, 0.02, 0.03];
    const onAxis = release(projectOntoAxis(surface, STICK_TIP_AXIS), [0, 4, -7]);
    expect(Math.abs(spin(onAxis).x)).toBeLessThan(1);
    // Contre-épreuve : SANS projection, l'inertie axiale minuscule donne un roulis énorme.
    const raw = release(surface, [0, 4, -7]);
    expect(Math.abs(spin(raw).x)).toBeGreaterThan(50);
  });

  it("snap du lâcher : un point très légèrement au-dessus de l'axe donne la vrille axiale visée", () => {
    const speed = 12;
    const snapY = releaseSnapOffsetY(STICK_SNAP_SPIN, STICK_MASS_PROPERTIES.axialInertia, MASS, speed);
    const body = release([STICK_MASS_PROPERTIES.comX, snapY, 0], [0, 0, -speed]);
    expect(spin(body).x).toBeCloseTo(-STICK_SNAP_SPIN, 1); // roulement vers l'avant (haut vers −Z)
    expect(Math.hypot(spin(body).y, spin(body).z)).toBeLessThan(0.1);
  });
});

describe("stick — lob visé : le solveur tient compte de la traînée, vérifié contre la vraie physique", () => {
  const RELEASE = { y: 1.0, z: 2.4 };
  const RACK_Z = -1.6;
  const STRIKE_HEIGHT = 0.15;

  // Full throw as in the game (impulse + snap + clamp), then flies until the rack plane.
  function heightAtRack(hSpeed: number, gripX: number, dragPerMass: number) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const body = createStick(world, { x: 0, y: RELEASE.y, z: RELEASE.z }, { x: 0, y: 0, z: 0, w: 1 });
    // One step first, like the game (the impulse goes in after the first step), then a clean start.
    world.step();
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const vy = solveAerialVelocity(RELEASE.y, RELEASE.z - RACK_Z, hSpeed, STRIKE_HEIGHT, 9.81, -2, 7.5, dragPerMass);
    const snap = releaseSnapOffsetY(STICK_SNAP_SPIN, STICK_MASS_PROPERTIES.axialInertia, STICK_MASS, 12);
    const o = body.translation();
    const [gx, gy, gz] = projectOntoAxis([gripX, 0, 0], STICK_TIP_AXIS);
    body.applyImpulseAtPoint(
      { x: 0, y: STICK_MASS * vy, z: -STICK_MASS * hSpeed },
      { x: o.x + gx, y: o.y + gy + snap, z: o.z + gz },
      true,
    );
    const w = body.angvel();
    const [sx, sy, sz] = clampTransverseSpin([w.x, w.y, w.z], STICK_TIP_AXIS, 12);
    body.setAngvel({ x: sx, y: sy, z: sz }, true);
    for (let i = 0; i < 600; i += 1) {
      applyStickAerodynamics(body, DT);
      world.step();
      if (body.translation().z <= RACK_Z) return body.translation().y;
    }
    return Number.NaN;
  }

  for (const hSpeed of [5, 8, 12]) {
    for (const gripX of [0, 0.25]) {
      it(`lancer franc ${hSpeed} m/s, saisie à ${gripX} m : franchit le râtelier à hauteur de frappe (±0,25 m)`, () => {
        const y = heightAtRack(hSpeed, gripX, meanDragPerMass(STICK_DRAG_PARAMS, STICK_MASS));
        expect(Math.abs(y - STRIKE_HEIGHT)).toBeLessThan(0.25);
      });
    }
  }

  it("contre-épreuve : sans anticipation de la traînée, un lancer de 5 m/s passe bien plus bas", () => {
    const withDrag = heightAtRack(5, 0.25, meanDragPerMass(STICK_DRAG_PARAMS, STICK_MASS));
    const without = heightAtRack(5, 0.25, 0);
    expect(withDrag - without).toBeGreaterThan(0.3);
  });
});

describe("stick — transfert de moment à l'impact (culbute)", () => {
  it("un bout qui touche la piste convertit la vitesse linéaire en rotation, puis le bâton s'arrête", () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    createLane(world);
    // Bâton incliné (pointe en bas) qui arrive vers l'avant : un bout touche en premier.
    const tilt = { x: 0, y: 0, z: Math.sin(0.4), w: Math.cos(0.4) };
    const body = createStick(world, { x: 0, y: 0.35, z: 2 }, tilt);
    body.setLinvel({ x: 0, y: 0, z: -6 }, true);
    let maxAngularSpeed = 0;
    let settledAt = -1;
    for (let i = 0; i < 900; i += 1) {
      stepWithDrag(world, body);
      const w = body.angvel();
      const v = body.linvel();
      maxAngularSpeed = Math.max(maxAngularSpeed, Math.hypot(w.x, w.y, w.z));
      // Same "at rest" criterion as the game (STICK_SETTLE_SPEED).
      if (isStickSettled(
          [v.x, v.y, v.z],
          [w.x, w.y, w.z],
          rotateByQuaternion(body.rotation(), STICK_TIP_AXIS),
          { radius: STICK_RADIUS, halfLength: STICK_LENGTH / 2 },
          STICK_SETTLE_SPEED,
        )) {
        settledAt = i / 60;
        break;
      }
    }
    expect(maxAngularSpeed).toBeGreaterThan(3);
    expect(settledAt).toBeGreaterThan(0);
    expect(settledAt).toBeLessThan(5); // s
    expect(body.translation().y).toBeGreaterThan(-0.01); // n'a pas traversé la piste
    expect(body.translation().z).toBeGreaterThan(-15);
  });
});

describe("stick — sable", () => {
  const FIXED = RAPIER.RigidBodyType.Fixed;

  function createSandWorld(withLane = false) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(9, 0.5, 8)
        .setTranslation(0, SAND_SURFACE_Y - 0.5, 0)
        .setFriction(1)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setRestitution(0),
      ground,
    );
    if (withLane) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.04, 3).setTranslation(0, -0.04, 0).setFriction(0.5), ground);
    }
    return world;
  }

  // THE game loop (what a replay runs): stickBeforeStep before every step. The sand is only looked at
  // while the stick is "flying": once it has stopped or planted, the physics takes over. Without the
  // sand (`useSand: false`) it starts as "stopped", which skips the impact and keeps the rest.
  function drop(
    world: RAPIER.World,
    body: RAPIER.RigidBody,
    { useSand = true, seconds = 3 }: { useSand?: boolean; seconds?: number } = {},
  ) {
    let sand: SandState = useSand ? "flying" : "stopped";
    const states = new Set<string>();
    let contact: { position: RAPIER.Vector; vy: number } | null = null;
    for (let i = 0; i < seconds * 60; i += 1) {
      const before = { position: { ...body.translation() }, vy: body.linvel().y };
      const next = stickBeforeStep(body, sand);
      if (next !== sand && next !== "flying") contact ??= before;
      if (useSand && next !== sand) states.add(next);
      sand = next;
      world.step();
    }
    return { state: sand === "flying" ? "none" : sand, states, contact };
  }

  const tilt = (deg: number) => ({ x: 0, y: 0, z: Math.sin((deg * Math.PI) / 360), w: Math.cos((deg * Math.PI) / 360) });

  it("à plat, lancé vite : arrêté net à l'impact, il reste là où il touche", () => {
    const world = createSandWorld();
    const body = createStick(world, { x: 3, y: 0.4, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    body.setLinvel({ x: 2, y: -2, z: -4 }, true);
    world.step();
    const { state, contact } = drop(world, body);
    const t = body.translation();
    expect(state).toBe("stopped");
    // At rest by the game's own criterion: it is not held after the stop, the sand's friction keeps it down.
    expect(Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z)).toBeLessThan(STICK_SETTLE_SPEED);
    expect(t.y).toBeCloseTo(SAND_SURFACE_Y + STICK_RADIUS, 2); // posé sur le sable, pas enfoncé
    // Il n'a presque pas glissé après le contact. Dans la vraie boucle l'arrêt n'est appliqué qu'une fois
    // (ensuite le sable seul le retient) : il se tasse encore de quelques cm (~6). La contre-épreuve
    // ci-dessous montre l'écart avec un bâton non arrêté (plus de 15 cm de plus).
    expect(Math.hypot(t.x - contact!.position.x, t.z - contact!.position.z)).toBeLessThan(0.1);
  });

  it("contre-épreuve : sans l'arrêt net, ce même bâton glisse bien plus loin", () => {
    const run = (useSand: boolean) => {
      const world = createSandWorld();
      const body = createStick(world, { x: 3, y: 0.4, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
      body.setLinvel({ x: 2, y: -2, z: -4 }, true);
      world.step();
      drop(world, body, { useSand });
      const t = body.translation();
      return Math.hypot(t.x - 3, t.z);
    };
    expect(run(false)).toBeGreaterThan(run(true) + 0.15);
  });

  it("bout en bas, incliné et rapide : planté, corps figé, enfoncé de la profondeur attendue", () => {
    const world = createSandWorld();
    const body = createStick(world, { x: 3, y: 0.7, z: 0 }, tilt(60));
    body.setLinvel({ x: 1, y: -5, z: 0 }, true);
    world.step();
    const { state, contact } = drop(world, body, { seconds: 1 });
    const t = body.translation();
    expect(state).toBe("planted");
    expect(body.bodyType()).toBe(FIXED);
    // 4 cm de profondeur par m/s d'impact, plafonné à 25 cm de bâton (× sin 60° en vertical).
    const sin60 = Math.sin((60 * Math.PI) / 180);
    const expectedDepth = Math.min(-contact!.vy * 0.04, 0.25 * sin60);
    expect(lowestPointY(t.y, sin60)).toBeCloseTo(SAND_SURFACE_Y - expectedDepth, 2);
    expect(expectedDepth).toBeGreaterThan(0.1); // enfoncé pour de bon
    // Et il ne bouge plus.
    const before = { ...t };
    drop(world, body, { seconds: 1 });
    expect(body.translation().y).toBeCloseTo(before.y, 6);
    expect(body.translation().x).toBeCloseTo(before.x, 6);
  });

  it("incliné mais LENT : simplement arrêté, pas planté", () => {
    const world = createSandWorld();
    const body = createStick(world, { x: 3, y: 0.19, z: 0 }, tilt(60)); // le bout à ~2 cm du sable
    body.setLinvel({ x: 0, y: -0.4, z: 0 }, true);
    world.step();
    const { states } = drop(world, body, { seconds: 2 });
    expect(states.has("planted")).toBe(false);
    expect(states.has("stopped")).toBe(true);
    expect(body.bodyType()).not.toBe(FIXED);
  });

  it("sur la piste (au-dessus du sable) : jamais d'arrêt net ni de plantage", () => {
    const world = createSandWorld(true);
    const body = createStick(world, { x: 0, y: 0.5, z: 0 }, tilt(60));
    body.setLinvel({ x: 0, y: -5, z: -1 }, true);
    world.step();
    const { states, state } = drop(world, body, { seconds: 2 });
    expect([...states]).toEqual([]); // no impact with the sand at all
    expect(state).toBe("none");
    expect(body.translation().y).toBeGreaterThan(-0.01);
  });
});
