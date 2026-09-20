import type { RigidBody, World } from "@dimforge/rapier3d-compat";

// Wheter the body touches the ground right now 
export function isOnGround(world: World, body: RigidBody): boolean {
  let grounded = false;
  for (let i = 0; i < body.numColliders() && !grounded; i++) {
    const collider = body.collider(i);
    world.contactPairsWith(collider, (other) => {
      if (grounded || !other.parent()?.isFixed()) return;
      world.contactPair(collider, other, (manifold) => {
        if (manifold.numContacts() > 0) grounded = true;
      });
    });
  }
  return grounded;
}
