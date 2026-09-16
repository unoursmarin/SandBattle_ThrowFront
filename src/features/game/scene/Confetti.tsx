import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type ConfettiKind = "spare" | "strike" | "gameComplete";
export type CelebrationEvent = { kind: ConfettiKind; key: number };

const MAX_PARTICLES = 320;
const GRAVITY = -6; // m/s²
const DRAG = 0.6; // linear damping per second
const LIFETIME_SECONDS = 5;
const GROUND_KILL_Y = -1;
const HALF_SQRT2 = Math.SQRT1_2; // sin(45°) = cos(45°)
const AXIS_LEFT = new THREE.Vector3(-HALF_SQRT2, 1, HALF_SQRT2).normalize();
const AXIS_RIGHT = new THREE.Vector3(HALF_SQRT2, 1, HALF_SQRT2).normalize();
const AXIS_CENTER = new THREE.Vector3(0, 1, 1).normalize();

/**
 * Demi-angle du cône d'émission autour de chaque axe — "un gros angle",
 * demande explicite de la fiche de direction du correctif : un vrai cône
 * large autour de la direction à 45°, pas un jet quasi rectiligne.
 */
const CONE_HALF_ANGLE = (50 * Math.PI) / 180; // ≈ 50°

/**
 * Un seul modèle d'émission pour les trois évènements — seule la durée du
 * jet change (petit/plus long/infini), voir la fiche de direction du
 * correctif : spare = petit jet, strike = jet plus long, fin de partie =
 * jet infini. `durationS: null` signifie "sans limite de temps" : le jet
 * continue tant que l'effet déclencheur n'est pas nettoyé (démontage de
 * l'écran de jeu), voir `ConfettiEmitters` plus bas.
 *
 * `speed` a été relevée par rapport à l'ancienne implémentation : avec la
 * traînée (`DRAG`) et la durée de vie des particules, la portée réelle
 * dépend directement de cette vitesse initiale — trop faible, les
 * confettis retombaient avant de sortir de la grotte et n'étaient donc
 * jamais visibles depuis la piste (cause du bug initial, voir aussi le
 * repositionnement des émetteurs dans BowlingScene.tsx).
 */
type JetTierConfig = {
  intervalMs: number;
  perEmitterPerTick: number;
  speed: number;
  /** null = jet sans limite de durée (fin de partie). */
  durationS: number | null;
};

const JET_TIER_CONFIG: Record<ConfettiKind, JetTierConfig> = {
  spare: { intervalMs: 110, perEmitterPerTick: 3, speed: 8.5, durationS: 0.6 },
  strike: { intervalMs: 100, perEmitterPerTick: 4, speed: 9.5, durationS: 1.8 },
  // Débit volontairement identique à l'ancienne version validée du jet
  // continu (3 émetteurs × 3 particules / 0,2 s ≈ 45/s) : à l'équilibre
  // (débit × durée de vie) ≈ 45 × 5 ≈ 225 particules actives simultanément,
  // sous MAX_PARTICLES (320) avec marge — sûr même sans limite de durée
  // puisque le débit d'ÉMISSION reste borné, seule sa durée totale change.
  gameComplete: { intervalMs: 200, perEmitterPerTick: 3, speed: 9.5, durationS: null },
};

/** Même famille de couleurs que le reste du produit — voir design.md, section Colors. */
const CONFETTI_COLORS = [
  new THREE.Color("#b5502d"), // terracotta-600
  new THREE.Color("#d97a52"), // terracotta-400
  new THREE.Color("#c99a3e"), // gold-500
  new THREE.Color("#e2c37c"), // gold-300
  new THREE.Color("#f0e7d8"), // sand-100
];

type Particle = {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  angularVelocity: THREE.Vector3;
  life: number;
  color: THREE.Color;
};

function createPool(): Particle[] {
  return Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    angularVelocity: new THREE.Vector3(),
    life: 0,
    color: CONFETTI_COLORS[0],
  }));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Scratch réutilisés entre appels plutôt que réalloués à chaque particule —
