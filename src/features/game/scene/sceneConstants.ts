
export const LANE_HALF_LENGTH = 3; // m — lane from z=-3 (fond, quilles) from z=3 (ligne de lancer)
export const LANE_HALF_WIDTH = 0.525; // m — front of lane
/** visual and collider: top at y=0. */
export const LANE_SURFACE_HALF_THICKNESS = 0.04; // m

//  used for bowling mode it doesn't have much friction for the bowl, 
export const LANE_SURFACE_RESTITUTION = 0.05;
/** Same value as Rapier's default (0.5): this constant was imported by Lane.tsx but never defined. */
export const LANE_SURFACE_FRICTION = 0.5;

// ---------------------------------------------------------------------------
// Gutter
// ---------------------------------------------------------------------------

export const GUTTER_OUTER_HALF_WIDTH = 0.745; // m — external side
export const GUTTER_BOTTOM_Y = -0.06; // m —  end of gutter
/**
 * Dimension of the gutter
 */
export const GUTTER_WALL_TILT = 0.26; // rad, ≈ 15°
export const GUTTER_WALL_HALF_THICKNESS = 0.02; // m
export const GUTTER_FLOOR_HALF_THICKNESS = 0.06; // m
export const GUTTER_FLOOR_SAFETY_MARGIN = 0.03; // m
export const GUTTER_FRICTION = 0.7;
export const GUTTER_RESTITUTION = 0.05;


export const TRIM_INNER_HALF_WIDTH = 0.485; // m
export const TRIM_TOP_Y = 0;
export const TRIM_BOTTOM_Y = -0.001;

// ---------------------------------------------------------------------------
// Pin
// ---------------------------------------------------------------------------

export const PIN_HEIGHT = 0.381; // m
export const PIN_RADIUS = 0.075; // m — rayon max of collision
export const PIN_MASS = 0.1; // kg — total mass (so it's ez mode)
export const PIN_FRICTION = 0.08;
export const PIN_RESTITUTION = 0.18;
export const PIN_LINEAR_DAMPING = 0.1;
export const PIN_ANGULAR_DAMPING = 0.1;
export const PIN_GRAVITY_SCALE = 0.4;
export const PIN_CONTACT_SKIN = 0.005;
/** Same grip for a pin lying or tilted on the lane or the sand (Rapier has no rolling resistance): m/s² while it touches the ground. */
export const PIN_ROLLING_DECEL = 0.8;
/** A pin is set down this much above the lane: it never starts in exact interpenetration with it. */
export const PIN_SPAWN_Y_OFFSET = 0.002; // m

export const PIN_LOWER_CAPSULE_RADIUS = PIN_RADIUS * 0.89; // ≈ 0.055 m
export const PIN_UPPER_CAPSULE_RADIUS = PIN_RADIUS * 0.45; // ≈ 0.028 m

const PIN_LOWER_CAPSULE_BOTTOM_Y = 0;
const PIN_LOWER_CAPSULE_TOP_Y = PIN_HEIGHT * 0.63;
const PIN_UPPER_CAPSULE_TOP_Y = PIN_HEIGHT * 0.985; // sous la pointe, jamais au-dessus

export const PIN_LOWER_CAPSULE_HALF_HEIGHT =
  (PIN_LOWER_CAPSULE_TOP_Y - PIN_LOWER_CAPSULE_BOTTOM_Y) / 2 - PIN_LOWER_CAPSULE_RADIUS;
export const PIN_LOWER_CAPSULE_CENTER_Y = (PIN_LOWER_CAPSULE_TOP_Y + PIN_LOWER_CAPSULE_BOTTOM_Y) / 2;

export const PIN_UPPER_CAPSULE_HALF_HEIGHT =
  (PIN_UPPER_CAPSULE_TOP_Y - PIN_LOWER_CAPSULE_TOP_Y) / 2 - PIN_UPPER_CAPSULE_RADIUS;
export const PIN_UPPER_CAPSULE_CENTER_Y = (PIN_UPPER_CAPSULE_TOP_Y + PIN_LOWER_CAPSULE_TOP_Y) / 2;

function capsuleVolume(radius: number, halfHeight: number): number {
  const cylinder = Math.PI * radius * radius * (2 * halfHeight);
  const hemispheres = ((4 / 3) * Math.PI) * radius ** 3;
  return cylinder + hemispheres;
}

const lowerCapsuleVolume = capsuleVolume(PIN_LOWER_CAPSULE_RADIUS, PIN_LOWER_CAPSULE_HALF_HEIGHT);
const upperCapsuleVolume = capsuleVolume(PIN_UPPER_CAPSULE_RADIUS, PIN_UPPER_CAPSULE_HALF_HEIGHT);
const totalCapsuleVolume = lowerCapsuleVolume + upperCapsuleVolume;

// Mass of each capsule, proportional to its actual volume (uniform density).
export const PIN_LOWER_CAPSULE_MASS = PIN_MASS * (lowerCapsuleVolume / totalCapsuleVolume);
export const PIN_UPPER_CAPSULE_MASS = PIN_MASS - PIN_LOWER_CAPSULE_MASS;

// ---------------------------------------------------------------------------
// Pin position 
// ---------------------------------------------------------------------------

// 15 pins placed in a triangle
export const PIN_ROW_SIZES = [1, 2, 3, 4, 5];
/** Distance entre rangées (axe Z, vers le joueur). */
export const PIN_ROW_SPACING = 0.24; // m
export const PIN_LATERAL_GAP = 0.056; // m
export const PIN_LATERAL_SPACING = PIN_RADIUS * 2 + PIN_LATERAL_GAP;
/** Z position from the player of the first pin */
export const PIN_TIP_ROW_Z = -1.6; // m

