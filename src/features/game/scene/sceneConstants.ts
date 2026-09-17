
export const LANE_HALF_LENGTH = 3; // m — lane from z=-3 (fond, quilles) from z=3 (ligne de lancer)
export const LANE_HALF_WIDTH = 0.525; // m — front of lane
/** visual and collider: top at y=0. */
export const LANE_SURFACE_HALF_THICKNESS = 0.04; // m

//  used for bowling mode it doesn't have much friction for the bowl, 
export const LANE_SURFACE_RESTITUTION = 0.05;

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

/** Masse de chaque capsule, au prorata de son volume réel (densité uniforme). */
export const PIN_LOWER_CAPSULE_MASS = PIN_MASS * (lowerCapsuleVolume / totalCapsuleVolume);
export const PIN_UPPER_CAPSULE_MASS = PIN_MASS - PIN_LOWER_CAPSULE_MASS;

// ---------------------------------------------------------------------------
// Pin position (voir pinPositions.ts)
// ---------------------------------------------------------------------------

/**
 * 15 pin placed in triangle
 */
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

/** Position of the bow at start */
export const BALL_REST_POSITION: [number, number, number] = [0, BALL_RADIUS, LANE_HALF_LENGTH - 0.4];


// ---------------------------------------------------------------------------
// Bâton de lancer (voir ThrowingStick.tsx, throwing_stick.glb)
// ---------------------------------------------------------------------------

/**
 *  height of the stick at start
 */
export const STICK_REST_HEIGHT = 0.6; // m

/** Length of the stick */
export const STICK_LENGTH = 0.6; // m
/** radius o the stick. */
export const STICK_RADIUS = 0.035; // m
/**
 * center of the stick
 */
export const STICK_HALF_HEIGHT = STICK_LENGTH / 2 - STICK_RADIUS;
