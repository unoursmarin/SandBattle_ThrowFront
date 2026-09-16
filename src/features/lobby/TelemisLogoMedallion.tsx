import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import type { Group } from "three";

const LOGO_MODEL_URL = "/models/telemis_logo.glb";
useGLTF.preload(LOGO_MODEL_URL);

const ROTATE_SPEED = 0.012;
const MOMENTUM_DAMPING = 0.94;
const MOMENTUM_STOP_THRESHOLD = 0.0002;
const TILT_LIMIT = 0.6;
const RETURN_EASE = 0.06;
const RETURN_SNAP_THRESHOLD = 0.002;
const TWO_PI = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// bonus 3D model of telemis 
function Medallion() {
  const { scene } = useGLTF(LOGO_MODEL_URL);
  const groupRef = useRef<Group>(null);
  const reduceMotion = useReducedMotion();
  const drag = useRef({ dragging: false, lastX: 0, lastY: 0, velocityX: 0, velocityY: 0 });

  useFrame(() => {
    const group = groupRef.current;
    const state = drag.current;
    if (!group || state.dragging || reduceMotion) return;

    const hasMomentum = Math.abs(state.velocityX) > MOMENTUM_STOP_THRESHOLD || Math.abs(state.velocityY) > MOMENTUM_STOP_THRESHOLD;
    if (hasMomentum) {
      group.rotation.y += state.velocityX;
      group.rotation.x = clamp(group.rotation.x + state.velocityY, -TILT_LIMIT, TILT_LIMIT);
      state.velocityX *= MOMENTUM_DAMPING;
      state.velocityY *= MOMENTUM_DAMPING;
      return;
    }

// goes back to pos
    const targetY = Math.round(group.rotation.y / TWO_PI) * TWO_PI;
    const remainingY = targetY - group.rotation.y;
    const remainingX = -group.rotation.x;
    if (Math.abs(remainingY) < RETURN_SNAP_THRESHOLD && Math.abs(remainingX) < RETURN_SNAP_THRESHOLD) {
      group.rotation.y = targetY;
      group.rotation.x = 0;
      return;
    }
    group.rotation.y += remainingY * RETURN_EASE;
    group.rotation.x += remainingX * RETURN_EASE;
  });

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current.dragging = true;
    drag.current.lastX = event.clientX;
    drag.current.lastY = event.clientY;
    drag.current.velocityX = 0;
    drag.current.velocityY = 0;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drag.current.dragging || !groupRef.current) return;
    const dx = event.clientX - drag.current.lastX;
    const dy = event.clientY - drag.current.lastY;
    drag.current.lastX = event.clientX;
    drag.current.lastY = event.clientY;

    const rotateY = dx * ROTATE_SPEED;
    const rotateX = dy * ROTATE_SPEED;
    groupRef.current.rotation.y += rotateY;
    groupRef.current.rotation.x = clamp(groupRef.current.rotation.x + rotateX, -TILT_LIMIT, TILT_LIMIT);
    // Conservés pour l'inertie post-relâcher, sautés sous reduced-motion
    // (voir useFrame ci-dessus) : le glisser lui-même reste toujours actif,
    // c'est un geste direct de l'utilisateur, pas une animation automatique.
    if (!reduceMotion) {
      drag.current.velocityX = rotateY;
      drag.current.velocityY = rotateX;
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current.dragging = false;
    // Sous reduced-motion, useFrame ne fait plus rien après le glisser (voir
    // plus haut) : le retour face-avant doit donc être un repositionnement
    // instantané ici plutôt qu'absent, pour ne jamais reposer sur le dos
    // vide du médaillon quel que soit le réglage de mouvement.
    if (reduceMotion && groupRef.current) {
      groupRef.current.rotation.y = 0;
      groupRef.current.rotation.x = 0;
    }
  }

  return (
    <group ref={groupRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Canvas dédié au médaillon (voir docs/architecture/3d-rendering.md) :
 * volontairement séparé du module de scène de jeu (physique Rapier, ~1,9 Mo
 * gzippé) — chargé en lazy depuis HomeScreen.tsx, aucune dépendance à
 * `@react-three/rapier` ici. Reste un ajout réel au poids de l'accueil
 * (three.js + react-three-fiber + drei), assumé pour cette fonctionnalité,
 * mais isolé dans son propre chunk plutôt que dans le bundle critique.
 */
export function TelemisLogoMedallion() {
  return (
    <Canvas
      // Distance calée pour que le dossier du médaillon (rayon ≈0,35 m,
      // voir generate-logo.mjs : BACKING_R) tienne entièrement dans le
      // cadre avec une marge confortable (~20%) — à 0,85 m/fov 32°, la
      // demi-hauteur visible n'était que d'≈0,24 m : le médaillon dépassait
      // du canvas, constaté à l'écran.
      camera={{ position: [0, 0, 1.5], fov: 32 }}
      dpr={[1, 2]}
      style={{ touchAction: "none", cursor: "grab" }}
      className="active:cursor-grabbing"
    >
      <ambientLight intensity={2.4} color="#e2c37c" />
      <directionalLight position={[1.2, 1.6, 1.4]} intensity={3.2} color="#f7f1e6" />
      <directionalLight position={[-1.4, -0.6, 0.8]} intensity={1.4} color="#d97a52" />
      <Medallion />
    </Canvas>
  );
}
