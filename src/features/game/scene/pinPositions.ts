import { PIN_LATERAL_SPACING, PIN_ROW_SIZES, PIN_ROW_SPACING, PIN_TIP_ROW_Z } from "./sceneConstants";
import { getLaneLayout, type LaneLayout, type LaneSize } from "./laneSizes";

//Calculate positon of the rack, 15 pin in triangle , 5 rows 
 
export function buildPinPositions(layout?: LaneLayout): [number, number, number][] {
  const rowSizes = layout?.pinRowSizes ?? PIN_ROW_SIZES;
  const tipRowZ = layout?.pinTipRowZ ?? PIN_TIP_ROW_Z;
  const rowSpacing = layout?.pinRowSpacing ?? PIN_ROW_SPACING;
  const lateralSpacing = layout?.pinLateralSpacing ?? PIN_LATERAL_SPACING;
  return rowSizes.flatMap((count, rowIndex) => {
    const z = tipRowZ - rowIndex * rowSpacing;
    const rowWidth = (count - 1) * lateralSpacing;
    return Array.from({ length: count }, (_, i): [number, number, number] => [
      -rowWidth / 2 + i * lateralSpacing,
      0,
      z,
    ]);
  });
}

export const PIN_POSITIONS: [number, number, number][] = buildPinPositions();

// Rshortcut of a rack positoon. 
export function pinPositionsForSize(size: LaneSize): [number, number, number][] {
  return buildPinPositions(getLaneLayout(size));
}
