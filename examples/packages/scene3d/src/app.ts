import { createSceneNode } from '@flighthq/scene';
import type { Camera3D, SceneLights } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createConeMeshGeometry,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  normalizeVector3,
  setCamera3DViewMatrix4FromLookAt,
  invalidateNodeLocalTransform,
  SceneNodeKind,
} from '@flighthq/sdk';

import { render, scale } from './render';

// The scene root is a bare SceneNode (createScene now allocates a Scene *document* that owns a root);
// createSceneNode is imported from @flighthq/scene directly to sidestep the @flighthq/sdk barrel.

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

// Three procedural mesh primitives arranged side by side.
const boxGeometry = createBoxMeshGeometry(1, 1, 1);
const sphereGeometry = createSphereMeshGeometry(0.5, 48, 32);
const coneGeometry = createConeMeshGeometry(0.5, 1, 32);

// Each mesh has a distinct StandardPbr material: warm red dielectric, gray metallic, cool blue dielectric.
const redMaterial = createStandardPbrMaterial({
  baseColor: 0xcc3333ff,
  metallic: 0,
  roughness: 0.4,
});

const grayMetallicMaterial = createStandardPbrMaterial({
  baseColor: 0xaaaaaaff,
  metallic: 1,
  roughness: 0.3,
});

const blueMaterial = createStandardPbrMaterial({
  baseColor: 0x3366ccff,
  metallic: 0,
  roughness: 0.5,
});

const scene = createSceneNode(SceneNodeKind);

const boxMesh = createMesh(boxGeometry, [redMaterial]);
// A node's transform is authored via its `position`/`rotation`/`scale` fields; invalidate after editing.
boxMesh.position.x = -2;
invalidateNodeLocalTransform(boxMesh);
addNodeChild(scene, boxMesh);

// sphereMesh stays at the origin — a fresh node's position defaults to (0, 0, 0).
const sphereMesh = createMesh(sphereGeometry, [grayMetallicMaterial]);
addNodeChild(scene, sphereMesh);

const coneMesh = createMesh(coneGeometry, [blueMaterial]);
coneMesh.position.x = 2;
invalidateNodeLocalTransform(coneMesh);
addNodeChild(scene, coneMesh);

// Perspective camera viewing the scene from a 3/4 angle.
const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(4, 3, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

// White directional light from the upper right plus a dim ambient fill.
const directionalDirection = createVector3(-1, -0.5, -0.7);
normalizeVector3(directionalDirection, directionalDirection);
const lights: SceneLights = {
  ambient: createAmbientLight({ color: 0x607090ff, intensity: 0.2 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
};

render(scene, camera, lights);
