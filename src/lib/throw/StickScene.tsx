import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { ThrowTrajectoryLine } from "./ThrowTrajectoryLine";
import { useStickThrow } from "./useStickThrow";

/** Dimensions du bâton d'exemple (même gabarit que `throwing_stick.glb`). */
const STICK_RADIUS = 0.035;
const STICK_LENGTH = 0.6;

/**
 * Bâton manipulable de la scène d'exemple : attraper-glisser pour viser
 * (parabole dorée), relâcher pour lancer en l'air, double-clic pour le
 * replacer à sa pose initiale. La caméra orbitale se fige pendant le
 * drag et le vol pour ne jamais parasiter le geste.
 */
function Stick() {
  const { meshRef, dragging, flying, aimPoints, handlers } = useStickThrow({
    groundY: 0,
    restOffsetY: STICK_RADIUS,
  });

  return (
    <>
      <OrbitControls enabled={!dragging && !flying} enablePan={false} minDistance={2} maxDistance={10} />
      <mesh
        ref={meshRef}
        position={[0, 1.2, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        {...handlers}
      >
        <cylinderGeometry args={[STICK_RADIUS, STICK_RADIUS, STICK_LENGTH, 24]} />
        <meshStandardMaterial color="#8a5a2b" roughness={0.7} />
      </mesh>
      {!flying && <ThrowTrajectoryLine points={aimPoints} />}
    </>
  );
}

/**
 * Scène d'exemple prête à l'emploi : `<Canvas>`, éclairage basique, sol et
 * bâton lançable — sans aucun moteur physique (voir `useStickThrow`).
 */
export function StickScene() {
  return (
    <Canvas camera={{ position: [0, 2.2, 4.5], fov: 45 }} shadows>
      <color attach="background" args={["#0e0c0a"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1c1917" />
      </mesh>
      <Stick />
    </Canvas>
  );
}