// ---------------------------------------------------------------------------
// Background cave
// ---------------------------------------------------------------------------

export const CAVE_ROTATION_Y = Math.PI / 2;
export const CAVE_POSITION: [number, number, number] = [0.18, -1.48, -LANE_HALF_LENGTH - 4.22];

// ---------------------------------------------------------------------------
// Bowl
// ---------------------------------------------------------------------------

export const BALL_RADIUS = 0.108; // m

// Position of the bow at start
export const BALL_REST_POSITION: [number, number, number] = [0, BALL_RADIUS, LANE_HALF_LENGTH - 0.4];


// ---------------------------------------------------------------------------
// ThrowStick
// ---------------------------------------------------------------------------

// Height of the stick at start
export const STICK_REST_HEIGHT = 0.6; // m

// Length of the stick
export const STICK_LENGTH = 0.6; // m
// Radius of the stick.
export const STICK_RADIUS = 0.035; // m
// Half-length of the capsule's cylindrical part (Rapier capsule: total = 2·halfHeight + 2·radius)
export const STICK_HALF_HEIGHT = STICK_LENGTH / 2 - STICK_RADIUS;

// ---------------------------------------------------------------------------
// Physics of the stick (dynamic, see stickAerodynamics.ts)
// ---------------------------------------------------------------------------

// Total mass (rod + tip). Pins weigh PIN_MASS = 0.1 kg: the stick must be able to knock them down.
export const STICK_MASS = 0.3; // kg
//  a point mass at +X (local) that shifts the center of mass toward the tip
// The aerodynamic center of pressure stays at the geometric center, so it sits
// BEHIND the center of mass: that lever arm is what aligns the stick with its trajectory.
export const STICK_TIP_MASS = 0.03; // kg
export const STICK_TIP_OFFSET = STICK_LENGTH / 2 - 0.02; // m, along local +X
export const STICK_ROD_MASS = STICK_MASS - STICK_TIP_MASS; // kg
// Local axis of the stick, oriented rod → tip (the capsule collider lies along X).
export const STICK_TIP_AXIS: [number, number, number] = [1, 0, 0];

// High friction: an end that hits the lane stops, the rest of the stick tumbles over it. 
export const STICK_FRICTION = 0.8;
export const STICK_RESTITUTION = 0;
// Low angular damping for the stick's tumble. Air resistance is anisotropic (no native linearDamping).
export const STICK_ANGULAR_DAMPING = 0.1;
// Rolling resistance of the stick on the lane.
export const STICK_GROUND_ANGULAR_DAMPING = 4;
export const STICK_LINEAR_DAMPING = 0;
// Rolling deceleration of the stick on the lane.
export const STICK_ROLLING_DECEL = 0.8;

// Threshold speed below which the stick is considered to have settled on the lane.
export const STICK_SETTLE_SPEED = 0.08;

// Axial spin (rad/s) given by the "hand release snap" at the maximum throw speed.
export const STICK_SNAP_SPIN = 4;

// Center of pressure behind the geometric center (opposite to the tip): weathervane lever arm.
export const STICK_CP_AFT_OFFSET = 0.06; // m
// Aerodynamic damping of transverse rotations.   τ = −c·|v|·ω⊥ (N·m·s²/m).
export const STICK_ROTATIONAL_DAMPING = 0.0008;

// Effective air density (kg/m³) and drag coefficient of a cylinder.
export const STICK_AIR_DENSITY = 1.2;
export const STICK_DRAG_COEFFICIENT = 1.0;
// Cross sections: head-on (π·r²) and broadside (diameter × length).
export const STICK_TIP_AREA = Math.PI * STICK_RADIUS * STICK_RADIUS; // m²
export const STICK_SIDE_AREA = 2 * STICK_RADIUS * STICK_LENGTH; // m²

// ---------------------------------------------------------------------------
// Sand
// ---------------------------------------------------------------------------

// Top of the beach plateau (the mesh varies between −0.09 and −0.11): below the lane (0) and the gutter floor (−0.06).
export const SAND_SURFACE_Y = -0.1; // m
// The plateau of beach.glb: ±9 m along X, ±8 m along Z; beyond that the mesh drops away.
export const BEACH_HALF_WIDTH = 9; // m
export const BEACH_HALF_LENGTH = 8; // m
export const SAND_FRICTION = 1;
export const SAND_RESTITUTION = 0;

// Stick planting: the axis must be at least this steep (|axis.y| = sin of the angle to the horizontal, 0.5 ≈ 30°)...
export const SAND_PLANT_MIN_TILT = 0.5;
// ...and the impact must be at least this fast, vertically (m/s). Otherwise the stick just stops, lying. 
export const SAND_PLANT_MIN_SPEED = 1;
// Depth of the lowest point per m/s of impact speed (m), and the most stick that can go in, along its axis (m).
export const SAND_PLANT_DEPTH_PER_SPEED = 0.04;
export const SAND_PLANT_MAX_EMBEDDED_LENGTH = 0.25;
// Contact is anticipated one step ahead and detected within this skin (m).
export const SAND_CONTACT_SKIN = 0.005;

// A pin whose center is this far beyond the lane (gutter included) rests on the sand: it is out of play.
export const PIN_OFF_LANE_MARGIN = 0.02; // m
