// mesh-hierarchy-parent-transform — proves the scene hierarchy composes a PARENT node's transform onto
// its CHILD mesh's world matrix on the Gl and Wgpu scene renderers. A transform-only parent SceneNode
// is translated up-and-right by (+1.3, +0.7, 0); a child mesh sits at the parent's LOCAL origin (its
// own localMatrix is identity). Because the renderer resolves each mesh's world matrix as
// parentWorld × localMatrix, the child must render at the PARENT-translated position (upper-right of the
// frame), NOT at the frame center.
//
// This is the visual signature of correct hierarchy composition: with the parent transform applied the
// child is up-and-right and the center is background; if parent transforms were IGNORED the child would
// render dead-center instead. The oracle asserts exactly that split (center = background, upper-right =
// child color), so it fails loudly if hierarchy composition regresses.
//
// Camera model (RH view, eye on +z looking at origin): +x is screen-right, +y is screen-up.
//
// app.ts is backend-agnostic; the per-backend scene wiring lives in render.webgl.ts / render.webgpu.ts.
import { createScene, createSceneNode } from '@flighthq/scene';
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

const geometry = createBoxMeshGeometry(1, 1, 1);
const material = createUnlitMaterial({ baseColor: 0x40e080ff }); // child: green

const scene = createScene();

// Transform-only parent: translated up-and-right. The child inherits this through world composition.
const parent = createSceneNode();
translateMatrix4(parent.localMatrix, parent.localMatrix, 1.3, 0.7, 0);
addNodeChild(scene, parent);

// Child mesh at the parent's LOCAL origin (identity localMatrix). Its on-screen position is entirely
// due to the parent's world transform — that is what this test isolates.
const mesh = createMesh(geometry, [material]);
addNodeChild(parent, mesh);

// Straight-on view from +z so the parent's (x,y) translation maps directly to screen (right, up).
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
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

  // 1) The frame CENTER is background. If the parent transform were ignored the child would be here.
  if (getSurfacePixelLuminance(surface, cx, cy) > 40) {
    throw new Error(
      `[mesh-hierarchy-parent-transform] frame center is not background — child rendered at origin ` +
        `⇒ parent transform NOT composed onto child`,
    );
  }

  // 2) The child sits in the UPPER-RIGHT quadrant, where the parent's (+x,+y) translation projects.
  //    Offsets are conservative fractions of the frame so the sample lands inside the projected box.
  const ox = Math.floor(surface.width * 0.28);
  const oy = Math.floor(surface.height * 0.22);
  const childPoint = getSurfacePixelRgb(surface, cx + ox, cy - oy);
  if (!isGreen(childPoint)) {
    throw new Error(
      `[mesh-hierarchy-parent-transform] upper-right sample not the child green — got #${hex(childPoint)} ` +
        `(child not at parent-translated position)`,
    );
  }

  // 3) The opposite (lower-left) quadrant is background — the child is a bounded silhouette up-right,
  //    not filling the frame.
  if (getSurfacePixelLuminance(surface, cx - ox, cy + oy) > 40) {
    throw new Error(
      `[mesh-hierarchy-parent-transform] lower-left not background — child silhouette is not bounded/offset`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isGreen(rgb: number): boolean {
  // 0x40e080: green dominant over both red and blue.
  return channel(rgb, 8) > 150 && channel(rgb, 8) > channel(rgb, 16) + 60 && channel(rgb, 8) > channel(rgb, 0) + 40;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

// Barrel so TypeScript resolves the `./render` import; the harness routes it to the active backend.
export * from './render.webgl';
