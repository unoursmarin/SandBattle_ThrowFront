import { memo } from "react";
import { CoefficientCombineRule, CuboidCollider, RigidBody } from "@react-three/rapier";

import {
  BEACH_HALF_LENGTH,
  BEACH_HALF_WIDTH,
  SAND_FRICTION,
  SAND_RESTITUTION,
  SAND_SURFACE_Y,
} from "./sceneConstants";

// Thickness of the sand  (so nothing goes through)
const SAND_HALF_THICKNESS = 0.5; // m

// Floor of the beach, flat  with +/- 1cm below the gutters
export const Sand = memo(function Sand() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[BEACH_HALF_WIDTH, SAND_HALF_THICKNESS, BEACH_HALF_LENGTH]}
        position={[0, SAND_SURFACE_Y - SAND_HALF_THICKNESS, 0]}
        friction={SAND_FRICTION}
        frictionCombineRule={CoefficientCombineRule.Max}
        restitution={SAND_RESTITUTION}
        restitutionCombineRule={CoefficientCombineRule.Min}
      />
    </RigidBody>
  );
});
