import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createCylinderMeshGeometry,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  registerGlUnlitMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with an unlit violet (0x9050e0) cylinder (radius 0.6, height 1.4) viewed from a slight side angle (eye at 1.6, 0.4, 2.6). The tangent silhouette spans x 0.315*W–0.685*W ≈ 252–548, y 0.19*H–0.86*H ≈ 114–517 — a tall vertically-extended shape with straight sides and no taper, both top and bottom full-width. No shading gradient — the material is unlit. Frame corners are background.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  }),
  {
    pixelRatio,
    backgroundColor: 0x0a0c10ff,
  },
);
registerGlUnlitMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  // renderGlBackground clears color; the depth attachment needs its own clear to the far plane (1.0)
  // or every fragment fails the LESS depth test against an uncleared (0) buffer and the scene is black.
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// mesh-cylinder — proves the CYLINDER geometry builder (createCylinderMeshGeometry) projects and
// rasterizes a tall solid of revolution on the Gl and Wgpu scene renderers, independent of shading.
// A cylinder with equal top/bottom radii 0.6 and height 1.4 sits at the origin, spanning Y
// -0.7..+0.7. Viewed from a slight side angle (eye at (1.6, 0.4, 2.6)) it reads as a vertically
// extended capsule/rectangle silhouette: tall body, straight sides, no taper. An UnlitMaterial
// (flat color, lighting-independent) keeps the test about geometry, not shading.
//
// Beyond the standard center-covered / corners-background silhouette, this adds a VERTICAL-EXTENT
// check: top-center and bottom-center of the body are both on the cylinder (color), confirming a
// tall body rather than a flat disc, while the left/right far frame corners stay background. Unlike
// the cone, both top and bottom are full-width — the absence of taper is the cylinder's signature.
//
// app.ts is backend-agnostic; the per-backend scene wiring (effect pipeline, depth, unlit material
// registration) lives in render.webgl.ts / render.webgpu.ts (copied from material-unlit).

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A cylinder (radius 0.6, height 1.4) at the origin, flat-violet and unlit so the test reads geometry.
const geometry = createCylinderMeshGeometry(0.6, 0.6, 1.4);
const material = createUnlitMaterial({ baseColor: 0x9050e0ff });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// A slight side angle, eye held low so the tall body fills vertically rather than showing mostly the
// top cap — the vertical extent is what distinguishes a cylinder from a disc.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(1.6, 0.4, 2.6), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Unlit ignores lights, but render() requires a valid rig.
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

  // 1) The cylinder covers the frame center with its flat violet surface (geometry rasterized where
  //    the projection places it).
  const center = getBitmapPixelRgb(bitmap, cx, cy);
  if (!isViolet(center)) {
    throw new Error(
      `[mesh-cylinder] cylinder center not the unlit violet — got #${hex(center)} (cylinder missing or mis-projected)`,
    );
  }

  // 2) A small ring around center is also on the cylinder body (a solid, not a sliver).
  const r = Math.floor(bitmap.width * 0.05);
  for (const [dx, dy] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    if (getBitmapPixelLuminance(bitmap, cx + dx, cy + dy) <= 30) {
      throw new Error(
        `[mesh-cylinder] cylinder does not fill around center at (${dx},${dy}) — silhouette too small/offset`,
      );
    }
  }

  // 3) Vertical-extent signature: top-center and bottom-center of the body are both on the cylinder,
  //    confirming a tall body (not a flat disc). Lenient offset keeps this robust to view shifts.
  const vy = Math.floor(bitmap.width * 0.14);
  if (getBitmapPixelLuminance(bitmap, cx, cy - vy) <= 30) {
    throw new Error(
      `[mesh-cylinder] top-center body sample is background — cylinder not tall (vertical-extent check failed)`,
    );
  }
  if (getBitmapPixelLuminance(bitmap, cx, cy + vy) <= 30) {
    throw new Error(
      `[mesh-cylinder] bottom-center body sample is background — cylinder not tall (vertical-extent check failed)`,
    );
  }

  // 4) The four frame corners are background (a bounded silhouette, not a full-screen clear).
  const m = Math.floor(bitmap.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [bitmap.width - m, m],
    [m, bitmap.height - m],
    [bitmap.width - m, bitmap.height - m],
  ]) {
    if (getBitmapPixelLuminance(bitmap, x, y) > 40) {
      throw new Error(`[mesh-cylinder] frame corner (${x},${y}) not background — cylinder silhouette is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isViolet(rgb: number): boolean {
  // 0x9050e0: strong blue, mid red, low-mid green — blue the dominant channel, red above green.
  return channel(rgb, 0) > 120 && channel(rgb, 0) > channel(rgb, 8) + 40 && channel(rgb, 0) > channel(rgb, 16);
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
