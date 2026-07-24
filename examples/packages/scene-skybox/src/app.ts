import {
  createOrbitCameraController,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createSceneNode } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createCamera3D,
  createCubeTexture,
  createEnvironment,
  createMesh,
  createPerspectiveProjection,
  createStandardPbrMaterial,
  createSurface,
  createTorusMeshGeometry,
  createVector3,
  invalidateNodeLocalTransform,
  SceneNodeKind,
  setCubeTextureFace,
  setQuaternionFromEuler,
} from '@flighthq/sdk';

import { render, scale } from './render';

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

const facePalettes: readonly (readonly [number, number, number])[] = [
  [54, 168, 196],
  [82, 64, 160],
  [66, 105, 178],
  [12, 18, 38],
  [38, 88, 154],
  [142, 54, 138],
];

function createSkyFace(face: number): Surface {
  const surface = createSurface(128, 128);
  const [baseR, baseG, baseB] = facePalettes[face];
  for (let y = 0; y < surface.height; y++) {
    const heightMix = y / (surface.height - 1);
    for (let x = 0; x < surface.width; x++) {
      const offset = (y * surface.width + x) * 4;
      const horizonGlow = Math.max(0, 1 - Math.abs(heightMix - 0.58) * 5);
      const aurora = Math.max(0, Math.sin(x * 0.11 + face * 1.7) * Math.sin(y * 0.045 + face));
      const star = (x * 31 + y * 17 + face * 47) % 997 < 3 && y < 76;
      surface.data[offset] = star ? 245 : Math.min(255, baseR * (0.45 + heightMix * 0.55) + horizonGlow * 58);
      surface.data[offset + 1] = star
        ? 250
        : Math.min(255, baseG * (0.42 + heightMix * 0.58) + horizonGlow * 42 + aurora * 44);
      surface.data[offset + 2] = star
        ? 255
        : Math.min(255, baseB * (0.5 + heightMix * 0.5) + horizonGlow * 32 + aurora * 26);
      surface.data[offset + 3] = 255;
    }
  }
  return surface;
}

const cubeTexture = createCubeTexture();
for (let face = 0; face < 6; face++) {
  setCubeTextureFace(cubeTexture, face, createSkyFace(face));
}
const environment = createEnvironment({ environment: cubeTexture, intensity: 1.05 });

const scene = createSceneNode(SceneNodeKind);
const reflectiveMaterial = createStandardPbrMaterial({
  baseColor: 0xd8e8ffff,
  metallic: 1,
  roughness: 0.08,
});
reflectiveMaterial.doubleSided = true;
const torus = createMesh(createTorusMeshGeometry(1.25, 0.42, 40, 72), [reflectiveMaterial]);
setQuaternionFromEuler(torus.rotation, Math.PI * 0.24, 0, 0);
invalidateNodeLocalTransform(torus);
addNodeChild(scene, torus);

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 2.8 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0.18,
  distance: 5.2,
  polar: 0.12,
  smoothTime: 0.12,
  target: createVector3(0, 0, 0),
});
const lights: SceneLightsLike = { ambient: null, directional: null };

let previousTime = performance.now();
let torusAngle = 0;

function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  rotateOrbitCameraController(cameraController, deltaTime * 0.08, Math.sin(now * 0.0002) * deltaTime * 0.01);
  updateOrbitCameraController(cameraController, camera, deltaTime);

  torusAngle += deltaTime * 0.26;
  setQuaternionFromEuler(torus.rotation, Math.PI * 0.24, torusAngle, torusAngle * 0.35);
  invalidateNodeLocalTransform(torus);

  render(scene, camera, lights, environment);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
