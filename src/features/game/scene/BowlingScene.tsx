import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type RootState } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";

import { Ball } from "./Ball";
import { ThrowingStick } from "./ThrowingStick";
import type { ProjectileType } from "./projectileTypes";
import { Decor } from "./Decor";
import { ConfettiEmitters, type CelebrationEvent } from "./Confetti";
import { Lane } from "./Lane";
import { Sand } from "./Sand";
import { PinRack, type PinRackHandle } from "./PinRack";
import { getLaneLayout, type LaneSize } from "./laneSizes";
import { ThrowReplayDirector, type ReplayResult } from "../replay/ThrowReplayDirector";
import type { CapturedThrow, ReplayInput } from "../replay/throwPayload";
import type { ThrowCapture } from "../replay/replayTypes";

const CONFETTI_SIDE_RADIUS = 3.6;
const CONFETTI_SIDE_OFFSET = CONFETTI_SIDE_RADIUS * Math.SQRT1_2;
const WEBGL_UNAVAILABLE_HELP = [
  "Vérifiez que l'accélération matérielle est activée dans les réglages de votre navigateur.",
  "Essayez une version récente de Chrome, Firefox ou Edge.",
  "Mettez à jour les pilotes de votre carte graphique si le problème persiste.",
] as const;

//Onwin we use that
function confettiEmitters(cavePosition: [number, number, number]) {
  const originZ = cavePosition[2] + 3.2;
  return {
    left: [cavePosition[0] - CONFETTI_SIDE_OFFSET, 2.4, originZ] as [number, number, number],
    right: [cavePosition[0] + CONFETTI_SIDE_OFFSET, 2.4, originZ] as [number, number, number],
    center: [cavePosition[0], 3.2, originZ - 0.6] as [number, number, number],
  };
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

// fallback WebGL help messages

export function BowlingScene({
  pinsStanding,
  rollSequence,
  canThrow,
  onRollComplete,
  celebration,
  projectileType,
  laneSize,
  onThrowLaunched,
  remoteReplay = null,
  onRemoteReplayFinished,
  onReplayActiveChange,
}: {
  pinsStanding: number;
  rollSequence: number;
  canThrow: boolean;
  onRollComplete: (pinsFelled: number) => void;
  celebration?: CelebrationEvent | null;
  projectileType: ProjectileType;
  laneSize: LaneSize;
  /** The local player just launched a throw: send it to the server so the others can replay it. */
  onThrowLaunched?: (thrown: CapturedThrow) => void;
  /** Another player's throw to replay (a new throw id starts a new replay). */
  remoteReplay?: ReplayInput | null;
  onRemoteReplayFinished?: (throwId: string) => void;
  /** True while a replay (the local player's own, or another's) is on screen. */
  onReplayActiveChange?: (active: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [webglSupported, setWebglSupported] = useState(supportsWebGL);
  const [contextLost, setContextLost] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [isDraggingBall, setIsDraggingBall] = useState(false);
  const pinRackRef = useRef<PinRackHandle>(null);
  // The local player's own throw plays in a private world, like everyone else's: same state, same code, same result.
  const [ownReplay, setOwnReplay] = useState<ReplayInput | null>(null);
  const [replayActive, setReplayActive] = useState(false);
  const [finishToken, setFinishToken] = useState(0);
  const layout = getLaneLayout(laneSize);
  const emitters = useMemo(() => confettiEmitters(layout.cavePosition), [layout.cavePosition]);
  useEffect(() => {
    if (!canvasEl) return;

    function handleContextLost(event: Event) {
      event.preventDefault();
      setContextLost(true);
    }
    function handleContextRestored() {
      setContextLost(false);
    }

    canvasEl.addEventListener("webglcontextlost", handleContextLost, false);
    canvasEl.addEventListener("webglcontextrestored", handleContextRestored, false);
    return () => {
      canvasEl.removeEventListener("webglcontextlost", handleContextLost);
      canvasEl.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [canvasEl]);

  function handleCanvasCreated(state: RootState) {
    setCanvasEl(state.gl.domElement);
  }

  function retryWebGL() {
    setWebglSupported(supportsWebGL());
    setContextLost(false);
    setRetryToken((token) => token + 1);
  }

  /**
   * The projectile just left the hand: the throw is played in a private world, from the launch
   * variables and the rack as it is now (see ThrowReplayDirector) — the same for every client, this
   * one included. The score is what that replay says.
   */
  function handleThrowLaunched(capture: ThrowCapture) {
    const rack = pinRackRef.current?.snapshotPins() ?? [];
    if (rack.length === 0) {
      // No rack to start from: nothing can be played. Count an empty roll rather than freezing the game.
      console.error("Lancer impossible à rejouer : râtelier indisponible.");
      setFinishToken((token) => token + 1);
      onRollComplete(0);
      return;
    }
    onThrowLaunched?.({ capture, rack, laneSize });
    setOwnReplay({
      throwId: crypto.randomUUID(),
      playerId: "",
      projectile: capture.projectile,
      laneSize,
      launch: capture.launch,
      rack,
      own: true,
    });
  }

  function handleReplayActiveChange(active: boolean) {
    setReplayActive(active);
    onReplayActiveChange?.(active);
  }

  function handleReplayFinished(result: ReplayResult) {
    if (result.own) {
      setOwnReplay(null);
      setFinishToken((token) => token + 1);
      if (result.felled === null) console.error("Le rejeu de votre lancer a échoué : lancer compté à 0 quille.");
      onRollComplete(result.felled ?? 0);
    } else {
      onRemoteReplayFinished?.(result.throwId);
    }
  }

  if (!webglSupported) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden bg-stone-900 p-8 text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.1em]">Rendu 3D indisponible</p>
        <p>Le rendu 3D n'est pas disponible sur ce navigateur.</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-left text-sm text-sand-200">
          {WEBGL_UNAVAILABLE_HELP.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="text-sand-200 font-mono tabular-nums">{pinsStanding} quille(s) debout dans la frame en cours.</p>
        <Button type="button" variant="secondary" className="mt-2 w-auto" onClick={retryWebGL}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Canvas
        key={retryToken}
        onCreated={handleCanvasCreated}
        camera={{ position: layout.cameraPosition, fov: 45 }}
        shadows="soft"
        gl={{ toneMappingExposure: 1.4 }}
      >
        <color attach="background" args={["#bfe3f7"]} />
        <ambientLight intensity={2.8} color="#e2c37c" />
        <directionalLight position={[3, 5, 2]} intensity={5.5} color="#f7f1e6" castShadow />
        <directionalLight position={[-3, 3, -2]} intensity={2.2} color="#d97a52" />
        <Suspense fallback={null}>
          <Decor cavePosition={layout.cavePosition} />

          <Physics gravity={[0, -9.81, 0]} numSolverIterations={24} numInternalPgsIterations={8}>
            <Sand />
            <Lane layout={layout} />
            <PinRack ref={pinRackRef} pinsStanding={pinsStanding} rollSequence={rollSequence} layout={layout} />
            {projectileType === "stick" ? (
              <ThrowingStick
                canThrow={canThrow}
                onDragChange={setIsDraggingBall}
                layout={layout}
                onThrowLaunched={handleThrowLaunched}
                hidden={replayActive}
                finishToken={finishToken}
              />
            ) : (
              <Ball
                canThrow={canThrow}
                onDragChange={setIsDraggingBall}
                layout={layout}
                onThrowLaunched={handleThrowLaunched}
                hidden={replayActive}
                finishToken={finishToken}
              />
            )}
            <ThrowReplayDirector
              input={ownReplay ?? remoteReplay}
              projectileType={projectileType}
              laneSize={laneSize}
              layout={layout}
              pinRackRef={pinRackRef}
              onActiveChange={handleReplayActiveChange}
              onFinished={handleReplayFinished}
            />
          </Physics>
        </Suspense>
        
        <ConfettiEmitters
          celebration={celebration ?? null}
          emitterLeft={emitters.left}
          emitterRight={emitters.right}
          emitterCenter={emitters.center}
          reduceMotion={Boolean(reduceMotion)}
        />
        <OrbitControls
          enabled={!isDraggingBall}
          enablePan={false}
          minDistance={3}
          maxDistance={projectileType === "stick" ? 12 : 8}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
      {contextLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-900 p-8 text-center" role="alert">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.1em]">Connexion 3D interrompue</p>
          <p>Le navigateur a temporairement perdu le contexte graphique de la scène.</p>
          <p className="text-sand-200 font-mono tabular-nums">{pinsStanding} quille(s) debout dans la frame en cours.</p>
          <Button type="button" variant="secondary" className="mt-2 w-auto" onClick={retryWebGL}>
            Réessayer
          </Button>
        </div>
      )}
    </div>
  );
}