// ni spawnBurst ni sampleConeDirection ne sont ré-entrants (appelés
// synchrone depuis un effet ou un tick d'intervalle), donc un seul jeu de
// scratch suffit.
const scratchDir = new THREE.Vector3();
const scratchU = new THREE.Vector3();
const scratchV = new THREE.Vector3();

/**
 * Échantillonne une direction unitaire uniforme dans la calotte sphérique
 * de demi-angle `halfAngle` autour de `axis`, et l'écrit dans `out`. Base
 * orthonormée (u, v, axis) construite via un produit vectoriel avec l'axe
 * monde Y — valide ici car `axis` (élévation 45°, voir `AXIS_LEFT` etc.)
 * n'est jamais parallèle à Y, donc jamais dégénéré.
 */
function sampleConeDirection(axis: THREE.Vector3, halfAngle: number, out: THREE.Vector3) {
  const cosHalf = Math.cos(halfAngle);
  // Tirage uniforme en aire sur la calotte (pas juste en angle, sinon les
  // directions se concentreraient artificiellement près de l'axe).
  const cosTheta = 1 - Math.random() * (1 - cosHalf);
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const phi = Math.random() * Math.PI * 2;

  scratchU.set(0, 1, 0).cross(axis).normalize();
  scratchV.crossVectors(axis, scratchU);

  out.copy(scratchU).multiplyScalar(sinTheta * Math.cos(phi));
  out.addScaledVector(scratchV, sinTheta * Math.sin(phi));
  out.addScaledVector(axis, cosTheta);
}

/**
 * Cherche jusqu'à `count` particules inactives dans le pool et les relance
 * depuis `origin`, avec une direction tirée dans un cône large (voir
 * `CONE_HALF_ANGLE`) autour de `axis` — "un gros angle", pas un jet
 * rectiligne, voir la fiche de direction du correctif.
 */
function spawnBurst(
  particles: Particle[],
  origin: readonly [number, number, number],
  axis: THREE.Vector3,
  speed: number,
  count: number,
) {
  let spawned = 0;
  for (let i = 0; i < particles.length && spawned < count; i++) {
    const p = particles[i];
    if (p.active) continue;
    p.active = true;
    p.position.set(
      origin[0] + randomBetween(-0.2, 0.2),
      origin[1] + randomBetween(-0.1, 0.1),
      origin[2] + randomBetween(-0.2, 0.2),
    );

    sampleConeDirection(axis, CONE_HALF_ANGLE, scratchDir);

    const particleSpeed = speed * randomBetween(0.85, 1.15);
    p.velocity.copy(scratchDir).multiplyScalar(particleSpeed);

    p.rotation.set(randomBetween(0, Math.PI * 2), randomBetween(0, Math.PI * 2), randomBetween(0, Math.PI * 2));
    p.angularVelocity.set(randomBetween(-6, 6), randomBetween(-6, 6), randomBetween(-6, 6));
    p.life = LIFETIME_SECONDS * randomBetween(0.9, 1.05);
    p.color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    spawned++;
  }
}

/**
 * Trois lanceurs de confettis derrière la grotte (voir Decor.tsx,
 * `CAVE_POSITION`, et les positions `emitterLeft`/`emitterRight`/
 * `emitterCenter` calées dans BowlingScene.tsx) — purement décoratif, hors
 * du monde physique Rapier (même principe que `<Decor />` : jamais de
 * `RigidBody`/collider, voir docs/architecture/3d-rendering.md). Un pool
 * fixe de particules réutilisées (jamais d'allocation par frame) ; un seul
 * `THREE.Object3D` ("dummy") recompose la matrice de chaque instance active.
 *
 * Spare/strike/fin de partie partagent le même mécanisme de jet continu
 * (voir `JET_TIER_CONFIG`), seule sa durée change (petit/plus long/infini).
 * Spare et strike n'utilisent que les deux émetteurs latéraux ("des deux
 * côtés de la grotte") ; la fin de partie ajoute l'émetteur central (les
 * 3 emplacements demandés par la fiche de direction du correctif).
 */
