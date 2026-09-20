//This adds the grip the ground gives: a steady deceleration while the  body touches it (the caller decides when), which reaches exactly zero and never reverses the motion.
// A subset of a Rapier rigid body used here.
export type RollingBody = {
  linvel(): { x: number; y: number; z: number };
  angvel(): { x: number; y: number; z: number };
  setLinvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setAngvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
};

// A body falling or bouncing faster than this is not resting on the ground yet: no grip.
export const ROLLING_MAX_VERTICAL_SPEED = 0.3; // m/s

// One step of grip: the horizontal speed drops by `decel·dt`, and the spin by `decel/radius·dt`
// (the same ratio as a body rolling without slipping, so the contact does not fight it).
export function applyRollingResistance(body: RollingBody, decel: number, radius: number, dt: number): void {
  const v = body.linvel();
  const horizontal = Math.hypot(v.x, v.z);
  if (horizontal > 0) {
    const k = Math.max(0, horizontal - decel * dt) / horizontal;
    body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, false);
  }
  const w = body.angvel();
  const spin = Math.hypot(w.x, w.y, w.z);
  if (spin > 0) {
    const k = Math.max(0, spin - (decel / radius) * dt) / spin;
    body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, false);
  }
}
