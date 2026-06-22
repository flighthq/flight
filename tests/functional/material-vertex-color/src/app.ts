// material-vertex-color — proves a VertexColorMaterial mesh renders as a FLAT, UNSHADED surface on the
// Gl and Wgpu forward renderers, independent of scene lighting. A single vertex-color sphere sits at the
// origin under the SAME directional + ambient rig as material-standard-pbr — but because VertexColor is
// lighting-independent, the surface must read as a flat, bright, roughly UNIFORM color with no light/dark
// gradient across it. That uniformity (despite a strong angled directional light) is the signature that
// separates an unshaded material from a shaded one: a PBR sphere under this rig has a clear bright/shadow
// split (see material-standard-pbr), while VertexColor does not.
//
// NOTE: the sphere geometry carries no per-vertex color0 attribute, so VertexColor falls back to its
// tint alone and renders a flat tinted surface (documented gap — full per-vertex color needs a mesh with
// a color0 attribute, deferred).
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
  createVertexColorMaterial,
  getSurfacePixelLuminance,
  normalizeVector3,
  setCameraViewMatrix4FromLookAt,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so a (hypothetical) shading gradient would read
// cleanly — the point is that VertexColor shows none.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// A flat blue tint. With no per-vertex color0 attribute on the geometry, VertexColor emits this tint
// directly to the rgba16f scene target, ignoring all lights and surface normals.
const material = createVertexColorMaterial({ tint: 0x40a0e0ff });

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

// The same strong angled sun + ambient fill as material-standard-pbr. VertexColor ignores both, so this
// rig is here precisely to prove the surface does NOT respond to it.
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

// Oracle: the surface is bright (the tint emits directly) AND uniform (lighting-independent). Sample the
// center plus the two points material-standard-pbr uses for its lit/shadow split. For VertexColor all
// three must be bright, and the "lit" and "shadow" samples must be close — a shaded material differs
// sharply.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.075);

  const center = getSurfacePixelLuminance(surface, cx, cy);
  const right = getSurfacePixelLuminance(surface, cx + offset, cy);
  const left = getSurfacePixelLuminance(surface, cx - offset, cy);

  if (center <= 24) {
    throw new Error(`[material-vertex-color] surface is blank (center luminance ${center}) — mesh did not render`);
  }
  // Lighting-independent: the two flanking samples must be within a small margin of each other (no
  // directional gradient). A shaded sphere under this rig splits these by 50+ luminance.
  if (Math.abs(right - left) > 24) {
    throw new Error(
      `[material-vertex-color] vertex-color surface is not uniform: left (${left}) vs right (${right}) differ — it appears to be responding to the directional light`,
    );
  }
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
export * from './render.webgl';
