import { useMemo } from "react";
import { Sky, useGLTF } from "@react-three/drei";

import { CAVE_ROTATION_Y } from "./sceneConstants";

const BEACH_MODEL_URL = "/models/beach.glb";
const CAVE_MODEL_URL = "/models/cave_in_lancieux.glb";
useGLTF.preload(BEACH_MODEL_URL);
useGLTF.preload(CAVE_MODEL_URL);

// Above the beach 
const BEACH_SURFACE_Y = -0.093;

type FoliageProp = {
  url: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
};

/**
  Gets objects and place them as props for the foliage instances.
 */
const FOLIAGE_PROPS: FoliageProp[] = [

  { url: "/models/palm_trees.glb", position: [-8.5, BEACH_SURFACE_Y, 0], rotationY: Math.PI / 2, scale: 1 },
  { url: "/models/realistic_hd_cabbage_tree_1850.glb", position: [-7, BEACH_SURFACE_Y, -5.5], rotationY: 1.1, scale: 1 },
  { url: "/models/realistic_hd_cabbage_tree_950.glb", position: [7, BEACH_SURFACE_Y, -6], rotationY: 4.2, scale: 1 },
  { url: "/models/jungle_tree.glb", position: [-6, BEACH_SURFACE_Y, -0.5], rotationY: 0.8, scale: 0.13 },
  { url: "/models/tropical_palm_tree.glb", position: [3.4, BEACH_SURFACE_Y, 2.4], rotationY: 2.1, scale: 0.0013 },
  { url: "/models/tropical_palm_tree.glb", position: [-3.6, BEACH_SURFACE_Y, -1.2], rotationY: 5, scale: 0.0013 },
  { url: "/models/banana_tree.glb", position: [-3.2, BEACH_SURFACE_Y, 2.6], rotationY: 3.3, scale: 0.18 },
  { url: "/models/banana_tree.glb", position: [3.4, BEACH_SURFACE_Y, -2.4], rotationY: 1.7, scale: 0.16 },
  { url: "/models/monstera_tree.glb", position: [-2.8, BEACH_SURFACE_Y, 0.4], rotationY: 0.2, scale: 0.001 },
  { url: "/models/tropical_plant_2.glb", position: [2.8, BEACH_SURFACE_Y, 1.2], rotationY: 2.5, scale: 0.0018 },
  { url: "/models/rock.glb", position: [-2.6, BEACH_SURFACE_Y, -2.4], rotationY: 1, scale: 0.12 },
  { url: "/models/rock.glb", position: [2.7, BEACH_SURFACE_Y, 2.9], rotationY: 4.4, scale: 0.11 },
  { url: "/models/big_rock_1b.glb", position: [3.6, BEACH_SURFACE_Y, -3.2], rotationY: 2.2, scale: 55 },
];
for (const { url } of FOLIAGE_PROPS) useGLTF.preload(url);

function FoliageInstance({ url, position, rotationY, scale }: FoliageProp) {
  const { scene } = useGLTF(url);
  const instance = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={instance} position={position} rotation={[0, rotationY, 0]} scale={scale} />;
}

/**
 * Layout objects for the scene (beach, cave, foliage).
 */
export function Decor({ cavePosition }: { cavePosition: [number, number, number] }) {
  const { scene: beachScene } = useGLTF(BEACH_MODEL_URL);
  const { scene: caveScene } = useGLTF(CAVE_MODEL_URL);

  return (
    <group>
      <Sky sunPosition={[80, 35, 40]} turbidity={2} rayleigh={0.7} mieCoefficient={0.01} mieDirectionalG={0.85} />
      <primitive object={beachScene} />
      <group position={cavePosition} rotation={[0, CAVE_ROTATION_Y, 0]}>
        <primitive object={caveScene} />
      </group>
      {FOLIAGE_PROPS.map((prop, index) => (
        <FoliageInstance key={`${prop.url}-${index}`} {...prop} />
      ))}
    </group>
  );
}
