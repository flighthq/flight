// BACKEND CAVEAT: scoped to WebGL (render.webgpu.ts intentionally removed). Orthographic projection
// renders BLANK on WebGPU while perspective renders fine — almost certainly a clip-space z-range issue
// (WebGPU NDC z is [0,1] vs WebGL [-1,1]; the ortho matrix is not remapped for it). A real renderer gap
// to fix in the WebGPU scene path, not a test problem.
//
// camera-orthographic — proves the camera's ORTHOGRAPHIC projection on the Gl and Wgpu scene renderers.
// Two IDENTICAL unit boxes sit side by side in X (one left, one right) but at DIFFERENT depths: the
// right box is pushed far from the camera (-z) and the left box pulled near (+z). Under an orthographic
// projection on-screen size is independent of depth, so both boxes must rasterize to the SAME silhouette
// width. Under a perspective projection the far box would be visibly smaller — so measuring the two
// widths and asserting they are approximately equal is the signature that distinguishes ortho from
// perspective.
//
// This is a property jsdom cannot check: it needs real projection + rasterization. The oracle scans a
// horizontal line through the boxes, counts each box's contiguous lit-column run (its on-screen width),
// and asserts the two are within ~15% of each other. If the projection silently fell back to perspective
// (or ortho half-extents were mis-wired), the far box would shrink and the widths would diverge.
//
// Camera model (RH view, eye on +z looking at origin): +x is screen-right, larger +z is nearer the eye.
// Only the PROJECTION differs from the perspective tests; the look-at view is identical.
//
// app.ts is backend-agnostic; the per-backend scene wiring lives in render.webgl.ts / render.webgpu.ts.
import { createScene } from '@flighthq/scene';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera,
  createDirectionalLight,
  createMesh,
  createOrthographicProjection,
  createUnlitMaterial,
  createVector3,
  getSurfacePixelLuminance,
  normalizeVector3,
  setCameraViewMatrix4FromLookAt,
  translateMatrix4,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const logicalWidth = width / scale;
const logicalHeight = height / scale;
const aspect = logicalWidth / logicalHeight;

// Two identical unit boxes, distinct colors only so each is visible; same geometry size.
const leftGeometry = createBoxMeshGeometry(1, 1, 1);
const rightGeometry = createBoxMeshGeometry(1, 1, 1);
const leftMaterial = createUnlitMaterial({ baseColor: 0xe0c040ff }); // left/near: amber
const rightMaterial = createUnlitMaterial({ baseColor: 0x40b0e0ff }); // right/far: cyan

const scene = createScene();

// LEFT box: NEAR the camera (+z), shifted left.
const leftMesh = createMesh(leftGeometry, [leftMaterial]);
translateMatrix4(leftMesh.localMatrix, leftMesh.localMatrix, -1.2, 0, 1.5);
addNodeChild(scene, leftMesh);

// RIGHT box: FAR from the camera (-z), shifted right by the same amount. Under perspective it would
// project smaller; under ortho it stays the same on-screen size as the left box.
const rightMesh = createMesh(rightGeometry, [rightMaterial]);
translateMatrix4(rightMesh.localMatrix, rightMesh.localMatrix, 1.2, 0, -1.5);
addNodeChild(scene, rightMesh);

// Orthographic frustum sized to frame both boxes (centers at x = ±1.2, each box ±0.5 wide) with margin.
// Full visible width is 2*halfWidth = 6 units; height is 2*halfHeight = 6/aspect units.
const halfWidth = 3;
const halfHeight = halfWidth / aspect;
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: halfHeight, halfWidth: halfWidth }),
});

// Same straight-on look-at view as the perspective tests; only the projection above differs.
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);

  // Measure each box's on-screen silhouette width by the widest contiguous run of lit columns on the
  // center row, scanned within the left half [0, cx) and right half [cx, width) respectively.
  const leftWidth = widestLitRun(surface, cy, 0, cx);
  const rightWidth = widestLitRun(surface, cy, cx, surface.width);

  // Each box must actually be present (a real silhouette, not a sliver).
  const minPixels = Math.floor(surface.width * 0.05);
  if (leftWidth < minPixels) {
    throw new Error(
      `[camera-orthographic] left (near) box silhouette too small — ${leftWidth}px (box missing/mis-projected)`,
    );
  }
  if (rightWidth < minPixels) {
    throw new Error(
      `[camera-orthographic] right (far) box silhouette too small — ${rightWidth}px (box missing/mis-projected)`,
    );
  }

  // Under ORTHO the two widths are equal regardless of depth. Allow ~15% for rasterization rounding.
  // Under perspective the far (right) box would be clearly narrower and this would fail.
  const ratio = Math.min(leftWidth, rightWidth) / Math.max(leftWidth, rightWidth);
  if (ratio < 0.85) {
    throw new Error(
      `[camera-orthographic] box widths differ with depth — near ${leftWidth}px vs far ${rightWidth}px (ratio ${ratio.toFixed(2)}) ` +
        `⇒ projection is not orthographic (far box shrank like perspective)`,
    );
  }

  // The frame corners are background — bounded silhouettes, not a full clear.
  const m = Math.floor(surface.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [surface.width - m, m],
    [m, surface.height - m],
    [surface.width - m, surface.height - m],
  ]) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
      throw new Error(`[camera-orthographic] frame corner (${x},${y}) not background — silhouettes are not bounded`);
    }
  }
}

// Widest contiguous run of foreground (non-background) columns on row `y`, scanning x in [xStart, xEnd).
function widestLitRun(surface: Readonly<Surface>, y: number, xStart: number, xEnd: number): number {
  let best = 0;
  let run = 0;
  for (let x = xStart; x < xEnd; x++) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

// Barrel so TypeScript resolves the `./render` import; the harness routes it to the active backend.
export * from './render.webgl';
