// mesh-multiple-depth — proves DEPTH-BUFFER OCCLUSION across two separate meshes on the Gl and Wgpu
// scene renderers. Two unlit boxes of distinct colors are placed so their screen projections OVERLAP
// in a known region, one NEAR the camera and one FAR behind it. Because the scene wiring enables a
// depth-stencil test, the NEAR box must win the overlap: every pixel in the overlap region is the near
// box's color, and the far box only shows where the near box does not cover it.
//
// This is a visual property jsdom cannot check: it requires real rasterization with a depth test. If
// depth testing is broken (disabled, wrong compare, or the boxes drawn in the wrong order with no
// depth buffer), the far box bleeds through the overlap and the overlap pixel reads as the FAR color —
// exactly the regression this test catches.
//
// Camera model (RH view, eye on +z looking at origin): +x is screen-right, +y is screen-up, and a
// LARGER +z translation moves a mesh TOWARD the eye (nearer). So the near box is translated to +z and
// the far box to -z; their x offsets are chosen to overlap in the middle while each keeps an exclusive
// flank.
//
// app.ts is backend-agnostic; the per-backend scene wiring (effect pipeline, depth-stencil, unlit
// material registration) lives in render.webgl.ts / render.webgpu.ts.
import { createScene } from '@flighthq/scene';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  getSurfacePixelLuminance,
  getSurfacePixelRgb,
  normalizeVector3,
  setCameraViewMatrix4FromLookAt,
  translateMatrix4,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Two unit boxes, distinct flat colors, unlit so the test reads occlusion and not shading.
const nearGeometry = createBoxMeshGeometry(1, 1, 1);
const farGeometry = createBoxMeshGeometry(1, 1, 1);
const nearMaterial = createUnlitMaterial({ baseColor: 0xff3030ff }); // near box: red
const farMaterial = createUnlitMaterial({ baseColor: 0x3060ffff }); // far box: blue

const scene = createScene();

// FAR box: shifted LEFT and pushed to -z (away from the eye). Its right flank reaches into the center.
const farMesh = createMesh(farGeometry, [farMaterial]);
translateMatrix4(farMesh.localMatrix, farMesh.localMatrix, -0.35, 0, -0.6);
addNodeChild(scene, farMesh);

// NEAR box: shifted RIGHT and pulled to +z (toward the eye). Its left flank overlaps the far box's
// right flank around screen center; the depth test must let the near box win that overlap.
const nearMesh = createMesh(nearGeometry, [nearMaterial]);
translateMatrix4(nearMesh.localMatrix, nearMesh.localMatrix, 0.35, 0, 0.6);
addNodeChild(scene, nearMesh);

// Straight-on view from +z so depth maps cleanly to the z translations above. Eye ~ (0,0,4).
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Unlit ignores lights, but render() requires a valid rig.
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
  // Flank offset lands inside each box's EXCLUSIVE region (the boxes are ~1 unit ≈ 0.18*width wide and
  // overlap at center, so each exclusive flank centre is ~0.09*width off-centre).
  const off = Math.floor(surface.width * 0.09);

  // 1) The OVERLAP region (screen center) is the NEAR box's red — the near box occludes the far box.
  //    If depth occlusion is broken the far blue bleeds through here.
  const center = getSurfacePixelRgb(surface, cx, cy);
  if (!isRed(center)) {
    throw new Error(
      `[mesh-multiple-depth] overlap center not the near box red — got #${hex(center)} ` +
        `(far box showing through ⇒ depth occlusion broken)`,
    );
  }

  // 2) The near box's exclusive flank (to the RIGHT of center) is red — the near box really is there.
  const right = getSurfacePixelRgb(surface, cx + off, cy);
  if (!isRed(right)) {
    throw new Error(
      `[mesh-multiple-depth] near-box flank (right) not red — got #${hex(right)} (near box missing/misplaced)`,
    );
  }

  // 3) The far box's exclusive flank (to the LEFT of center, not covered by the near box) is blue —
  //    the far box is drawn, just occluded where the boxes overlap.
  const left = getSurfacePixelRgb(surface, cx - off, cy);
  if (!isBlue(left)) {
    throw new Error(
      `[mesh-multiple-depth] far-box flank (left) not blue — got #${hex(left)} (far box missing or fully hidden)`,
    );
  }

  // 4) The four frame corners are background — the boxes are bounded silhouettes, not a full clear.
  const m = Math.floor(surface.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [surface.width - m, m],
    [m, surface.height - m],
    [surface.width - m, surface.height - m],
  ]) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
      throw new Error(`[mesh-multiple-depth] frame corner (${x},${y}) not background — silhouettes are not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  // 0xff3030: red dominant over both green and blue.
  return channel(rgb, 16) > 150 && channel(rgb, 16) > channel(rgb, 8) + 60 && channel(rgb, 16) > channel(rgb, 0) + 60;
}
function isBlue(rgb: number): boolean {
  // 0x3060ff: blue dominant over both red and green.
  return channel(rgb, 0) > 150 && channel(rgb, 0) > channel(rgb, 16) + 60 && channel(rgb, 0) > channel(rgb, 8) + 40;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

// Barrel so TypeScript resolves the `./render` import; the harness routes it to the active backend.
export * from './render.webgl';
