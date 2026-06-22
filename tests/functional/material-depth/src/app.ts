// material-depth — proves a DepthMaterial mesh renders as a VIEW-DEPTH GRADIENT on the Gl and Wgpu
// forward renderers, independent of scene lighting. A single sphere sits at the origin; DepthMaterial
// ignores lighting entirely and outputs eye-depth (remapped through near/far) as grayscale. The camera
// sits at z=3 looking at the origin and the sphere has radius 0.5, so its surface spans eye-depth ~2.5
// (the nearest point, dead center, pointing at the camera) to ~3.5 (the silhouette, farther away).
// near/far are deliberately set to { near: 2, far: 4 } to BRACKET that 2.5..3.5 band so the depth
// remap lands mid-gradient and the sphere reads as a visible near→far ramp rather than being crushed
// to a flat black or white fill.
//
// The signature this oracle checks: the center pixel (nearest surface) is clearly different in
// brightness from an on-sphere offset pixel (farther surface). A flat/uniform fill — the failure mode
// if depth were not being written — would show no such difference.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.
import { createScene } from '@flighthq/scene';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createCamera,
  createDepthMaterial,
  createDirectionalLight,
  createMesh,
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

// A smooth unit sphere at the origin. Many segments so the depth gradient is a clean ramp, not faceted.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Depth output remapped through near=2 / far=4. The sphere surface spans eye-depth ~2.5..3.5 (camera at
// z=3, radius 0.5), so this range brackets it and the gradient stays visible rather than crushed.
const material = createDepthMaterial({ near: 2, far: 4 });

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

// The same directional + ambient rig as material-standard-pbr. DepthMaterial ignores both — they are
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

// Oracle: not blank + a depth gradient exists. Sample the center (nearest surface point) and an
// on-sphere offset point (farther surface point); assert the center is not blank and that the two
// differ — proof of a near→far depth ramp rather than a flat fill.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  // A small inset keeps the offset point on the sphere surface (farther from the camera than center).
  const offsetX = Math.floor(surface.width * 0.06);

  const center = getSurfacePixelLuminance(surface, cx, cy);
  const offset = getSurfacePixelLuminance(surface, cx + offsetX, cy);

  if (center <= 16) {
    throw new Error(`[material-depth] surface is blank (center luminance ${center}) — mesh did not render`);
  }
  if (Math.abs(center - offset) <= 16) {
    throw new Error(
      `[material-depth] no depth gradient: center (${center}) and offset (${offset}) are nearly equal — depth appears to be a flat fill`,
    );
  }
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
export * from './render.webgl';
