import { useGLTF } from "@react-three/drei";
import { CoefficientCombineRule, CuboidCollider, RigidBody } from "@react-three/rapier";
import { buildGutterColliderSpecs } from "./laneColliders";
import { LANE_LAYOUTS, type LaneLayout } from "./laneSizes";
import {
  GUTTER_FRICTION,
  GUTTER_RESTITUTION,
  LANE_SURFACE_FRICTION,
  LANE_SURFACE_HALF_THICKNESS,
  LANE_SURFACE_RESTITUTION,
} from "./sceneConstants";

for (const { laneModelUrl } of Object.values(LANE_LAYOUTS)) useGLTF.preload(laneModelUrl);

const GUTTER_SIDES: (1 | -1)[] = [1, -1];

//Colliders  
function LanePhysicsColliders({ layout }: { layout: LaneLayout }) {
  return (
    <>
      <CuboidCollider
        args={[layout.laneHalfWidth, LANE_SURFACE_HALF_THICKNESS, layout.laneHalfLength]}
        position={[0, -LANE_SURFACE_HALF_THICKNESS, 0]}
        friction={LANE_SURFACE_FRICTION}
        restitution={LANE_SURFACE_RESTITUTION}
        frictionCombineRule={CoefficientCombineRule.Min}
      />
      {GUTTER_SIDES.flatMap((side) =>
        buildGutterColliderSpecs(side, layout).map(({ key, args, position, rotation }) => (
          <CuboidCollider
            key={key}
            args={args}
            position={position}
            rotation={rotation}
            friction={GUTTER_FRICTION}
            restitution={GUTTER_RESTITUTION}
            frictionCombineRule={CoefficientCombineRule.Max}
          />
        )),
      )}
    </>
  );
}

export function Lane({ layout }: { layout: LaneLayout }) {
  const { scene } = useGLTF(layout.laneModelUrl);
  return (
    <RigidBody type="fixed" colliders={false}>
      <primitive object={scene} />
      <LanePhysicsColliders layout={layout} />
    </RigidBody>
  );
}