export function ConfettiEmitters({
  celebration,
  emitterLeft,
  emitterRight,
  emitterCenter,
  reduceMotion,
}: {
  celebration: CelebrationEvent | null;
  emitterLeft: readonly [number, number, number];
  emitterRight: readonly [number, number, number];
  emitterCenter: readonly [number, number, number];
  reduceMotion: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  // Pool volontairement mutable (position/vélocité/vie relues et réécrites
  // chaque frame, jamais réallouées) — un ref plutôt qu'un state, peuplé
  // dans un effet (jamais pendant le rendu) : la lecture/écriture de
  // `.current` ne se produit ensuite que dans useFrame et dans l'effet de
  // déclenchement ci-dessous, jamais dans le corps du composant lui-même.
  const particlesRef = useRef<Particle[] | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lastKeyRef = useRef<number | null>(null);

  useEffect(() => {
    particlesRef.current = createPool();
  }, []);

  useEffect(() => {
    const particles = particlesRef.current;
    if (!particles || !celebration || celebration.key === lastKeyRef.current) return;
    lastKeyRef.current = celebration.key;
    // `prefers-reduced-motion` : le moment est déjà lisible ailleurs (symbole
    // X//, couleur or du score) — un jet de particules n'a pas d'équivalent
    // statique sensé, donc on le saute plutôt que d'en forcer une version
    // dégradée, voir design.md §Do's.
    if (reduceMotion) return;

    // Émetteur central réservé à la fin de partie (3 emplacements, voir la
    // fiche de direction du correctif) — spare/strike restent "des deux
    // côtés de la grotte" uniquement.
    const tier = JET_TIER_CONFIG[celebration.kind];
    const useCenterEmitter = celebration.kind === "gameComplete";
    const startedAt = performance.now();
    const intervalId = window.setInterval(() => {
      // `durationS === null` : jet sans limite de temps (fin de partie) —
      // seul le nettoyage de l'effet (démontage de l'écran de jeu, ou
      // nouvel évènement) arrête l'émission, voir la fonction de cleanup
      // retournée ci-dessous.
      if (tier.durationS !== null && performance.now() - startedAt >= tier.durationS * 1000) {
        window.clearInterval(intervalId);
        return;
      }
      spawnBurst(particles, emitterLeft, AXIS_LEFT, tier.speed, tier.perEmitterPerTick);
      spawnBurst(particles, emitterRight, AXIS_RIGHT, tier.speed, tier.perEmitterPerTick);
      if (useCenterEmitter) {
        spawnBurst(particles, emitterCenter, AXIS_CENTER, tier.speed, tier.perEmitterPerTick);
      }
    }, tier.intervalMs);

    return () => window.clearInterval(intervalId);
  }, [celebration, reduceMotion, emitterLeft, emitterRight, emitterCenter]);

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    const particles = particlesRef.current;
    if (!mesh || !particles) return;
    let anyActive = false;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.active) {
        anyActive = true;
        p.velocity.y += GRAVITY * delta;
        p.velocity.multiplyScalar(Math.max(0, 1 - DRAG * delta));
        p.position.addScaledVector(p.velocity, delta);
        p.rotation.x += p.angularVelocity.x * delta;
        p.rotation.y += p.angularVelocity.y * delta;
        p.rotation.z += p.angularVelocity.z * delta;
        p.life -= delta;
        if (p.life <= 0 || p.position.y < GROUND_KILL_Y) p.active = false;
      }
      if (p.active) {
        dummy.position.copy(p.position);
        dummy.rotation.copy(p.rotation);
        dummy.scale.setScalar(1);
      } else {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = anyActive;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false}>
      <planeGeometry args={[0.045, 0.07]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}
