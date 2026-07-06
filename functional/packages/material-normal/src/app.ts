// material-normal — proves a NormalMaterial mesh renders its WORLD-SPACE surface normal as color on the
// Gl and Wgpu forward renderers, independent of scene lighting. A single sphere sits at the origin;
// NormalMaterial ignores lighting and encodes the world normal directly as RGB (n * 0.5 + 0.5), so each
// point on the sphere — whose normal points radially outward — maps to a distinct color. The
// front-center normal points straight at the camera (+z), while off-center normals tilt toward +x / +y,
// so the encoded color (and its luminance) changes across the surface.
//
// The signature this oracle checks: the center pixel and an on-sphere offset pixel encode different
// normals, so they differ in color/luminance. A flat/uniform fill — the failure mode if the normal were
// not being written — would show no such difference. Normals are WORLD-space, so the encoding is fixed
// by sphere orientation, not by the camera.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.
import { createScene } from '@flighthq/scene';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createCamera,
  createDirectionalLight,
  createMesh,
  createNormalMaterial,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  getSurfacePixelLuminance,
  normalizeVector3,
  setCameraViewMatrix4FromLookAt,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so the normal-encoded color varies cleanly across
// the surface rather than in coarse facets.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Encodes the world-space surface normal as color (n * 0.5 + 0.5). Lighting-independent.
const material = createNormalMaterial();

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the sphere from +z, looking at the origin. Aspect matches the target so
// the sphere stays circular.
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// The same directional + ambient rig as material-standard-pbr. NormalMaterial ignores both — they are
// passed through unused so the scaffold matches the lit materials.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
};

render(scene, camera, lights);

// Oracle: not blank + orientation-varying color. Sample the center (normal facing the camera) and an
// on-sphere offset point (a tilted normal); assert the center is not blank and that the two differ —
// proof that color tracks the world normal rather than being a flat fill.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  // A small inset keeps the offset point on the sphere surface, where the normal tilts away from +z.
  const offsetX = Math.floor(surface.width * 0.07);

  const center = getSurfacePixelLuminance(surface, cx, cy);
  const offset = getSurfacePixelLuminance(surface, cx + offsetX, cy);

  if (center <= 16) {
    throw new Error(`[material-normal] surface is blank (center luminance ${center}) — mesh did not render`);
  }
  if (Math.abs(center - offset) <= 12) {
    throw new Error(
      `[material-normal] no normal variation: center (${center}) and offset (${offset}) are nearly equal — color appears to be a flat fill, not the world normal`,
    );
  }
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
export * from './render.webgl';
