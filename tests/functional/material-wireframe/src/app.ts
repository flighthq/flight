// material-wireframe — proves a WireframeMaterial mesh renders only its triangle EDGES as lines on the
// Gl and Wgpu forward renderers, independent of scene lighting. A single sphere sits at the origin;
// WireframeMaterial ignores lighting and draws each triangle's edges as 1px lines in a solid color,
// leaving the triangle interiors empty (background). The result is a mesh of bright lines over the dark
// background — NOT a solid filled disk.
//
// thickness > 1 is unsupported (the backends draw 1px lines), so the wireframe reads as thin bright
// strokes separated by dark interior pixels.
//
// The signature this oracle checks: scanning a horizontal row across the sphere, SOME samples are bright
// (lines render) but NOT ALL are bright (it is edges, not a solid fill). A solid fill — the failure mode
// if the material drew filled triangles — would make every sample bright; a blank surface would make
// none bright.
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
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  createWireframeMaterial,
  getSurfacePixelLuminance,
  normalizeVector3,
  setCameraViewMatrix4FromLookAt,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so the wireframe shows many thin edges across the
// row the oracle scans (dense bright lines separated by dark interiors).
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// White edges, 1px thick (thickness > 1 is unsupported; the backends draw 1px lines). Lighting-independent.
const material = createWireframeMaterial({ color: 0xffffffff });

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

// The same directional + ambient rig as material-standard-pbr. WireframeMaterial ignores both — they are
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

// Oracle: edges render, but it is not a solid fill. Scan the center horizontal row across the sphere
// and count "bright" samples (luminance > 40). Assert at least one is bright (lines render) and not
// every sample is bright (dark triangle interiors remain) — the signature of a wireframe, not a fill.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  // The sphere is ~width * 0.13 in screen radius; scan the row across its full width.
  const r = Math.floor(surface.width * 0.13);

  let brightCount = 0;
  let sampleCount = 0;
  for (let x = cx - r; x <= cx + r; x += 2) {
    sampleCount++;
    if (getSurfacePixelLuminance(surface, x, cy) > 40) {
      brightCount++;
    }
  }

  if (brightCount === 0) {
    throw new Error(
      `[material-wireframe] no bright samples across the sphere row (of ${sampleCount}) — wireframe lines did not render`,
    );
  }
  if (brightCount === sampleCount) {
    throw new Error(
      `[material-wireframe] every sample across the row is bright (${brightCount}/${sampleCount}) — surface appears to be a solid fill, not edges`,
    );
  }
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
export * from './render.webgl';
