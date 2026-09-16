import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Plane, Quaternion, Vector3, type Mesh } from "three";

import {
  applyTumble,
  clampSpeed,
  computeAngularSpeed,
  computeReleaseVelocity,
  computeTumbleAxis,
  integrateFlightStep,
  sampleTrajectoryPoints,
  type DragSample,
} from "./stickThrowMath";

export type StickThrowOptions = {
  /** Gravité de la cloche (m/s²). */
  gravity?: number;
  /** Hauteur du sol monde (le bâton s'y pose + `restOffsetY`). */
  groundY?: number;
  /** Demi-épaisseur du bâton : le centre s'arrête à `groundY + restOffsetY`. */
  restOffsetY?: number;
  /** Sous ce seuil, le relâcher est un dépôt sur place (pas de vol). */
  minThrowSpeed?: number;
  /** Plafond anti-geste-erratique (m/s). */
  maxThrowSpeed?: number;
  /** Demi-longueur du bâton (bras de levier de la vrille). */
  spinLeverArm?: number;
  /** Vrille maximale (rad/s). */
  maxSpin?: number;
  /** Taille du buffer glissant d'échantillons de drag. */
  bufferSize?: number;
  /** Points de la parabole de visée pendant le drag. */
  predictionPoints?: number;
  /** Appelé une fois à l'atterrissage (vitesse d'impact réelle). */
  onLanded?: (info: { position: Vector3; impactSpeed: number }) => void;
  /**
   * Retour automatique à la pose d'origine après l'atterrissage : le bâton
   * est toujours prêt au même endroit pour le lancer suivant. Délai en ms
   * (laisse le temps de voir où il s'est posé), `0` = immédiat, `false` =
   * désactivé (le bâton reste où il atterrit, `reset()` manuel).
   */
  returnDelayMs?: number | false;
};

export type StickThrowHandlers = {
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
  onDoubleClick: (event: ThreeEvent<MouseEvent>) => void;
};

/**
 * Lancer de bâton 3D sans moteur physique : drag sur un plan virtuel face
 * caméra (raycast du pointeur), buffer glissant de positions horodatées,
 * vélocité + axe/vitesse de tungage dérivés au relâcher, vol balistique
 * intégré dans `useFrame`, posé au sol.
 *
 * Performance : vitesse, axe, vrille, état de vol, échantillons et plan de
 * drag vivent dans des `useRef` — aucun re-render pendant le vol. Seules
 * les TRANSITIONS discrètes (`dragging`, `flying`, points de visée pendant
 * le drag) passent par `useState`. À monter dans un `<mesh>` sous `<Canvas>`.
 */
