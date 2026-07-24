import {
  createOrbitCameraController,
  orbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createSceneNode } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createCamera3D,
  createCubeTexture,
  createEnvironment,
  createMesh,
  createPerspectiveProjection,
  createPointLight,
  createSampler,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createSurface,
  createTexture,
  createVector3,
  invalidateNodeLocalTransform,
  SceneNodeKind,
  setCubeTextureFace,
  setQuaternionFromEuler,
} from '@flighthq/sdk';

import { render, scale } from './render';

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

function createEarthSurface(): Surface {
  const surface = createSurface(512, 256);
  for (let y = 0; y < surface.height; y++) {
    const latitude = Math.abs(y / (surface.height - 1) - 0.5) * 2;
    for (let x = 0; x < surface.width; x++) {
      const offset = (y * surface.width + x) * 4;
      const continent =
        Math.sin(x * 0.041 + Math.sin(y * 0.071) * 2.4) +
        Math.sin(x * 0.018 - y * 0.054) +
        Math.cos(y * 0.083 + x * 0.009);
      const coastNoise = Math.sin(x * 0.17) * Math.cos(y * 0.13) * 0.32;
      const isIce = latitude > 0.87 + Math.sin(x * 0.05) * 0.035;
      const isLand = continent + coastNoise > 0.58 && latitude < 0.9;
      const elevation = Math.max(0, continent - 0.58);

      if (isIce) {
        writePixel(surface, offset, 220, 237, 242, 255);
      } else if (isLand) {
        writePixel(surface, offset, 58 + elevation * 60, 128 + elevation * 74, 48 + elevation * 32, 255);
      } else {
        const depth = 24 + (Math.sin(x * 0.025) + 1) * 12;
        writePixel(surface, offset, 10, 54 + depth, 108 + depth * 2.15, 255);
      }
    }
  }
  copySurfaceLongitudeSeam(surface);
  return surface;
}

function createCloudSurface(): Surface {
  const surface = createSurface(512, 256);
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const offset = (y * surface.width + x) * 4;
      const cloud =
        Math.sin(x * 0.083 + Math.sin(y * 0.037) * 3) + Math.cos(y * 0.12 - x * 0.021) + Math.sin((x + y) * 0.047);
      const density = Math.max(0, Math.min(1, (cloud + 0.35) * 0.38));
      writePixel(surface, offset, 36 + density * 210, 46 + density * 205, 68 + density * 187, 255);
    }
  }
  copySurfaceLongitudeSeam(surface);
  return surface;
}

function copySurfaceLongitudeSeam(surface: Surface): void {
  for (let y = 0; y < surface.height; y++) {
    const firstOffset = y * surface.width * 4;
    const lastOffset = (y * surface.width + surface.width - 1) * 4;
    surface.data[lastOffset] = surface.data[firstOffset];
    surface.data[lastOffset + 1] = surface.data[firstOffset + 1];
    surface.data[lastOffset + 2] = surface.data[firstOffset + 2];
    surface.data[lastOffset + 3] = surface.data[firstOffset + 3];
  }
}

function createStarFace(face: number): Surface {
  const surface = createSurface(128, 128, 0x030712ff);
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const offset = (y * surface.width + x) * 4;
      const starHash = (x * 67 + y * 131 + face * 193) % 1531;
      if (starHash < 5) {
        const brightness = starHash < 2 ? 255 : 175;
        writePixel(surface, offset, brightness, brightness, Math.min(255, brightness + 24), 255);
      } else {
        surface.data[offset + 2] += Math.round(10 * Math.max(0, Math.sin(x * 0.031 + face)));
      }
    }
  }
  return surface;
}

function writePixel(surface: Surface, offset: number, r: number, g: number, b: number, a: number): void {
  surface.data[offset] = r;
  surface.data[offset + 1] = g;
  surface.data[offset + 2] = b;
  surface.data[offset + 3] = a;
}

const starCube = createCubeTexture();
for (let face = 0; face < 6; face++) {
  setCubeTextureFace(starCube, face, createStarFace(face));
}
const environment = createEnvironment({ environment: starCube, intensity: 0.75 });

const longitudeSampler = createSampler({ wrapU: 'repeat' });
const earthTexture = createTexture({ image: createEarthSurface(), sampler: longitudeSampler });
const cloudTexture = createTexture({ image: createCloudSurface(), sampler: longitudeSampler });
const scene = createSceneNode(SceneNodeKind);

const earth = createMesh(createSphereMeshGeometry(1.55, 72, 48), [
  createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: earthTexture,
    emissive: 0xffffffff,
    emissiveMap: earthTexture,
    emissiveStrength: 0.72,
    metallic: 0,
    roughness: 0.62,
  }),
]);
addNodeChild(scene, earth);

const clouds = createMesh(createSphereMeshGeometry(1.59, 72, 48), [
  createStandardPbrMaterial({
    alphaMode: 'blend',
    baseColor: 0xffffffff,
    baseColorMap: cloudTexture,
    doubleSided: true,
    emissive: 0xb8cee8ff,
    emissiveStrength: 0.02,
    metallic: 0,
    roughness: 0.9,
  }),
]);
clouds.alpha = 0.24;
addNodeChild(scene, clouds);

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 3.1 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0.22,
  distance: 5.1,
  polar: 0.18,
  smoothTime: 0.14,
  target: createVector3(0, 0, 0),
});
const sun = createPointLight({
  color: 0xffe6b0ff,
  intensity: 72,
  position: createVector3(4.5, 1.8, 3.4),
  range: 14,
});
const lights: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0x6688b8ff, intensity: 0.42 }),
  directional: null,
  point: [sun],
};

let previousTime = performance.now();
let earthAngle = 0;
let cloudAngle = 0;
const axialTilt = -0.28;

function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  orbitCameraController(cameraController, deltaTime * 0.045, 0);
  updateOrbitCameraController(cameraController, camera, deltaTime);

  earthAngle += deltaTime * 0.1;
  cloudAngle += deltaTime * 0.125;
  setQuaternionFromEuler(earth.rotation, axialTilt, earthAngle, 0, 'ZXY');
  setQuaternionFromEuler(clouds.rotation, axialTilt, cloudAngle, 0, 'ZXY');
  invalidateNodeLocalTransform(earth);
  invalidateNodeLocalTransform(clouds);

  render(scene, camera, lights, environment);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
