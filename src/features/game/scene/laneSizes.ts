import { BALL_RADIUS, PIN_ROW_SIZES, STICK_REST_HEIGHT } from "./sceneConstants.ts";

export const LANE_SIZES = ["small", "medium", "large"] as const;
export type LaneSize = (typeof LANE_SIZES)[number];

export function isLaneSize(value: unknown): value is LaneSize {
  return value === "small" || value === "medium" || value === "large";
}

export type LaneLayout = {
  laneHalfLength: number;
  laneHalfWidth: number;
  // Derived from laneHalfWidth (gutter channel width, see GUTTER_CHANNEL).
  gutterOuterHalfWidth: number;
  // Derived from laneHalfWidth (listel affleurant, see TRIM_INSET).
  trimInnerHalfWidth: number;
  pinTipRowZ: number;
  pinRowSpacing: number;
  pinLateralSpacing: number;
  pinRowSizes: readonly number[];
  ballRest: [number, number, number];
  stickRest: [number, number, number];
  cavePosition: [number, number, number];
  cameraPosition: [number, number, number];
  laneModelUrl: string;
};

/** Width of the gutter channel (0.745-0.525, see sceneConstants.ts): constant regardless of lane size. */
const GUTTER_CHANNEL = 0.22; // m
/** Inset of the trim towards the inside (0.525-0.485): also constant. */
const TRIM_INSET = 0.04; // m
const CAVE_X = 0.18;
const CAVE_Y = -1.48;
const CAVE_BACK_MARGIN = 4.22; // m derrière le bout de piste, côté quilles

function buildLayout(params: {
  laneHalfLength: number;
  laneHalfWidth: number;
  pinTipRowZ: number;
  pinRowSpacing: number;
  pinLateralSpacing: number;
  cameraPosition: [number, number, number];
  laneModelUrl: string;
}): LaneLayout {
  const { laneHalfLength, laneHalfWidth } = params;
  return {
    laneHalfLength,
    laneHalfWidth,
    gutterOuterHalfWidth: laneHalfWidth + GUTTER_CHANNEL,
    trimInnerHalfWidth: laneHalfWidth - TRIM_INSET,
    pinTipRowZ: params.pinTipRowZ,
    pinRowSpacing: params.pinRowSpacing,
    pinLateralSpacing: params.pinLateralSpacing,
    pinRowSizes: PIN_ROW_SIZES,
    ballRest: [0, BALL_RADIUS, laneHalfLength - 0.4],
    stickRest: [0, STICK_REST_HEIGHT, laneHalfLength - 0.4],
    cavePosition: [CAVE_X, CAVE_Y, -laneHalfLength - CAVE_BACK_MARGIN],
    cameraPosition: params.cameraPosition,
    laneModelUrl: params.laneModelUrl,
  };
}

export const LANE_LAYOUTS: Record<LaneSize, LaneLayout> = {
  small: buildLayout({
    laneHalfLength: 3,
    laneHalfWidth: 0.525,
    pinTipRowZ: -1.6,
    pinRowSpacing: 0.24,
    pinLateralSpacing: 0.206,
    cameraPosition: [0, 2.6, 5.4],
    laneModelUrl: "/models/bowling_lane_small.glb",
  }),
  medium: buildLayout({
    laneHalfLength: 4.5,
    laneHalfWidth: 0.8,
    pinTipRowZ: -2.6,
    pinRowSpacing: 0.3,
    pinLateralSpacing: 0.26,
    cameraPosition: [0, 3.2, 7.4],
    laneModelUrl: "/models/bowling_lane_medium.glb",
  }),
  large: buildLayout({
    laneHalfLength: 6,
    laneHalfWidth: 1.05,
    pinTipRowZ: -3.8,
    pinRowSpacing: 0.36,
    pinLateralSpacing: 0.32,
    cameraPosition: [0, 3.8, 9.5],
    laneModelUrl: "/models/bowling_lane_large.glb",
  }),
};

/** Never throw an exception on a corrupted value: the small lane is the default. */
export function getLaneLayout(size: unknown): LaneLayout {
  return LANE_LAYOUTS[isLaneSize(size) ? size : "small"];
}
