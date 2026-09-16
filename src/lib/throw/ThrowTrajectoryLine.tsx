import { Line } from "@react-three/drei";

export type TrajectoryLinePoints = [number, number, number][];

// Preview of the throw trajectory during the drag.
export function ThrowTrajectoryLine({ points }: { points: TrajectoryLinePoints }) {
  if (points.length < 2) return null;
  return <Line points={points} color="#c99a3e" lineWidth={2} transparent opacity={0.9} />;
}
