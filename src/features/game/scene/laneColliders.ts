import {
  GUTTER_BOTTOM_Y,
  GUTTER_FLOOR_HALF_THICKNESS,
  GUTTER_FLOOR_SAFETY_MARGIN,
  GUTTER_OUTER_HALF_WIDTH,
  GUTTER_WALL_HALF_THICKNESS,
  GUTTER_WALL_TILT,
  LANE_HALF_LENGTH,
  LANE_HALF_WIDTH,
} from "./sceneConstants";
import type { LaneLayout } from "./laneSizes";

export type BoxColliderSpec = {
  key: string;
  args: [halfWidth: number, halfHeight: number, halfDepth: number];
  position: [number, number, number];
  rotation: [number, number, number];
};


export function buildGutterColliderSpecs(side: 1 | -1, layout?: LaneLayout): BoxColliderSpec[] {
  const laneHalfLength = layout?.laneHalfLength ?? LANE_HALF_LENGTH;
  const laneHalfWidth = layout?.laneHalfWidth ?? LANE_HALF_WIDTH;
  const gutterOuterHalfWidth = layout?.gutterOuterHalfWidth ?? GUTTER_OUTER_HALF_WIDTH;
  const channelDepth = -GUTTER_BOTTOM_Y; // profondeur du chenal (positive)
  const innerX = side * laneHalfWidth; // bord côté piste
  const outerX = side * gutterOuterHalfWidth; // bord extérieur

  const wallHalfHeight = channelDepth / (2 * Math.cos(GUTTER_WALL_TILT));
  const lateralShift = (channelDepth * Math.tan(GUTTER_WALL_TILT)) / 2;
  const wallCenterY = GUTTER_BOTTOM_Y / 2;

  // Marge de sécurité de chaque côté (voir GUTTER_FLOOR_SAFETY_MARGIN) : le
  // fond déborde largement sous les deux parois plutôt que de s'arrêter
  // pile à leur aplomb, pour qu'une bille rapide qui traverserait une paroi
  // sans y être détectée retombe quand même dans l'emprise du fond.
  const floorHalfWidth = (gutterOuterHalfWidth - laneHalfWidth) / 2 + GUTTER_FLOOR_SAFETY_MARGIN;
  const floorCenterX = (side * (laneHalfWidth + gutterOuterHalfWidth)) / 2;

  return [
    {
      // Fond du chenal. Position décalée vers le bas de sa propre
      // demi-épaisseur : le DESSUS du collider reste ainsi toujours exactement
      // à GUTTER_BOTTOM_Y quelle que soit GUTTER_FLOOR_HALF_THICKNESS (le
      // collider s'épaissit vers le bas, jamais vers le haut) — épaissir ce
      // collider (voir sceneConstants.ts) ne doit jamais changer la hauteur
      // de repos de la boule dans la gouttière.
      key: `floor-${side}`,
      args: [floorHalfWidth, GUTTER_FLOOR_HALF_THICKNESS, laneHalfLength],
      position: [floorCenterX, GUTTER_BOTTOM_Y - GUTTER_FLOOR_HALF_THICKNESS, 0],
      rotation: [0, 0, 0],
    },
    {
      // Paroi intérieure (côté piste) : la base reste à l'aplomb du bord de
      // piste (innerX, raccord avec le fond), le haut s'écarte vers la piste
      // — bouche évasée, plus large en haut qu'au fond.
      key: `inner-wall-${side}`,
      args: [GUTTER_WALL_HALF_THICKNESS, wallHalfHeight, laneHalfLength],
      position: [innerX - side * lateralShift, wallCenterY, 0],
      rotation: [0, 0, side * GUTTER_WALL_TILT],
    },
    {
      // Paroi extérieure : même principe, le haut s'écarte vers l'extérieur
      // — les deux parois s'évasent en miroir, profil en U plus large en
      // haut qu'au fond (jamais l'inverse, qui bloquerait l'entrée de la
      // boule dans le chenal).
      key: `outer-wall-${side}`,
      args: [GUTTER_WALL_HALF_THICKNESS, wallHalfHeight, laneHalfLength],
      position: [outerX + side * lateralShift, wallCenterY, 0],
      rotation: [0, 0, -side * GUTTER_WALL_TILT],
    },
  ];
}
