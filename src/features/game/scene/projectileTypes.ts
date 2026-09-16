/**
 * Object to throw
 */
export const PROJECTILE_TYPES = ["ball", "stick"] as const;
export type ProjectileType = (typeof PROJECTILE_TYPES)[number];

export function isProjectileType(value: unknown): value is ProjectileType {
  return value === "ball" || value === "stick";
}
