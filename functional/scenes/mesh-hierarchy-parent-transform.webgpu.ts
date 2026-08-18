import { createScene3D, createNode3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMatrix4,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
  submitWgpuRenderPass,
  translateMatrix4,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with an unlit green (0x40e080) unit cube rendered off-center in the upper-right area, its front face at depth 3.5, scale s = H/(7*tan(PI/8)) ≈ 207 px/unit, spanning x W/2 + 0.8*s to W/2 + 1.8*s ≈ 566–772, y H/2 − 1.2*s to H/2 − 0.2*s ≈ 52–259, centered near (W/2 + 1.3*s, H/2 − 0.7*s) ≈ (669, 156). The mesh position comes entirely from its parent node translation — the child local transform is identity. The frame center and lower-left quadrant are background.',
);

// drawWgpuScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same unlit cube as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (the Unlit renderer writes into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerWgpuUnlitMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// mesh-hierarchy-parent-transform — proves the scene hierarchy composes a PARENT node's transform onto
// its CHILD mesh's world matrix on the Gl and Wgpu scene renderers. A transform-only parent Node3D
// is translated up-and-right by (+1.3, +0.7, 0); a child mesh sits at the parent's LOCAL origin (its
// own localMatrix is identity). Because the renderer resolves each mesh's world matrix as
// parentWorld × localMatrix, the child must render at the PARENT-translated position (upper-right of the
// frame), NOT at the frame center.
//
// This is the visual signature of correct hierarchy composition: with the parent transform applied the
// child is up-and-right and the center is background; if parent transforms were IGNORED the child would
// render dead-center instead. The assertion confirms exactly that split (center = background, upper-right =
// child color), so it fails loudly if hierarchy composition regresses.
//
// Camera3D model (RH view, eye on +z looking at origin): +x is screen-right, +y is screen-up.
//
// app.ts is backend-agnostic; the per-backend scene wiring lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);
const material = createUnlitMaterial({ baseColor: 0x40e080ff }); // child: green

const scene = createScene3D().root;

// Transform-only parent: translated up-and-right. The child inherits this through world composition.
const parent = createNode3D();
const parentLocal = createMatrix4();
translateMatrix4(parentLocal, parentLocal, 1.3, 0.7, 0);
setNodeLocalMatrix4(parent, parentLocal);
addNodeChild(scene, parent);

// Child mesh at the parent's LOCAL origin (identity localMatrix). Its on-screen position is entirely
// due to the parent's world transform — that is what this test isolates.
const mesh = createMesh(geometry, [material]);
addNodeChild(parent, mesh);

// Straight-on view from +z so the parent's (x,y) translation maps directly to screen (right, up).
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);

  // 1) The frame CENTER is background. If the parent transform were ignored the child would be here.
  if (getBitmapPixelLuminance(bitmap, cx, cy) > 40) {
    throw new Error(
      `[mesh-hierarchy-parent-transform] frame center is not background — child rendered at origin ` +
        `⇒ parent transform NOT composed onto child`,
    );
  }

  // 2) The child sits in the UPPER-RIGHT quadrant, where the parent's (+x,+y) translation projects.
  //    Offsets are conservative fractions of the frame so the sample lands inside the projected box.
  const ox = Math.floor(bitmap.width * 0.28);
  const oy = Math.floor(bitmap.height * 0.22);
  const childPoint = getBitmapPixelRgb(bitmap, cx + ox, cy - oy);
  if (!isGreen(childPoint)) {
    throw new Error(
      `[mesh-hierarchy-parent-transform] upper-right sample not the child green — got #${hex(childPoint)} ` +
        `(child not at parent-translated position)`,
    );
  }

  // 3) The opposite (lower-left) quadrant is background — the child is a bounded silhouette up-right,
  //    not filling the frame.
  if (getBitmapPixelLuminance(bitmap, cx - ox, cy + oy) > 40) {
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
