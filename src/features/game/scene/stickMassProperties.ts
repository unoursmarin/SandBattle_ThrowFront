import { STICK_LENGTH, STICK_RADIUS, STICK_ROD_MASS, STICK_TIP_MASS, STICK_TIP_OFFSET } from "./sceneConstants";

// I had errors when trying to use Rapier's setAdditionalMassProperties for the stick, so we calculate inertia by hand.

export type StickMassInput = {
  /** Uniform rod alone, kg. */   
  rodMass: number;
  /** Point mass at the tip, kg (0 = homogeneous stick). */
  tipMass: number;
  /** Tip position from the geometric center, along the axis, m. */
  tipOffset: number;
  length: number;
  radius: number;
};

export type StickMassProperties = {
  mass: number;
  /** Center of mass from the geometric center, along the axis (toward the tip when > 0), m. */
  comX: number;
  /** About the long axis (thin rod: ½·m·r²), kg·m². */
  axialInertia: number;
  /** About any transverse axis through the center of mass, kg·m². */
  transverseInertia: number;
};

export function computeStickMassProperties({
  rodMass,
  tipMass,
  tipOffset,
  length,
  radius,
}: StickMassInput): StickMassProperties {
  const mass = rodMass + tipMass;
  const comX = (tipMass * tipOffset) / mass;
  const rodTransverse = rodMass * (length * length / 12 + (radius * radius) / 4);
  return {
    mass,
    comX,
    axialInertia: 0.5 * rodMass * radius * radius,
    // Parallel-axis theorem: rod and tip are both offset from the combined center of mass.
    transverseInertia: rodTransverse + rodMass * comX * comX + tipMass * (tipOffset - comX) ** 2,
  };
}

export const STICK_MASS_PROPERTIES = computeStickMassProperties({
  rodMass: STICK_ROD_MASS,
  tipMass: STICK_TIP_MASS,
  tipOffset: STICK_TIP_OFFSET,
  length: STICK_LENGTH,
  radius: STICK_RADIUS,
});