export function useStickThrow(options: StickThrowOptions = {}) {
  const {
    gravity = 9.81,
    groundY = 0,
    restOffsetY = 0.035,
    minThrowSpeed = 0.3,
    maxThrowSpeed = 14,
    spinLeverArm = 0.3,
    maxSpin = 14,
    bufferSize = 5,
    predictionPoints = 24,
    onLanded,
    returnDelayMs = 900,
  } = options;

  const camera = useThree((state) => state.camera);
  const meshRef = useRef<Mesh>(null);
  const velocityRef = useRef(new Vector3());
  const tumbleAxisRef = useRef(new Vector3(1, 0, 0));
  const spinRef = useRef(0);
  const flyingRef = useRef(false);
  const samplesRef = useRef<DragSample[]>([]);
  const dragPlaneRef = useRef<Plane | null>(null);
  const draggingRef = useRef(false);
  const spawnRef = useRef<{ position: Vector3; quaternion: Quaternion } | null>(null);
  const pendingReturnAtRef = useRef<number | null>(null);
  const landedCallbackRef = useRef(onLanded);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState(false);
  const [aimPoints, setAimPoints] = useState<[number, number, number][]>([]);


  
  const floorY = groundY + restOffsetY;

  const reset = useCallback(() => {
    const mesh = meshRef.current;
    const spawn = spawnRef.current;
    if (!mesh || !spawn) return;
    pendingReturnAtRef.current = null;
    flyingRef.current = false;
    setFlying(false);
    velocityRef.current.set(0, 0, 0);
    spinRef.current = 0;
    mesh.position.copy(spawn.position);
    mesh.quaternion.copy(spawn.quaternion);
  }, []);

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      (event.target as Element).setPointerCapture(event.pointerId);

      // Début de tour : départ toujours identique, jamais là où le lancer
      // précédent s'est posé. Exception : rattrapé en plein vol, le bâton
      // se fige sur place (tour déjà en cours).
      const catchingMidFlight = flyingRef.current;
      const positionBefore = mesh.position.clone();
      if (!catchingMidFlight) {
        reset();
      }

      // Attraper un bâton en plein vol le fige (le relâcher le relance).
      flyingRef.current = false;
      setFlying(false);
      velocityRef.current.set(0, 0, 0);
      spinRef.current = 0;

      // Plan virtuel passant par le point de saisie, face caméra : le
      // pointeur 2D pilote alors les 3 dimensions (dont la hauteur — un
      // lancer EN L'AIR, pas un glisser au sol). Si le replace vient de
      // déplacer le mesh, le plan passe par la pose d'origine : aucun saut.
      const normal = new Vector3();
      camera.getWorldDirection(normal).negate();
      const repositioned = positionBefore.distanceToSquared(mesh.position) > 1e-10;
      const planePoint = repositioned ? mesh.position.clone() : event.point.clone();
      dragPlaneRef.current = new Plane().setFromNormalAndCoplanarPoint(normal, planePoint);

      draggingRef.current = true;
      setDragging(true);
      samplesRef.current = [{ position: planePoint.clone(), timeMs: performance.now() }];
      setAimPoints([]);
      document.body.style.cursor = "grabbing";
    },
    [camera, reset],
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!draggingRef.current || !dragPlaneRef.current || !meshRef.current) return;
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const hit = new Vector3();
      if (!event.ray.intersectPlane(dragPlaneRef.current, hit)) return;

      meshRef.current.position.copy(hit);
      const samples = samplesRef.current;
      samples.push({ position: hit.clone(), timeMs: performance.now() });
      while (samples.length > bufferSize) samples.shift();

      // Estimation live pour la parabole de visée (même calcul qu'au lâcher).
      const estimate = clampSpeed(computeReleaseVelocity(samples), maxThrowSpeed);
      setAimPoints(sampleTrajectoryPoints(hit, estimate, gravity, floorY, predictionPoints));
    },
    [bufferSize, floorY, gravity, maxThrowSpeed, predictionPoints],
  );

  const endDrag = useCallback(
    (event: ThreeEvent<PointerEvent>, thrown: boolean) => {
      if (!draggingRef.current) return;
      event.stopPropagation();
      try {
        (event.target as Element).releasePointerCapture(event.pointerId);
      } catch {
        // La capture a pu être perdue (onglet, pointeur sorti) : le lâcher
        // reste valide, seule la libération échoue.
      }
      draggingRef.current = false;
      dragPlaneRef.current = null;
      setDragging(false);
      setAimPoints([]);
      document.body.style.cursor = "auto";

      if (!thrown) {
        samplesRef.current = [];
        return;
      }
      // v0 = (P_récent − P_ancien) / Δt sur le buffer, puis bascule en vol.
      const velocity = clampSpeed(computeReleaseVelocity(samplesRef.current), maxThrowSpeed);
      samplesRef.current = [];
      if (velocity.length() < minThrowSpeed) {
        velocity.set(0, 0, 0);
      }
      const { axis } = computeTumbleAxis(velocity);
      velocityRef.current.copy(velocity);
      tumbleAxisRef.current.copy(axis);
      spinRef.current = computeAngularSpeed(velocity.length(), spinLeverArm, maxSpin);
      flyingRef.current = true;
      setFlying(true);
    },
    [maxSpin, maxThrowSpeed, minThrowSpeed, spinLeverArm],
  );

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      endDrag(event, true);
    },
    [endDrag],
  );

  const handlePointerCancel = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      endDrag(event, false);
    },
    [endDrag],
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      reset();
    },
    [reset],
  );

  useEffect(() => {
    landedCallbackRef.current = onLanded;
  }, [onLanded]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh && !spawnRef.current) {
      spawnRef.current = { position: mesh.position.clone(), quaternion: mesh.quaternion.clone() };
    }
  }, []);

  

  useFrame((_, delta) => {
    if (!flyingRef.current || !meshRef.current) return;
    // Borne anti-saut d'onglet (rafale de Δt après un retour au premier plan).
    const dt = Math.min(delta, 1 / 20);
    const mesh = meshRef.current;
    integrateFlightStep(mesh.position, velocityRef.current, gravity, dt);
    applyTumble(mesh.quaternion, tumbleAxisRef.current, spinRef.current, dt);
    if (mesh.position.y <= floorY) {
      const impactSpeed = velocityRef.current.length();
      mesh.position.y = floorY;
      velocityRef.current.set(0, 0, 0);
      spinRef.current = 0;
      flyingRef.current = false;
      setFlying(false);
      landedCallbackRef.current?.({ position: mesh.position.clone(), impactSpeed });
      // Le bâton repart toujours de sa pose d'origine au lancer suivant :
      // retour programmé (laisse le temps de voir le point d'atterrissage),
      // immédiat si `returnDelayMs` vaut 0, jamais si `false`.
      if (returnDelayMs !== false) {
        if (returnDelayMs === 0) {
          reset();
        } else {
          pendingReturnAtRef.current = performance.now() + returnDelayMs;
        }
      }
    }
  });

  // Retour différé à la pose d'origine (voir atterrissage ci-dessus) : hors
  // vol et hors drag uniquement — une saisie annule l'échéance (voir
  // `handlePointerDown`, qui replace le bâton avant de viser).
  useFrame(() => {
    if (flyingRef.current || draggingRef.current || !meshRef.current) return;
    if (pendingReturnAtRef.current !== null && performance.now() >= pendingReturnAtRef.current) {
      reset();
    }
  });

  const handlers: StickThrowHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onDoubleClick: handleDoubleClick,
  };

  return { meshRef, dragging, flying, aimPoints, reset, handlers };
}
