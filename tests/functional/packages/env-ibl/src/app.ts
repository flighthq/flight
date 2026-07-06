// env-ibl — proves the image-based-lighting bake on the Gl backend: a procedural radiance cubemap is
// baked (bakeEnvironmentIbl) into a diffuse irradiance cubemap + prefiltered specular cubemap + BRDF
// LUT, and two PBR spheres are lit *purely* by that environment (no punctual lights). The left sphere
// is a smooth metal — specular IBL, so it mirrors the surrounding face colors; the right sphere is a
// rough dielectric — diffuse IBL, so it takes on a soft tint of the environment. The oracle asserts
// both spheres are lit (not black, which is what an unbaked / unbound IBL would leave them) and that
// the mirror metal shows color variation from the reflected faces.
import { createScene } from '@flighthq/scene';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createCamera,
  createCubeTexture,
  createEnvironment,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  getSurfacePixel,
  getSurfacePixelLuminance,
  setCameraViewMatrix4FromLookAt,
  setCubeTextureFace,
  setSceneNodePosition,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Six bright, distinct faces (+X, -X, +Y, -Y, +Z, -Z) so reflections and tints are unmistakable.
const FACE_COLORS: readonly string[] = ['#ff3030', '#30ff30', '#f0f0f0', '#505060', '#3030ff', '#ffe030'];
const cube = createCubeTexture();
for (let face = 0; face < 6; face++) {
  setCubeTextureFace(cube, face, createImageResourceFromCanvas(solidFaceCanvas(FACE_COLORS[face])));
}
const environment = createEnvironment({ environment: cube, intensity: 1 });

const scene = createScene();

// Left: smooth metal — specular IBL reflects the environment.
const metal = createMesh(createSphereMeshGeometry(0.9, 48, 32), [
  createStandardPbrMaterial({ baseColor: 0xffffffff, metallic: 1, roughness: 0.06 }),
]);
setSceneNodePosition(metal, -1.15, 0, 0);
addNodeChild(scene, metal);

// Right: rough dielectric — diffuse IBL tints it with the environment irradiance.
const rough = createMesh(createSphereMeshGeometry(0.9, 48, 32), [
  createStandardPbrMaterial({ baseColor: 0xb0b0b0ff, metallic: 0, roughness: 0.65 }),
]);
setSceneNodePosition(rough, 1.15, 0, 0);
addNodeChild(scene, rough);

const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 3.4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 4.6), createVector3(0, 0, 0), createVector3(0, 1, 0));

// No punctual lights — the spheres are lit only by the baked environment.
const lights = { ambient: null, directional: null };

render(scene, camera, lights, environment);

export function assertRender(surface: Readonly<Surface>): void {
  const metalX = Math.floor(surface.width * 0.32);
  const roughX = Math.floor(surface.width * 0.68);
  const cy = Math.floor(surface.height * 0.5);

  const metalLum = getSurfacePixelLuminance(surface, metalX, cy);
  const roughLum = getSurfacePixelLuminance(surface, roughX, cy);

  if (metalLum <= 24) {
    throw new Error(`[env-ibl] metal sphere is unlit (luminance ${metalLum}) — specular IBL not applied`);
  }
  if (roughLum <= 24) {
    throw new Error(`[env-ibl] rough sphere is unlit (luminance ${roughLum}) — diffuse IBL not applied`);
  }

  // The mirror metal must show the reflected environment's color — sample a band across it and require
  // the reflected color to vary (a flat unlit/constant sphere would not).
  const a = getSurfacePixel(surface, Math.floor(surface.width * 0.27), cy);
  const b = getSurfacePixel(surface, Math.floor(surface.width * 0.37), Math.floor(surface.height * 0.4));
  if (sameColor(a, b)) {
    throw new Error(`[env-ibl] metal sphere shows no reflection variation (${hex(a)} vs ${hex(b)})`);
  }
}

function solidFaceCanvas(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 8);
  return canvas;
}

function sameColor(a: number, b: number): boolean {
  const dr = Math.abs(((a >>> 24) & 0xff) - ((b >>> 24) & 0xff));
  const dg = Math.abs(((a >>> 16) & 0xff) - ((b >>> 16) & 0xff));
  const db = Math.abs(((a >>> 8) & 0xff) - ((b >>> 8) & 0xff));
  return dr < 24 && dg < 24 && db < 24;
}

function hex(px: number): string {
  return `#${(px >>> 8).toString(16).padStart(6, '0')}`;
}
